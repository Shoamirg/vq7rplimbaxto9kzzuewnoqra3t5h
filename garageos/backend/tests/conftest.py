"""Shared test fixtures.

Tests use a dedicated NullPool engine rather than the app's pooled engine:
pytest-asyncio runs each test on a fresh event loop, and pooled asyncpg
connections are bound to the loop that created them (reusing one across loops
raises "another operation is in progress"). NullPool opens a fresh connection
per checkout on the current loop, sidestepping that entirely.

The ``session`` fixture rolls back on teardown, so tests never persist data.
Requires a running Postgres (``docker compose up -d postgres``).
"""
from __future__ import annotations

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

# Rate limiting is infrastructure behavior, exercised explicitly in test_security.py.
# Disable it for the rest of the suite: many tests log in from the same (shared)
# test client IP, which would trip the per-IP auth ceiling once Redis is present
# (e.g. in CI) and flake unrelated tests.
settings.RATE_LIMIT_ENABLED = False

_test_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
_TestSession = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def session():
    async with _TestSession() as s:
        try:
            yield s
        finally:
            await s.rollback()
