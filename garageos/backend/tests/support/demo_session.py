"""Issue a fresh normal read-only demo session for isolated browser QA.

The caller's normal staff token enters through stdin and the demo token leaves
through a private pipe. Never log either token or enable the public demo route.
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit


async def issue() -> dict:
    from sqlalchemy.engine import make_url
    from app.api.deps import _auth_service
    from app.core.config import settings
    from app.core.database import async_session_factory, engine
    from app.core.security import decode_token

    try:
        database = make_url(settings.DATABASE_URL)
        origin = os.environ.get("BASE_URL", "")
        target = urlsplit(origin)
        repository = Path(__file__).resolve().parents[4]
        fixture = Path(os.environ["GARAGEOS_BROWSER_FIXTURE"]).resolve()
        if (settings.ENVIRONMENT != "test" or settings.DEBUG or settings.DEMO_MODE_ENABLED
                or database.host not in {"localhost", "127.0.0.1"}
                or database.database != "garage_test"
                or target.scheme != "http" or target.hostname not in {"localhost", "127.0.0.1"}
                or target.username or target.password or target.path or target.query or target.fragment
                or fixture.is_relative_to(repository) or fixture.name != "browser-fixture.json"):
            raise ValueError("Not an isolated browser fixture")
        receipt = json.loads(fixture.read_text(encoding="utf-8"))
        if not receipt.get("qa_only") or receipt.get("base_origin") != origin:
            raise ValueError("Fixture origin mismatch")
        raw = sys.stdin.read(16385)
        if len(raw) > 16384:
            raise ValueError("Input exceeds bound")
        token = json.loads(raw)["token"]
        payload = decode_token(token)
        if not payload or payload.get("type") != "access" or payload.get("demo"):
            raise ValueError("A valid normal staff session is required")
        async with async_session_factory() as session:
            service = _auth_service(session)
            caller = await service.get_current_user(token)
            fresh = (await service.demo_login())["access_token"]
            demo = await service.get_current_user(fresh)
            claims = decode_token(fresh)
            if (caller.id != demo.id or caller.service_center_id != demo.service_center_id
                    or not claims or claims.get("demo") is not True):
                raise ValueError("The normal caller must own the configured demo account")
        return {"token": fresh, "expires": claims["exp"],
                "actor_id": str(demo.id), "center_id": str(demo.service_center_id)}
    finally:
        await engine.dispose()


def main() -> None:
    try:
        value = asyncio.run(issue())
    except Exception:
        print("Isolated demo-session issuer refused or failed.", file=sys.stderr)
        raise SystemExit(2) from None
    sys.stdout.write(json.dumps(value))


if __name__ == "__main__":
    main()
