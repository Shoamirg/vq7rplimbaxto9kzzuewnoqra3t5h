"""Filesystem outcomes with SSH/Compose replaced at external boundaries only."""
from __future__ import annotations

from argparse import Namespace
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("production_ops.py")
spec = importlib.util.spec_from_file_location("production_ops", SCRIPT)
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


class BackupOperationsTest(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        root = Path(self.stack.enter_context(tempfile.TemporaryDirectory(prefix="garageos-ops-test-")))
        self.backups = root / "backups"
        self.backups.mkdir()
        self.env = root / "private.env"
        self.env.write_text("POSTGRES_USER=fixture\nPOSTGRES_DB=fixture\n")
        self.key = root / "private-key"
        self.key.write_text("synthetic fixture, not an SSH key")
        self.key.chmod(0o600)
        self.hosts = root / "known_hosts"
        self.hosts.write_text("fixture pinned host")
        self.receipt = root / "status.json"
        self.args = Namespace(env_file=self.env, backup_dir=self.backups,
                              receipt=self.receipt, retention_days=14)
        self.remote = {}
        self.failure = None
        self.commands = []
        self.stack.enter_context(patch.dict(os.environ, {
            "BACKUP_SSH_TARGET": "fixture@backup.example", "BACKUP_SSH_DIRECTORY": "/private/backups",
            "BACKUP_SSH_IDENTITY_FILE": str(self.key), "BACKUP_SSH_KNOWN_HOSTS": str(self.hosts),
        }))
        self.stack.enter_context(patch.object(ops, "execute", side_effect=self.external))

    def external(self, command, *, env=None, timeout=60):
        command = [str(item) for item in command]
        self.commands.append(command)
        if command[0] in ("scp", "ssh"):
            self.assertIn("StrictHostKeyChecking=yes", command)
            self.assertIn("BatchMode=yes", command)
            self.assertIn("IdentitiesOnly=yes", command)
            self.assertIn("IdentityAgent=none", command)
            self.assertIn("GlobalKnownHostsFile=none", command)
            self.assertEqual(command[command.index("-F") + 1], "none")
        if any(item.endswith("production_preflight.py") for item in command):
            ready = "--check-ready" in command
            checks = [{"name": "compose", "ok": True}, {"name": "request_protection", "ok": True}]
            if ready:
                checks.append({"name": "readiness", "ok": True})
            return json.dumps({"ok": True, "readiness_requested": ready, "checks": checks})
        if command[0] == "bash":
            self.assertEqual(env["BACKUP_DEFER_PRUNE"], "1")
            archive = Path(env["BACKUP_DIR"]) / env["BACKUP_OUTPUT_NAME"]
            archive.write_bytes(gzip.compress(b"CREATE TABLE source (id integer);\n"))
            if self.failure == "dump":
                raise subprocess.CalledProcessError(1, command, stderr="private-error-must-not-leak")
        elif command[0] == "scp":
            self.remote[command[-1].split(":", 1)[1]] = Path(command[-2]).read_bytes()
            if self.failure == "copy":
                raise subprocess.CalledProcessError(1, command, stderr="private-error-must-not-leak")
        elif command[0] == "ssh":
            operation = command[-1]
            if "sha256sum" in operation:
                content = next(iter(self.remote.values()))
                digest = "0" * 64 if self.failure == "hash" else hashlib.sha256(content).hexdigest()
                return digest + "  temporary-archive\n"
            if operation.startswith("mv "):
                if self.failure == "publish":
                    raise subprocess.TimeoutExpired(command, timeout, stderr="private-error-must-not-leak")
                source, target = operation.split(" && ", 1)[0].split(" -- ", 1)[1].split()
                self.remote[target] = self.remote.pop(source)
                if self.failure == "published_then_timeout":
                    raise subprocess.TimeoutExpired(command, timeout, stderr="private-error-must-not-leak")
            if operation.startswith("rm "):
                self.remote.pop(operation.split(" -- ", 1)[1], None)
        return ""

    def test_uncertain_remote_publish_preserves_completed_remote_and_old_local_data(self):
        old = self.old_backup()
        self.failure = "published_then_timeout"
        result = ops.backup(self.args)
        self.assertFalse(result["ok"])
        self.assertFalse(result["offhost_verified"])
        self.assertTrue(old.exists())
        self.assertEqual(len(self.remote), 1)
        self.assertTrue(next(iter(self.remote)).endswith(".sql.gz"))

    def test_overlapping_run_cannot_mutate_commands_or_last_success_receipt(self):
        self.assertTrue(ops.backup(self.args)["ok"])
        previous = self.receipt.read_bytes()
        self.commands.clear()
        with ops.backup_lock(self.receipt):
            result = ops.backup(self.args)
        self.assertFalse(result["ok"])
        self.assertEqual(self.commands, [])
        self.assertEqual(self.receipt.read_bytes(), previous)

    def test_monitor_rejects_empty_false_and_malformed_preflight_output(self):
        self.assertTrue(ops.backup(self.args)["ok"])
        self.args.max_age_hours = 26
        self.args.min_free_mib = 1
        for output in ("", "not-json", '{"ok":false}', '{"ok":true,"checks":[]}'):
            with self.subTest(output=output), patch.object(ops, "execute", return_value=output):
                self.assertFalse(ops.check(self.args)["ok"])

    def test_backup_bad_preflight_type_records_failure_before_export(self):
        for output in ("null", "[]", '"private-value-must-not-leak"'):
            with self.subTest(output=output), patch.object(ops, "execute", return_value=output):
                result = ops.backup(self.args)
                self.assertFalse(result["ok"])
                self.assertEqual(result["stage"], "configuration")
                self.assertFalse(json.loads(self.receipt.read_text())["ok"])
                self.assertEqual(list(self.backups.iterdir()), [])
                self.assertNotIn("private-value-must-not-leak", self.receipt.read_text())

    def old_backup(self):
        old = self.backups / "garageos-20000101-000000-old.sql.gz"
        old.write_bytes(gzip.compress(b"old good data\n"))
        os.utime(old, (datetime.now().timestamp() - 30 * 86400,) * 2)
        return old

    def test_success_requires_matching_remote_archive_and_private_receipt(self):
        old = self.old_backup()
        result = ops.backup(self.args)
        self.assertTrue(result["ok"])
        self.assertTrue(result["offhost_verified"])
        self.assertFalse(old.exists())
        receipt = json.loads(self.receipt.read_text())
        archive = self.backups / receipt["archive"]
        self.assertEqual(list(self.remote.values()), [archive.read_bytes()])
        self.assertEqual(receipt["archive_sha256"], hashlib.sha256(archive.read_bytes()).hexdigest())
        self.assertEqual(gzip.decompress(archive.read_bytes()), b"CREATE TABLE source (id integer);\n")
        self.assertIsNotNone(receipt["last_success_at"])
        if os.name != "nt":
            self.assertEqual(self.receipt.stat().st_mode & 0o077, 0)

    def test_copy_hash_and_publish_failures_keep_local_and_old_good_backups(self):
        for failure in ("copy", "hash", "publish"):
            with self.subTest(failure=failure):
                self.failure = failure
                old = self.old_backup()
                result = ops.backup(self.args)
                self.assertFalse(result["ok"])
                self.assertFalse(result["offhost_verified"])
                self.assertTrue(old.exists())
                self.assertGreater(len(list(self.backups.glob("garageos-*.sql.gz"))), 1)
                self.assertEqual(self.remote, {})
                self.assertNotIn("private-error-must-not-leak", json.dumps(result) + self.receipt.read_text())

    def test_failure_does_not_erase_last_confirmed_success(self):
        self.assertTrue(ops.backup(self.args)["ok"])
        previous = json.loads(self.receipt.read_text())["last_success_at"]
        self.failure = "copy"
        self.assertFalse(ops.backup(self.args)["ok"])
        receipt = json.loads(self.receipt.read_text())
        self.assertEqual(receipt["last_success_at"], previous)
        self.assertFalse(receipt["ok"])

    def test_unsafe_ssh_destination_is_rejected_before_any_command(self):
        for target, directory in (("-oProxyCommand=evil", "/private/backups"),
                                  ("fixture@localhost", "/private/backups"),
                                  ("fixture@127.0.0.1", "/private/backups"),
                                  ("fixture@backup.example", "/backups/../other"),
                                  ("fixture@backup.example", "/backups;echo-secret")):
            with self.subTest(target=target):
                self.commands.clear()
                with patch.dict(os.environ, {"BACKUP_SSH_TARGET": target, "BACKUP_SSH_DIRECTORY": directory}):
                    result = ops.backup(self.args)
                self.assertFalse(result["ok"])
                self.assertEqual(self.commands, [])
                self.assertNotIn(target, json.dumps(result))

    def test_monitor_accepts_only_recent_verified_backup_and_ready_dependencies(self):
        self.assertTrue(ops.backup(self.args)["ok"])
        self.args.max_age_hours = 26
        self.args.min_free_mib = 1
        self.assertTrue(ops.check(self.args)["ok"])
        self.assertIn("--check-ready", self.commands[-1])

    def test_monitor_rejects_stale_future_local_only_and_failed_backup_receipts(self):
        self.args.max_age_hours = 26
        self.args.min_free_mib = 1
        current = datetime.now(timezone.utc)
        for delta, verified, successful in ((timedelta(hours=-27), True, True),
                                           (timedelta(hours=1), True, True),
                                           (timedelta(), False, True),
                                           (timedelta(), True, False)):
            with self.subTest(delta=delta, verified=verified, successful=successful):
                self.receipt.write_text(json.dumps({"ok": successful, "offhost_verified": verified,
                    "last_success_at": (current + delta).isoformat()}))
                self.assertFalse(ops.check(self.args)["ok"])

    def test_monitor_rejects_missing_receipt_and_low_disk_space(self):
        self.args.max_age_hours = 26
        self.args.min_free_mib = 1
        missing = ops.check(self.args)
        self.assertFalse(missing["ok"])
        self.assertIn("backup_missing", missing["issues"])
        self.assertTrue(ops.backup(self.args)["ok"])
        with patch.object(ops.shutil, "disk_usage", return_value=Namespace(free=0)):
            result = ops.check(self.args)
        self.assertFalse(result["ok"])
        self.assertIn("disk_low", result["issues"])

    def test_monitor_dependency_failure_is_safe_and_non_successful(self):
        self.assertTrue(ops.backup(self.args)["ok"])
        self.args.max_age_hours = 26
        self.args.min_free_mib = 1
        with patch.object(ops, "execute", side_effect=subprocess.CalledProcessError(
                1, ["fixture"], stderr="dependency-password-must-not-leak")):
            result = ops.check(self.args)
        self.assertFalse(result["ok"])
        self.assertIn("not_ready", result["issues"])
        self.assertNotIn("dependency-password-must-not-leak", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
