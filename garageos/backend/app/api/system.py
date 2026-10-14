"""System endpoints: liveness, readiness, and version.

These live at the application root (not under /api/v1) so orchestrators and
load balancers can probe them without knowing the API version.

  - GET /health   liveness  — cheap, no I/O. "Is the process up?"
  - GET /ready    readiness — checks Postgres + Redis. "Can it serve traffic?"
  - GET /version  build/runtime metadata.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

logger = logging.getLogger(__name__)

router = APIRouter(tags=["system"])

# Bound dependency probes so a readiness check never hangs.
_CONNECT_TIMEOUT_SECONDS = 2


@router.get("/health", summary="Liveness probe")
async def health() -> dict:
    """Liveness: the process is up and the event loop is responsive.

    Intentionally performs no I/O so a slow/down dependency never makes the
    process look dead and get killed/restarted.
    """
    return {"status": "ok"}


@router.get("/version", summary="Build and runtime metadata")
async def version() -> dict:
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "debug": settings.DEBUG,
    }


async def _check_database() -> tuple[bool, str | None]:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:  # noqa: BLE001 — report any failure as not-ready
        logger.warning("Readiness: database check failed (%s)", type(exc).__name__)
        return False, "unavailable"


async def _check_redis() -> tuple[bool, str | None]:
    # Bound the connect with socket_connect_timeout. Note: connect to an IPv4
    # host (127.0.0.1 or a service name), not 'localhost' — redis-py's connect
    # timeout misbehaves with IPv6 'localhost' (::1) resolution on Windows.
    try:
        import redis.asyncio as redis  # local import keeps redis optional at import time

        client = redis.from_url(
            settings.REDIS_URL, socket_connect_timeout=_CONNECT_TIMEOUT_SECONDS
        )
        try:
            await client.ping()
        finally:
            await client.aclose()
        return True, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Readiness: redis check failed (%s)", type(exc).__name__)
        return False, "unavailable"


@router.get("/ready", summary="Readiness probe")
async def ready() -> JSONResponse:
    """Readiness: every backing dependency the app needs to serve traffic is up.

    Returns 200 only when all checks pass; otherwise 503 with safe categories.
    """
    db_ok, db_err = await _check_database()
    redis_ok, redis_err = await _check_redis()

    checks = {
        "database": {"ok": db_ok, "error": db_err},
        "redis": {"ok": redis_ok, "error": redis_err},
    }
    all_ok = db_ok and redis_ok
    status_code = 200 if all_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={"status": "ready" if all_ok else "not_ready", "checks": checks},
    )
