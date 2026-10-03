"""Backup CLI failures cannot publish a file that looks ready to restore."""
from __future__ import annotations

import gzip
import os
from pathlib import Path
import shutil
import subprocess
import time

import pytest

ROOT = Path(__file__).resolve().parents[2]


def _bash_path(path):
    value = Path(path).resolve().as_posix()
    return f"/{value[0].lower()}{value[2:]}" if os.name == "nt" else value


@pytest.fixture
def backup_cli(tmp_path):
    bash = Path("C:/Program Files/Git/bin/bash.exe") if os.name == "nt" else shutil.which("bash")
    if not bash or not Path(bash).exists():
        pytest.skip("Backup CLI tests require Bash (Git Bash on Windows)")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    docker = bin_dir / "docker"
    docker.write_text("""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$TEST_DOCKER_LOG"
arguments=("$@")
for ((i=0; i<${#arguments[@]}; i++)); do
    if [[ "${arguments[i]}" == --env-file && "${arguments[i+1]}" != "$ENV_FILE" ]]; then
        echo 'env-file path was split' >&2
        exit 1
    fi
done
if [[ "$*" == *pg_dump* ]]; then
    if [[ "${TEST_DUMP_EMPTY:-0}" != 1 ]]; then
        printf '%s\\n' 'CREATE TABLE backup_test (id integer);'
    fi
    exit "${TEST_DUMP_FAIL:-0}"
fi
exit 0
""", encoding="utf-8")
    docker.chmod(0o755)
    env_file = tmp_path / "deployment settings.env"
    env_file.write_text("POSTGRES_USER=test_role\nPOSTGRES_DB=test_database\n", encoding="utf-8")
    backups = tmp_path / "backup output"
    backups.mkdir()
    log = tmp_path / "docker.log"

    def run(script="backup.sh", args=(), **overrides):
        env = {**os.environ, "ENV_FILE": _bash_path(env_file), "BACKUP_DIR": _bash_path(backups),
               "TEST_BIN": _bash_path(bin_dir), "TEST_SCRIPT": _bash_path(ROOT / "scripts" / script),
               "TEST_DOCKER_LOG": _bash_path(log), **overrides}
        return subprocess.run([str(bash), "--noprofile", "--norc", "-c",
                               'export PATH="$TEST_BIN:$PATH"; exec bash "$TEST_SCRIPT" "$@"', "test", *args],
                              cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8")

    return run, backups, log, env_file


def test_failed_dump_leaves_no_completed_backup_and_keeps_old_good_copy(backup_cli):
    run, backups, _, _ = backup_cli
    old = backups / "garageos-20000101-000000.sql.gz"
    with gzip.open(old, "wb") as file:
        file.write(b"CREATE TABLE good_backup (id integer);\n")
    os.utime(old, (time.time() - 30 * 86400,) * 2)

    result = run(TEST_DUMP_FAIL="1")
    assert result.returncode != 0
    assert list(backups.iterdir()) == [old]
    assert gzip.decompress(old.read_bytes()) == b"CREATE TABLE good_backup (id integer);\n"


def test_success_publishes_private_valid_archive_and_prunes_only_old_backups(backup_cli):
    run, backups, log, _ = backup_cli
    old = backups / "garageos-20000101-000000.sql.gz"
    old.write_bytes(gzip.compress(b"old\n"))
    os.utime(old, (time.time() - 30 * 86400,) * 2)
    unrelated = backups / "other-project.sql.gz"
    unrelated.write_bytes(b"keep")
    for _ in range(2):
        result = run()
        assert result.returncode == 0, result.stdout + result.stderr
    completed = list(backups.glob("garageos-*.sql.gz"))
    assert len(completed) == 2
    assert not old.exists()
    assert unrelated.read_bytes() == b"keep"
    assert "pg_dump -U test_role test_database" in log.read_text(encoding="utf-8")
    for archive in completed:
        assert gzip.decompress(archive.read_bytes()) == b"CREATE TABLE backup_test (id integer);\n"
        if os.name != "nt":
            assert archive.stat().st_mode & 0o077 == 0
    assert not list(backups.glob(".garageos-backup.*"))


def test_empty_dump_is_not_published(backup_cli):
    run, backups, _, _ = backup_cli
    result = run(TEST_DUMP_EMPTY="1")
    assert result.returncode != 0
    assert not list(backups.iterdir())


@pytest.mark.parametrize("retention", ["0", "-1", "oops", "1.5"])
def test_invalid_retention_fails_before_export_or_deletion(backup_cli, retention):
    run, backups, log, _ = backup_cli
    result = run(RETENTION_DAYS=retention)
    assert result.returncode != 0
    assert "RETENTION_DAYS" in result.stderr
    assert not log.exists()
    assert not list(backups.iterdir())


def test_restore_rejects_corrupted_archive_before_starting_docker(backup_cli):
    run, backups, log, _ = backup_cli
    corrupted = backups / "garageos-corrupted.sql.gz"
    corrupted.write_bytes(b"not a gzip backup")
    result = run(script="restore-test.sh", args=(_bash_path(corrupted),))
    assert result.returncode != 0
    assert not log.exists()
