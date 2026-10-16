"""The public deployment probe must not reveal dependency credentials."""
import asyncio
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import redis.asyncio

from app.api import system
from app.main import app


async def test_readiness_failure_hides_private_dependency_details(monkeypatch, caplog):
    private = "private-database-and-redis-credentials-never-publish"
    monkeypatch.setattr(system, "engine", SimpleNamespace(connect=Mock(side_effect=RuntimeError(private))))
    monkeypatch.setattr(redis.asyncio, "from_url", Mock(side_effect=RuntimeError(private)))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://api.example.com") as client:
        response = await client.get("/ready")
    assert response.status_code == 503
    assert private not in response.text
    assert private not in caplog.text
    assert response.json() == {"status": "not_ready", "checks": {
        "database": {"ok": False, "error": "unavailable"},
        "redis": {"ok": False, "error": "unavailable"},
    }}


async def test_database_readiness_has_a_deadline(monkeypatch):
    class SlowConnection:
        async def __aenter__(self):
            await asyncio.sleep(1)

        async def __aexit__(self, *_):
            return None

    monkeypatch.setattr(system, "_CONNECT_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(system, "engine", SimpleNamespace(connect=lambda: SlowConnection()))
    assert await system._check_database() == (False, "unavailable")


async def test_redis_readiness_has_a_deadline(monkeypatch):
    class SlowRedis:
        async def ping(self):
            await asyncio.sleep(1)

        async def aclose(self):
            return None

    monkeypatch.setattr(system, "_CONNECT_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(redis.asyncio, "from_url", Mock(return_value=SlowRedis()))
    assert await system._check_redis() == (False, "unavailable")
