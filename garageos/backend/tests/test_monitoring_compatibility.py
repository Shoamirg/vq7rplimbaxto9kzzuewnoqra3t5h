"""Exercise enabled monitoring without sending events or patching other tests."""
import subprocess
import sys
import textwrap


def test_enabled_sentry_survives_framework_upgrade_without_optional_templates():
    code = textwrap.dedent('''
        import sentry_sdk
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.core.config import settings
        from app.core.observability import init_sentry

        events = []
        real_init = sentry_sdk.init
        def local_init(**kwargs):
            return real_init(**kwargs, transport=lambda event: events.append(event))
        sentry_sdk.init = local_init
        settings.SENTRY_DSN = "https://public-fixture@example.test/1"
        assert init_sentry() is True
        assert sentry_sdk.get_client().options["send_default_pii"] is False
        app = FastAPI()
        @app.get("/probe")
        def probe():
            return {"ok": True}
        @app.get("/failure")
        def failure():
            raise RuntimeError("public monitoring compatibility fixture")
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/probe")
            assert response.status_code == 200 and response.json() == {"ok": True}
            assert client.get("/failure").status_code == 500
        assert any(v["type"] == "RuntimeError" for e in events
                   for v in e.get("exception", {}).get("values", []))
        sentry_sdk.get_client().close()
    ''')
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
