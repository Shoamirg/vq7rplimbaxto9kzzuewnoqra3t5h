"""Public demo mode — read-only session guarantees.

The demo lets anyone into the demo tenant with no signup; the safety contract is
that such a session can never write. These tests pin that contract: entry is gated,
the token carries the demo claim, reads work, every write is rejected, and the
read-only property survives a token refresh (no escalation path).
"""
from __future__ import annotations

import time
import httpx
import jwt
import pytest_asyncio

from app.core.config import settings
from app.core.database import engine
from app.core.security import decode_token
from app.main import app

DEMO = "/api/v1/auth/demo"
A_WRITE = "/api/v1/appointments"  # any authenticated write endpoint


@pytest_asyncio.fixture(autouse=True)
async def _reset_engine():
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_demo_disabled_is_404(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", False)
    resp = await client.post(DEMO)
    assert resp.status_code == 404


async def test_demo_enter_returns_readonly_token(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    resp = await client.post(DEMO)
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    assert decode_token(token).get("demo") is True
    # A read works.
    me = await client.get("/api/v1/auth/me", headers=_auth(token))
    assert me.status_code == 200


async def test_demo_writes_are_blocked(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    token = (await client.post(DEMO)).json()["access_token"]
    # The write guard short-circuits before the endpoint even validates the body.
    resp = await client.post(A_WRITE, headers=_auth(token), json={})
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "DEMO_READ_ONLY"


async def test_demo_readonly_survives_refresh(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    tokens = (await client.post(DEMO)).json()
    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    new_access = refreshed.json()["access_token"]
    # The demo claim must persist — otherwise refresh would escalate to write access.
    assert decode_token(new_access).get("demo") is True
    blocked = await client.post(A_WRITE, headers=_auth(new_access), json={})
    assert blocked.status_code == 403


async def test_replayed_refresh_token_revokes_its_session_family(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    original = (await client.post(DEMO)).json()["refresh_token"]

    first = await client.post("/api/v1/auth/refresh", json={"refresh_token": original})
    assert first.status_code == 200

    replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": original})
    assert replay.status_code == 401

    # Reuse is evidence the family may be compromised; invalidate its successor too.
    successor = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": first.json()["refresh_token"]},
    )
    assert successor.status_code == 401


async def test_logout_revokes_refresh_session(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    refresh_token = (await client.post(DEMO)).json()["refresh_token"]

    logout = await client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
    assert logout.status_code == 200

    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 401


async def test_pre_rotation_refresh_token_can_be_migrated_once(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    access = (await client.post(DEMO)).json()["access_token"]
    subject = decode_token(access)["sub"]
    legacy = jwt.encode(
        {"sub": subject, "type": "refresh", "exp": int(time.time()) + 60 * 60},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    first = await client.post("/api/v1/auth/refresh", json={"refresh_token": legacy})
    assert first.status_code == 200
    replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": legacy})
    assert replay.status_code == 401


async def test_logout_tombstones_untracked_legacy_refresh_token(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    access = (await client.post(DEMO)).json()["access_token"]
    subject = decode_token(access)["sub"]
    legacy = jwt.encode(
        {"sub": subject, "type": "refresh", "exp": int(time.time()) + 60 * 60},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    logout = await client.post("/api/v1/auth/logout", json={"refresh_token": legacy})
    assert logout.status_code == 200
    refresh = await client.post("/api/v1/auth/refresh", json={"refresh_token": legacy})
    assert refresh.status_code == 401


async def test_normal_token_can_still_write_path(client, monkeypatch):
    # A non-demo admin token must NOT be caught by the guard: it reaches the
    # endpoint (422 for an empty body), proving the guard keys on the demo claim.
    monkeypatch.setattr(settings, "DEMO_MODE_ENABLED", True)
    login = await client.post("/api/v1/auth/login", json={"email": "admin@demo.garageos.app", "password": "demo1234"})
    token = login.json()["access_token"]
    resp = await client.post(A_WRITE, headers=_auth(token), json={})
    assert resp.status_code != 403
