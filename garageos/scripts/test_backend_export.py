from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_backend_export import compare_backend_export


class BackendExportTests(unittest.TestCase):
    def test_identical_backend_trees_have_no_differences(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "source"
            exported = root / "exported"
            (source / "app").mkdir(parents=True)
            (exported / "app").mkdir(parents=True)
            (source / "app" / "main.py").write_text("app = True\n", encoding="utf-8")
            (exported / "app" / "main.py").write_bytes(b"app = True\r\n")

            self.assertEqual(compare_backend_export(source, exported), [])

    def test_reports_content_and_file_set_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "source"
            exported = root / "exported"
            (source / "app").mkdir(parents=True)
            (exported / "app").mkdir(parents=True)
            (source / "app" / "main.py").write_text("source\n", encoding="utf-8")
            (exported / "app" / "main.py").write_text("export\n", encoding="utf-8")
            (exported / "app" / "extra.py").write_text("extra\n", encoding="utf-8")

            differences = compare_backend_export(source, exported)

            self.assertTrue(any("app/main.py" in item and "content" in item for item in differences))
            self.assertTrue(any("app/extra.py" in item and "unexpected" in item for item in differences))

    def test_allows_only_documented_standalone_ci_fixtures(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "source"
            exported = root / "exported"
            source.mkdir()
            exported.mkdir()
            (exported / "scripts").mkdir()
            (exported / "scripts" / "test_railway_backend.py").write_text("ci only\n", encoding="utf-8")
            fixture = exported / "tests" / "support" / "source-operations"
            fixture.mkdir(parents=True)
            (fixture / "backup.sh").write_text("fixture\n", encoding="utf-8")

            self.assertEqual(compare_backend_export(source, exported), [])


if __name__ == "__main__":
    unittest.main()
