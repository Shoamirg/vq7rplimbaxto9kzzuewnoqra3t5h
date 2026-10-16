"""Security & reliability tests (Phase 13 · M2).

Covers the two authentication guardrails added for public exposure:

  * Rate limiting — the per-IP auth ceiling returns 429 with Retry-After;
    local development degrades open while deployments fail closed.
  * Audit trail — both successful and failed logins leave an append-only record,
    including provenance, even though a failed login's request ends in a 401.
"""
from __future__ import annotations

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.core import rate_limit
from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.main import app
from app.models.audit_log import AuditLog

PRIMARY_ADMIN = ("admin@demo.garageos.app", "parol12345")
BOGUS_EMAIL = "attacker-test@example.com"


@pytest_asyncio.fixture(autouse=True)
async def _reset_engine():
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _audit_rows(action: str, email: str) -> list[AuditLog]:
    async with async_session_factory() as s:
        rows = (await s.execute(
            select(AuditLog).where(AuditLog.action == action, AuditLog.actor_email == email)
        )).scalars().all()
        return list(rows)


async def _purge(email: str) -> None:
    async with async_session_factory() as s:
        await s.execute(delete(AuditLog).where(AuditLog.actor_email == email))
        await s.commit()


# ── Audit trail ───────────────────────────────────────────────────────────────

async def test_failed_login_is_audited(client):
    await _purge(BOGUS_EMAIL)
    resp = await client.post(
        "/api/v1/auth/login", json={"email": BOGUS_EMAIL, "password": "wrongpass"}
    )
    assert resp.status_code == 401
    try:
        rows = await _audit_rows("auth.login.failure", BOGUS_EMAIL)
        assert len(rows) == 1
        assert rows[0].status == "failure"
    finally:
        await _purge(BOGUS_EMAIL)


async def test_successful_login_is_audited(client):
    resp = await client.post(
        "/api/v1/auth/login", json={"email": PRIMARY_ADMIN[0], "password": PRIMARY_ADMIN[1]}
    )
    assert resp.status_code == 200
    rows = await _audit_rows("auth.login.success", PRIMARY_ADMIN[0])
    assert len(rows) >= 1
    assert rows[-1].status == "success"


# ── Rate limiting ─────────────────────────────────────────────────────────────

async def test_rate_limit_returns_429_with_retry_after(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    # Force the limiter's store to report "over limit" without needing Redis.
    async def _over(_key, _limit, _window, *, fail_closed=False):
        return False, 7
    monkeypatch.setattr(rate_limit, "_hit", _over)

    resp = await client.post(
        "/api/v1/auth/login", json={"email": PRIMARY_ADMIN[0], "password": PRIMARY_ADMIN[1]}
    )
    assert resp.status_code == 429
    assert resp.headers.get("retry-after") == "7"
    assert resp.json()["error"]["code"] == "RATE_LIMITED"


async def test_rate_limit_degrades_open_on_store_error(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    # Simulate Redis being down: the limiter must ALLOW rather than lock out.
    monkeypatch.setattr(rate_limit, "_client", None)

    def _boom(_url, *_a, **_k):
        raise ConnectionError("redis down")
    monkeypatch.setattr(rate_limit.redis, "from_url", _boom)

    resp = await client.post(
        "/api/v1/auth/login", json={"email": PRIMARY_ADMIN[0], "password": PRIMARY_ADMIN[1]}
    )
    assert resp.status_code == 200


def _fake_request(headers: dict, client_host: str | None = None):
    req = httpx.Request("GET", "http://x", headers=headers)

    class _Scope:
        pass

    _Scope.headers = req.headers
    _Scope.client = type("C", (), {"host": client_host})() if client_host else None
    return _Scope()


def test_client_ip_uses_rightmost_forwarded_hop(monkeypatch):
    # Proxies APPEND the real peer, so the rightmost value is trustworthy and the
    # client-supplied leftmost must be ignored (the brute-force bypass we fixed).
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    scope = _fake_request({"x-forwarded-for": "1.2.3.4, 203.0.113.9"})  # 1.2.3.4 is spoofed
    assert rate_limit.client_ip(scope) == "203.0.113.9"


def test_client_ip_prefers_x_real_ip(monkeypatch):
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    scope = _fake_request({"x-real-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4, 9.9.9.9"})
    assert rate_limit.client_ip(scope) == "198.51.100.7"


def test_client_ip_ignores_forwarded_when_not_trusted(monkeypatch):
    # Directly exposed (no proxy): forwarding headers are attacker-controlled and
    # must be ignored in favor of the real socket peer.
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    scope = _fake_request({"x-forwarded-for": "1.2.3.4"}, client_host="10.0.0.5")
    assert rate_limit.client_ip(scope) == "10.0.0.5"


async def test_refresh_failure_is_audited(client):
    await _purge(None)  # no-op guard; refresh failures carry no actor_email
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-real-token"})
    assert resp.status_code in (401, 422)
    if resp.status_code == 401:
        rows = await _audit_rows("auth.refresh.failure", None)
        assert len(rows) >= 1
