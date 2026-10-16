"""Verify dashboard/backend input filtering with Docker and synthetic files.

Requires Docker Linux containers. Does not read local credentials or build the app.
Run from repo root: python garageos/scripts/test_dashboard_build_context.py
"""

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


class DashboardBuildContextTest(unittest.TestCase):
    def test_build_receives_workspace_sources_without_private_or_generated_files(self):
        root = Path(__file__).resolve().parents[1]
        keep = (
            "package.json", "package-lock.json", "admin-dashboard/package.json",
            "admin-dashboard/app/page.tsx", "admin-dashboard/public/brand/logo.svg",
            "admin-dashboard/next.config.js", "packages/design-system/package.json",
            "packages/design-system/index.ts",
        )
        exclude = (
            ".env", ".env.prod", "admin-dashboard/.env.local",
            "admin-dashboard/node_modules/sentinel", "node_modules/sentinel",
            "packages/design-system/node_modules/sentinel", "admin-dashboard/.next/sentinel",
            "backups/sentinel.sql.gz", "flutter_app/build/sentinel", "backend/garage.local.json",
            "admin-dashboard/test-results/sentinel", "admin-dashboard/private.key",
            "admin-dashboard/private.pem", "admin-dashboard/npm-debug.log",
            "admin-dashboard/tsconfig.tsbuildinfo",
        )
        with tempfile.TemporaryDirectory(prefix="garageos-context-check-") as directory:
            workspace = Path(directory)
            context, output = workspace / "context", workspace / "output"
            context.mkdir()
            for name in keep + exclude:
                file = context / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text("synthetic-sentinel", encoding="utf-8")
            shutil.copyfile(root / ".dockerignore", context / ".dockerignore")
            result = subprocess.run(
                ["docker", "build", "--progress=plain", "--output", f"type=local,dest={output}",
                 "-f", "-", str(context)],
                input="FROM scratch\nCOPY . /context/\n", capture_output=True, text=True, timeout=120,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            for name in keep:
                with self.subTest(required=name):
                    self.assertTrue((output / "context" / name).exists())
            for name in exclude:
                with self.subTest(excluded=name):
                    self.assertFalse((output / "context" / name).exists())

    def test_backend_keeps_operator_code_but_excludes_private_manifests(self):
        root = Path(__file__).resolve().parents[1] / "backend"
        keep = ("requirements.txt", "app/commands/enroll_platform.py",
                "app/schemas/platform_enrollment.py", "platform-enrollment.example.json", "alembic/env.py")
        exclude = ("platform.local.json", "garage.local.json", ".env", ".env.prod",
                   ".venv/sentinel", ".pytest_cache/sentinel", "app/__pycache__/sentinel.pyc")
        with tempfile.TemporaryDirectory(prefix="garageos-backend-context-check-") as directory:
            workspace = Path(directory)
            context, output = workspace / "context", workspace / "output"
            context.mkdir()
            for name in keep + exclude:
                file = context / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text("synthetic-sentinel", encoding="utf-8")
            shutil.copyfile(root / ".dockerignore", context / ".dockerignore")
            result = subprocess.run(
                ["docker", "build", "--progress=plain", "--output", f"type=local,dest={output}",
                 "-f", "-", str(context)],
                input="FROM scratch\nCOPY . /context/\n", capture_output=True, text=True, timeout=120,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            for name in keep:
                with self.subTest(required=name):
                    self.assertTrue((output / "context" / name).exists())
            for name in exclude:
                with self.subTest(excluded=name):
                    self.assertFalse((output / "context" / name).exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
