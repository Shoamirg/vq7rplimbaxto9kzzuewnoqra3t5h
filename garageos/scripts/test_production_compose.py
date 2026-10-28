"""Validate real Compose interpolation/profiles privately; never start services."""
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import unittest

from production_preflight import ROOT, run_preflight


class ProductionComposeTest(unittest.TestCase):
    def test_actual_default_and_telegram_profile_configs_pass_preflight(self):
        with tempfile.TemporaryDirectory(prefix="garageos-compose-preflight-") as temporary:
            env_file = Path(temporary) / "private settings.env"
            # Synthetic configuration only. No DNS, certificate, bot or login call.
            values = {
                "ENVIRONMENT": "production", "DEBUG": "false", "DATABASE_ECHO": "false",
                "DEMO_MODE_ENABLED": "false", "DOMAIN": "garageos.uz", "ACME_EMAIL": "fixture@garageos.uz",
                "POSTGRES_USER": "fixture_role", "POSTGRES_DB": "fixture_db",
                "POSTGRES_PASSWORD": secrets.token_hex(24), "SECRET_KEY": secrets.token_hex(32),
                "CORS_ORIGINS": "https://garageos.uz", "TELEGRAM_BOT_TOKEN": "123456789:" + secrets.token_urlsafe(32),
                "TRUST_PROXY_HEADERS": "true", "RATE_LIMIT_ENABLED": "true",
                "RATE_LIMIT_AUTH_MAX": "10", "RATE_LIMIT_AUTH_WINDOW_SECONDS": "60",
                "RATE_LIMIT_WRITE_MAX": "60", "RATE_LIMIT_WRITE_WINDOW_SECONDS": "60",
                "TELEGRAM_MINI_APP_URL": "https://garageos.uz/mini",
            }
            env_file.write_text("\n".join(key + "=" + value for key, value in values.items()) + "\n")
            env_file.chmod(0o600)
            for telegram in (False, True):
                with self.subTest(telegram=telegram):
                    report = run_preflight(env_file, telegram=telegram)
                    self.assertTrue(report["ok"], report)
                    self.assertFalse(report["readiness_requested"])
                    self.assertEqual(report["telegram_enabled"], telegram)

    def test_operator_units_validate_with_private_non_executable_install_modes(self):
        if shutil.which("systemd-analyze") is None:
            self.skipTest("systemd-analyze is not installed on this host (Linux systemd required)")
        # Copy to native Linux storage, as installation does; DrvFs reports 0777.
        with tempfile.TemporaryDirectory(prefix="garageos-units-verify-") as temporary:
            files = []
            for source in (ROOT / "operations").iterdir():
                if source.suffix not in {".service", ".timer"}:
                    continue
                target = Path(temporary) / source.name
                target.write_bytes(source.read_bytes())
                target.chmod(0o644)
                files.append(str(target))
            self.assertEqual(len(files), 5)
            result = subprocess.run(["systemd-analyze", "verify", *files],
                                    capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
