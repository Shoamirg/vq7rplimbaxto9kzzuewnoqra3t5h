"""Private short-lived sessions for genuine clock-expiry browser checks.

This test-only CLI consumes a currently valid, normally issued access token on
stdin. It resolves its active principal through the normal auth service, then
uses the application's signer with a short lifetime. API expiry validation is
unchanged. Stdout is private pipe data, never a console/artifact.
"""
from __future__ import annotations

import asyncio
from datetime import timedelta
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
    from app.core.security import create_access_token, decode_token
    from app.repositories.unit_of_work import UnitOfWork
    from app.services.customer_auth_service import CustomerAuthService

    try:
        database = make_url(settings.DATABASE_URL)
        origin = os.environ.get("BASE_URL", "")
        target = urlsplit(origin)
        repository = Path(__file__).resolve().parents[4]
        fixture = Path(os.environ["GARAGEOS_BROWSER_FIXTURE"]).resolve()
        if (settings.ENVIRONMENT != "test" or settings.DEBUG
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
        request = json.loads(raw)
        token = request["token"]
        payload = decode_token(token)
        if not payload or payload.get("demo"):
            raise ValueError("A valid normal access session is required")
        async with async_session_factory() as session:
            if request["kind"] == "staff" and payload.get("type") == "access":
                actor = await _auth_service(session).get_current_user(token)
            elif (request["kind"] == "customer" and payload.get("type") == "customer_access"
                    and not payload.get("account_id")):
                uow = UnitOfWork()
                uow.session = session
                actor = await CustomerAuthService(uow).get_current_customer(token)
                if actor.telegram_id is None:
                    raise ValueError("A verified Telegram customer is required")
            else:
                raise ValueError("Principal type mismatch")
            actor_id, center_id = str(actor.id), str(actor.service_center_id)
        claims = {key: value for key, value in payload.items() if key != "exp"}
        short = create_access_token(claims, expires_delta=timedelta(seconds=6))
        verified = decode_token(short)
        if not verified or verified["sub"] != actor_id or verified["type"] != payload["type"]:
            raise ValueError("Short session verification failed")
        return {"token": short, "expires": verified["exp"], "actor_id": actor_id, "center_id": center_id}
    finally:
        await engine.dispose()


def main() -> None:
    try:
        result = asyncio.run(issue())
    except Exception:
        # Never include input, decoded claims, tokens or captured pipe data.
        print("Isolated expiring-session fixture refused or failed.", file=sys.stderr)
        raise SystemExit(2) from None
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
