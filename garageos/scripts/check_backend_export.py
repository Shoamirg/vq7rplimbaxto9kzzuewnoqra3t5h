from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path


BACKEND_DIRECTORIES = ("app", "alembic", "data", "scripts", "tests")
BACKEND_FILES = (
    ".dockerignore",
    ".env.example",
    "Dockerfile",
    "alembic.ini",
    "pytest.ini",
    "requirements-dev.txt",
    "requirements.txt",
)
GENERATED_DIRECTORIES = {"__pycache__", ".pytest_cache", ".venv", ".mypy_cache", ".ruff_cache"}
EXPORT_ONLY_FILES = {
    "scripts/test_railway_backend.py",
}
EXPORT_ONLY_PREFIXES = (
    "tests/support/source-operations/",
)


def _backend_files(root: Path) -> dict[str, Path]:
    files: dict[str, Path] = {}
    for directory_name in BACKEND_DIRECTORIES:
        directory = root / directory_name
        if not directory.is_dir():
            continue
        for path in directory.rglob("*"):
            if not path.is_file() or GENERATED_DIRECTORIES.intersection(path.parts):
                continue
            if path.suffix == ".pyc":
                continue
            relative_path = path.relative_to(root).as_posix()
            if relative_path in EXPORT_ONLY_FILES or relative_path.startswith(EXPORT_ONLY_PREFIXES):
                continue
            files[relative_path] = path

    for filename in BACKEND_FILES:
        path = root / filename
        if path.is_file():
            files[filename] = path
    return files


def _sha256(path: Path) -> str:
    # Git can check out the same tracked text as LF or CRLF on different hosts.
    content = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return hashlib.sha256(content).hexdigest()


def compare_backend_export(source_root: Path, export_root: Path) -> list[str]:
    source_files = _backend_files(source_root)
    export_files = _backend_files(export_root)
    differences: list[str] = []

    for relative_path in sorted(source_files.keys() - export_files.keys()):
        differences.append(f"missing from export: {relative_path}")
    for relative_path in sorted(export_files.keys() - source_files.keys()):
        differences.append(f"unexpected in export: {relative_path}")
    for relative_path in sorted(source_files.keys() & export_files.keys()):
        if _sha256(source_files[relative_path]) != _sha256(export_files[relative_path]):
            differences.append(f"content differs: {relative_path}")

    return differences


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the standalone backend matches the monorepo export.")
    parser.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parents[1] / "backend")
    parser.add_argument("--export-root", required=True, type=Path)
    args = parser.parse_args()

    differences = compare_backend_export(args.source_root.resolve(), args.export_root.resolve())
    if differences:
        print("Backend export drift detected:")
        for difference in differences:
            print(f"- {difference}")
        return 1

    print("Monorepo backend and standalone export match.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
