"""Windows CI transport contracts, including a real redirected-directory probe.

Run with the configured GARAGEOS_DOCKER_WSL_DISTRO for the real WSL regression.
Synthetic input/output files stay outside the checkout and contain no credentials.
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


@unittest.skipUnless(os.name == "nt", "Windows Jenkins transport")
class JenkinsWslTransportTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location(
            "jenkins_runner", Path(__file__).with_name("jenkins_windows_ci.py"))
        self.runner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.runner)

    def test_service_and_probe_do_not_inherit_a_windows_working_directory(self):
        def isolated_call(command, **kwargs):
            # Model WSL's inability to enter a Windows-only redirected cwd.
            safe = "--cd" in command and command[command.index("--cd") + 1] == "/"
            return subprocess.CompletedProcess(command, 0 if safe else 1)

        with patch.dict(os.environ, GARAGEOS_DOCKER_WSL_DISTRO="test-distro"), \
                patch.object(self.runner.subprocess, "run", side_effect=isolated_call) as calls:
            prefix, available = self.runner.docker_environment()
        self.assertTrue(available)
        self.assertEqual(calls.call_count, 2)
        self.assertEqual(prefix[-1], "--exec")

    def test_service_failure_stays_unavailable(self):
        with patch.dict(os.environ, GARAGEOS_DOCKER_WSL_DISTRO="test-distro"), \
                patch.object(self.runner.subprocess, "run",
                             return_value=subprocess.CompletedProcess([], 1)) as calls:
            _, available = self.runner.docker_environment()
        self.assertFalse(available)
        self.assertEqual(calls.call_count, 1)

    def test_daemon_failure_stays_unavailable_after_existing_retry_budget(self):
        results = [subprocess.CompletedProcess([], 0)] + [
            subprocess.CompletedProcess([], 1) for _ in range(6)]
        with patch.dict(os.environ, GARAGEOS_DOCKER_WSL_DISTRO="test-distro"), \
                patch.object(self.runner.subprocess, "run", side_effect=results) as calls, \
                patch.object(self.runner.time, "sleep"):
            _, available = self.runner.docker_environment()
        self.assertFalse(available)
        self.assertEqual(calls.call_count, 7)

    def test_native_docker_probe_is_preserved(self):
        with patch.dict(os.environ, GARAGEOS_DOCKER_WSL_DISTRO=""), \
                patch.object(self.runner.shutil, "which", return_value="docker.exe"), \
                patch.object(self.runner.subprocess, "run",
                             return_value=subprocess.CompletedProcess([], 0)) as calls:
            prefix, available = self.runner.docker_environment()
        self.assertTrue(available)
        self.assertEqual(prefix, [])
        self.assertEqual(calls.call_args.args[0], ["docker.exe", "info"])

    @unittest.skipUnless(os.environ.get("GARAGEOS_DOCKER_WSL_DISTRO"),
                         "requires the configured real WSL distro")
    def test_real_gate_reads_redirected_source_and_writes_physical_output(self):
        parent = Path(os.environ["LOCALAPPDATA"])
        with tempfile.TemporaryDirectory(prefix="garageos-wsl-transport-", dir=parent) as directory:
            root = Path(directory)
            self.assertTrue(root.resolve().is_relative_to(parent.resolve()))
            scripts = root / "garageos/scripts"
            scripts.mkdir(parents=True)
            (scripts / "marker.txt").write_text("transport — Ўзбек", encoding="utf-8")
            (scripts / "probe.py").write_text(
                "from pathlib import Path\nimport argparse\n"
                "p=argparse.ArgumentParser(); p.add_argument('--output'); a=p.parse_args()\n"
                "assert Path.cwd() == Path('/')\n"
                "marker=Path(__file__).with_name('marker.txt').read_text(encoding='utf-8')\n"
                "Path(a.output).write_text(marker,encoding='utf-8')\n"
                "print('real redirected source and output verified')\n", encoding="utf-8")
            evidence = root / "evidence"
            evidence.mkdir()
            output = evidence / "new output — Ўзбек.txt"
            with patch.object(self.runner, "ROOT", root), \
                    patch.object(self.runner, "EVIDENCE", evidence):
                prefix, available = self.runner.docker_environment()
                self.assertTrue(available, "configured WSL Docker must actually respond")
                self.runner.docker_gate(prefix, "probe.py", "transport-probe", output)
            self.assertEqual(output.read_text(encoding="utf-8"), "transport — Ўзбек")
            log = (evidence / "transport-probe.log").read_text(encoding="utf-8")
            self.assertIn("real redirected source and output verified", log)
            self.assertNotIn("ERROR", log)


if __name__ == "__main__":
    unittest.main(verbosity=2)
