"""The public deployment probe must not reveal dependency credentials."""
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
