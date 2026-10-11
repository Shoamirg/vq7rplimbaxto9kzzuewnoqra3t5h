"""Owned PostgreSQL cleanup contracts for the local Windows Jenkins runner."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


@unittest.skipUnless(os.name == "nt", "Windows Jenkins cleanup")
class JenkinsOwnedCleanupTest(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name("jenkins_windows_ci.py")
        spec = importlib.util.spec_from_file_location("jenkins_cleanup_runner", source)
        self.runner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.runner)

        self.temp = tempfile.TemporaryDirectory(prefix="garageos-jenkins-cleanup-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state_root = self.root / "ci-state"
        self.data = self.state_root / "491" / "pgdata"
        self.data.mkdir(parents=True)
        self.fixture = self.data.parent / "flutter-fixture.json"
        self.browser_fixture = self.data.parent / "browser-fixture.json"
        self.fixture.write_text("owned", encoding="utf-8")
        self.browser_fixture.write_text("owned", encoding="utf-8")
        self.pid_file = self.data / "postmaster.pid"
        self.pid = 22332
        self.born = 1791721275000000000
        self.pid_file.write_text(f"{self.pid}\n", encoding="utf-8")
        self.state_file = self.state_root / "owned.json"
        self.write_state()

        self.runner.ROOT = self.root
        self.runner.WORKSPACE = self.root
        self.runner.STATE_ROOT = self.state_root
        self.runner.STATE = self.state_file
        self.runner.PG = self.root / "postgres" / "bin"
        self.runner.EVIDENCE = self.root / "evidence"
        self.runner.PROCESSES = []
        self.runner.HANDLES = []

    def write_state(self, *, identity=True):
        state = {
            "pgdata": str(self.data),
            "fixture": str(self.fixture),
            "browser_fixture": str(self.browser_fixture),
            "processes": [],
        }
        if identity:
            state.update(postgres_pid=self.pid, postgres_born=self.born)
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(state), encoding="utf-8")

    def assert_preserved_for_retry(self):
        self.assertTrue(self.state_file.exists())
        self.assertTrue(self.pid_file.exists())
        self.assertTrue(self.fixture.exists())
        self.assertTrue(self.browser_fixture.exists())

    def test_running_owned_database_is_stopped_before_fixture_cleanup(self):
        def stop(*_args):
            self.pid_file.unlink()

        with patch.object(self.runner, "postgres_status", return_value="running"), \
                patch.object(self.runner, "process_birth", return_value=self.born), \
                patch.object(self.runner, "run", side_effect=stop) as stop_call:
            self.runner.cleanup()

        self.assertEqual(stop_call.call_count, 1)
        self.assertFalse(self.state_file.exists())
        self.assertFalse(self.fixture.exists())
        self.assertFalse(self.browser_fixture.exists())

    def test_already_stopped_owned_database_removes_only_verified_stale_pid(self):
        self.write_state(identity=False)  # Support state from an older runner version.
        with patch.object(self.runner, "postgres_status", return_value="stopped"), \
                patch.object(self.runner, "process_is_alive", return_value=False), \
                patch.object(self.runner, "run") as stop_call:
            self.runner.cleanup()

        stop_call.assert_not_called()
        self.assertFalse(self.state_file.exists())
        self.assertFalse(self.pid_file.exists())
        self.assertFalse(self.fixture.exists())
        self.assertFalse(self.browser_fixture.exists())

    def test_live_pid_with_stopped_server_preserves_owned_state(self):
        with patch.object(self.runner, "postgres_status", return_value="stopped"), \
                patch.object(self.runner, "process_is_alive", return_value=True):
            with self.assertRaisesRegex(RuntimeError, "PID is live"):
                self.runner.cleanup()
        self.assert_preserved_for_retry()

    def test_unverifiable_pid_with_stopped_server_preserves_owned_state(self):
        with patch.object(self.runner, "postgres_status", return_value="stopped"), \
                patch.object(self.runner, "process_is_alive", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "unverifiable"):
                self.runner.cleanup()
        self.assert_preserved_for_retry()

    def test_ambiguous_postgres_status_preserves_owned_state(self):
        with patch.object(self.runner, "postgres_status",
                          side_effect=RuntimeError("ambiguous status")):
            with self.assertRaisesRegex(RuntimeError, "ambiguous status"):
                self.runner.cleanup()
        self.assert_preserved_for_retry()

    def test_reused_pid_does_not_stop_a_different_process(self):
        with patch.object(self.runner, "postgres_status", return_value="running"), \
                patch.object(self.runner, "process_birth", return_value=self.born + 1), \
                patch.object(self.runner, "run") as stop_call:
            with self.assertRaisesRegex(RuntimeError, "process identity"):
                self.runner.cleanup()
        stop_call.assert_not_called()
        self.assert_preserved_for_retry()

    def test_stop_race_succeeds_only_after_server_and_pid_are_gone(self):
        with patch.object(self.runner, "postgres_status", side_effect=["running", "stopped"]), \
                patch.object(self.runner, "process_birth", return_value=self.born), \
                patch.object(self.runner, "process_is_alive", return_value=False), \
                patch.object(self.runner, "run", side_effect=RuntimeError("stop raced")):
            self.runner.cleanup()
        self.assertFalse(self.state_file.exists())
        self.assertFalse(self.fixture.exists())
        self.assertFalse(self.browser_fixture.exists())

    def test_server_exit_between_status_and_identity_capture_is_rechecked(self):
        with patch.object(self.runner, "postgres_status", side_effect=["running", "stopped"]), \
                patch.object(self.runner, "process_birth", return_value=None), \
                patch.object(self.runner, "process_is_alive", return_value=False), \
                patch.object(self.runner, "run") as stop_call:
            self.runner.cleanup()
        stop_call.assert_not_called()
        self.assertFalse(self.state_file.exists())
        self.assertFalse(self.pid_file.exists())

    def test_pg_ctl_status_accepts_only_known_running_or_stopped_results(self):
        with patch.object(self.runner.subprocess, "run", return_value=subprocess.CompletedProcess(
                [], 0, stdout="pg_ctl: server is running (PID: 22332)")):
            self.assertEqual(self.runner.postgres_status(self.data), "running")
        with patch.object(self.runner.subprocess, "run", return_value=subprocess.CompletedProcess(
                [], 3, stdout="pg_ctl: no server running")):
            self.assertEqual(self.runner.postgres_status(self.data), "stopped")
        with patch.object(self.runner.subprocess, "run", return_value=subprocess.CompletedProcess(
                [], 1, stdout="could not read data directory")):
            with self.assertRaisesRegex(RuntimeError, "Could not determine"):
                self.runner.postgres_status(self.data)

    def test_windows_process_probe_distinguishes_live_and_absent_pids(self):
        self.assertIs(self.runner.process_is_alive(os.getpid()), True)
        self.assertIs(self.runner.process_is_alive(0xFFFFFFFF), False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
