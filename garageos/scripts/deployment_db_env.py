"""Read database identifiers as data for Bash tools; never evaluate dotenv."""
from pathlib import Path
import re
import sys

from production_preflight import read_env


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("configuration argument")
        values = read_env(Path(sys.argv[1]))
        identifiers = [values.get(key, "") for key in ("POSTGRES_USER", "POSTGRES_DB")]
        if not all(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}", value) for value in identifiers):
            raise ValueError("database identifiers")
        print(" ".join(identifiers))
        return 0
    except (OSError, UnicodeError, ValueError):
        print("[database-tool] FAIL: environment or database identifiers are invalid", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
