"""Rate limit storage failures must not disable production request limits."""
from __future__ import annotations

import pytest

from app.core import rate_limit
from app.core.config import settings
from app.exceptions import RateLimitUnavailable
from starlette.requests import Request


@pytest.mark.asyncio
async def test_production_rate_limit_fails_closed_when_redis_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    def unavailable():
        raise ConnectionError("redis down")

    monkeypatch.setattr(rate_limit, "_get_client", unavailable)

    with pytest.raises(RateLimitUnavailable):
        await rate_limit._hit("rl:auth:127.0.0.1", 10, 60, fail_closed=True)


@pytest.mark.asyncio
async def test_production_rate_limit_dependency_fails_closed(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)

    def unavailable():
        raise ConnectionError("redis down")

    monkeypatch.setattr(rate_limit, "_get_client", unavailable)
    limiter = rate_limit.rate_limit(limit=10, window=60, scope="auth")
    request = Request({
        "type": "http",
        "method": "POST",
        "path": "/login",
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 1234),
        "server": ("test", 80),
        "scheme": "http",
        "http_version": "1.1",
        "root_path": "",
    })

    with pytest.raises(RateLimitUnavailable):
        await limiter(request)


@pytest.mark.asyncio
async def test_development_rate_limit_keeps_local_working_without_redis(monkeypatch):
    def unavailable():
        raise ConnectionError("redis down")

    monkeypatch.setattr(rate_limit, "_get_client", unavailable)

    assert await rate_limit._hit("rl:auth:127.0.0.1", 10, 60) == (True, 0)
