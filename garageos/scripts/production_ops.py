"""Private operator backup and readiness checks; no automatic installation/deploy."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]


def execute(command, *, env=None, timeout=60):
    """Capture external diagnostics privately; callers publish fixed codes only."""
    result = subprocess.run([str(item) for item in command], cwd=ROOT, env=env,
                            capture_output=True, text=True, encoding="utf-8",
                            errors="replace", timeout=timeout, check=True)
    return result.stdout


def now():
    return datetime.now(timezone.utc)


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_receipt(path):
    if not Path(path).exists():
        return {}
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("invalid receipt")
    return value


def save_receipt(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".backup-status-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(value, output)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def ssh_configuration():
    target = os.environ.get("BACKUP_SSH_TARGET", "")
    directory = os.environ.get("BACKUP_SSH_DIRECTORY", "")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*@[A-Za-z0-9][A-Za-z0-9.-]*", target):
        raise ValueError("invalid destination")
    host = target.rsplit("@", 1)[1].lower().rstrip(".")
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".localhost"):
        raise ValueError("backup destination must be separate")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and (address.is_loopback or address.is_unspecified):
        raise ValueError("backup destination must be separate")
    if (not re.fullmatch(r"/[A-Za-z0-9_./-]+", directory)
            or ".." in PurePosixPath(directory).parts or directory.rstrip("/") == ""):
        raise ValueError("invalid directory")
    key = Path(os.environ.get("BACKUP_SSH_IDENTITY_FILE", ""))
    hosts = Path(os.environ.get("BACKUP_SSH_KNOWN_HOSTS", ""))
    if not key.is_file() or not hosts.is_file() or hosts.stat().st_size == 0:
        raise ValueError("missing pinned SSH configuration")
    if os.name != "nt" and key.stat().st_mode & 0o077:
        raise ValueError("private key permissions")
    port = int(os.environ.get("BACKUP_SSH_PORT", "22"))
    if not 1 <= port <= 65535:
        raise ValueError("invalid port")
    hosts_option = str(hosts.resolve()).replace('\\', '\\\\').replace('"', '\\"')
    options = ["-F", "none", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
               "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none", "-o", "GlobalKnownHostsFile=none",
               "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2",
               "-o", 'UserKnownHostsFile="' + hosts_option + '"', "-i", str(key.resolve())]
    return target, directory.rstrip("/"), options, port


@contextmanager
def backup_lock(receipt):
    """OS lock releases on exit/crash; keep its inode to prevent unlink races."""
    path = Path(receipt).with_name(Path(receipt).name + ".lock")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    with os.fdopen(descriptor, "a+b") as lock:
        if lock.tell() == 0:
            lock.write(b"0")
            lock.flush()
        if os.name == "nt":
            import msvcrt
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == "nt":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def preflight(env_file, *, ready=False):
    command = [sys.executable, ROOT / "scripts/production_preflight.py", "--env-file", env_file]
    if ready:
        command.append("--check-ready")
    report = json.loads(execute(command))
    if not isinstance(report, dict):
        raise ValueError("invalid preflight receipt")
    checks = report.get("checks", [])
    required = {"compose", "request_protection"} | ({"readiness"} if ready else set())
    if (report.get("ok") is not True or report.get("readiness_requested") is not ready
            or not isinstance(checks, list) or not checks
            or not all(isinstance(check, dict) and check.get("ok") is True for check in checks)
            or not required <= {check.get("name") for check in checks}):
        raise ValueError("invalid preflight receipt")


def backup(args):
    try:
        with backup_lock(args.receipt):
            return _backup(args)
    except OSError:
        return {"ok": False, "stage": "backup_lock_unavailable", "offhost_verified": False}


def _backup(args):
    stage, verified, uploaded = "configuration", False, False
    attempted = now().isoformat()
    previous_success = None
    target = temporary_remote = None
    try:
        previous = load_receipt(args.receipt)
        previous_success = previous.get("last_success_at")
        if previous_success is not None:
            parsed = datetime.fromisoformat(previous_success)
            if parsed.tzinfo is None or parsed > now():
                raise ValueError("invalid previous success")
        target, directory, options, port = ssh_configuration()
        if not Path(args.env_file).is_file() or args.retention_days <= 0:
            raise ValueError("missing environment")
        preflight(args.env_file)
        stage = "local_backup"
        backup_dir = Path(args.backup_dir).resolve()
        backup_dir.mkdir(parents=True, exist_ok=True)
        name = "garageos-" + now().strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex + ".sql.gz"
        archive = backup_dir / name
        environment = {**os.environ, "ENV_FILE": str(Path(args.env_file).resolve()),
                       "GARAGEOS_ENV_FILE": str(Path(args.env_file).resolve()),
                       "BACKUP_DIR": str(backup_dir), "BACKUP_OUTPUT_NAME": name,
                       "BACKUP_DEFER_PRUNE": "1"}
        execute(["bash", ROOT / "scripts/backup.sh"], env=environment, timeout=900)
        uncompressed_size = 0
        with gzip.open(archive, "rb") as content:
            for block in iter(lambda: content.read(1024 * 1024), b""):
                uncompressed_size += len(block)
        if not uncompressed_size:
            raise ValueError("empty archive")
        digest = file_sha256(archive)
        temporary_remote = directory + "/." + name + ".upload"
        final_remote = directory + "/" + name
        stage = "offhost_copy"
        uploaded = True  # even a failed scp can leave a partial owned file
        execute(["scp", "-B", *options, "-P", str(port), archive,
                 target + ":" + temporary_remote], timeout=900)
        stage = "offhost_verify"
        proof = execute(["ssh", *options, "-p", str(port), target,
                         "chmod 600 -- " + temporary_remote + " && sha256sum -- " + temporary_remote])
        if not proof.split() or proof.split()[0] != digest:
            raise ValueError("remote checksum mismatch")
        stage = "offhost_publish"
        execute(["ssh", *options, "-p", str(port), target,
                 "mv -n -- " + temporary_remote + " " + final_remote
                 + " && test ! -e " + temporary_remote])
        uploaded, verified = False, True
        stage = "retention"
        cutoff = now().timestamp() - args.retention_days * 86400
        for old in backup_dir.glob("garageos-*.sql.gz"):
            if old != archive and not old.is_symlink() and old.is_file() and old.stat().st_mtime < cutoff:
                old.unlink()
        stage = "complete"
        save_receipt(args.receipt, {"version": 1, "ok": True, "attempted_at": attempted,
            "stage": stage, "last_success_at": now().isoformat(), "offhost_verified": True,
            "archive": name, "archive_sha256": digest})
        return {"ok": True, "stage": stage, "offhost_verified": True}
    except (OSError, ValueError, TypeError, EOFError, subprocess.SubprocessError):
        if uploaded and target and temporary_remote:
            try:
                execute(["ssh", *options, "-p", str(port), target, "rm -f -- " + temporary_remote])
            except (OSError, subprocess.SubprocessError):
                pass  # never delete anything except this run's exact temporary file
        result = {"ok": False, "stage": stage, "offhost_verified": verified}
        try:
            save_receipt(args.receipt, {"version": 1, **result, "attempted_at": attempted,
                                      "last_success_at": previous_success})
        except OSError:
            result["stage"] = "receipt_write"
        return result


def check(args):
    """Observe privately; no changes to services, schedules, backups or accounts."""
    issues = []
    try:
        preflight(args.env_file, ready=True)
    except (OSError, ValueError, TypeError, AttributeError, subprocess.SubprocessError):
        issues.append("not_ready")
    try:
        receipt = load_receipt(args.receipt)
        if not receipt:
            issues.append("backup_missing")
        elif receipt.get("ok") is not True or receipt.get("offhost_verified") is not True:
            issues.append("backup_unconfirmed")
        else:
            timestamp = datetime.fromisoformat(receipt["last_success_at"])
            age = now() - timestamp
            if (timestamp.tzinfo is None or age < timedelta()
                    or age > timedelta(hours=args.max_age_hours)):
                issues.append("backup_stale")
    except (OSError, ValueError, TypeError, KeyError):
        issues.append("backup_receipt_invalid")
    try:
        if shutil.disk_usage(args.backup_dir).free < args.min_free_mib * 1024 * 1024:
            issues.append("disk_low")
    except OSError:
        issues.append("disk_unavailable")
    return {"ok": not issues, "issues": issues}


def positive_integer(value):
    result = int(value)
    if result <= 0:
        raise argparse.ArgumentTypeError("a positive integer is required")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="operation", required=True)
    for operation in ("backup", "check"):
        command = commands.add_parser(operation)
        command.add_argument("--env-file", type=Path, required=True)
        command.add_argument("--backup-dir", type=Path, required=True)
        command.add_argument("--receipt", type=Path, required=True)
        if operation == "backup":
            command.add_argument("--retention-days", type=positive_integer, default=14)
        else:
            command.add_argument("--max-age-hours", type=positive_integer, default=26)
            command.add_argument("--min-free-mib", type=positive_integer, default=1024)
    args = parser.parse_args()
    result = backup(args) if args.operation == "backup" else check(args)
    print(json.dumps({"operation": args.operation, **result}))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
