"""Redis-backed fixed-window rate limiting as a FastAPI dependency.

Public-facing endpoints (auth especially) need a brute-force / abuse ceiling once
the platform is on the open internet. Like the idempotency store, this **degrades
open** — if Redis is unavailable we allow the request rather than lock everyone
out. A ceiling that fails closed would be its own outage.

Design notes (hardened after security review):
  * One shared, pooled Redis client — never a connection per request. Under the
    exact burst the limiter exists to stop, per-request handshakes would exhaust
    Redis connections and silently degrade the limiter open.
  * INCR + EXPIRE run atomically in a single Lua eval, so a crash can't leave a
    key with no TTL (which would block an IP permanently).
  * Client IP is only taken from proxy headers when explicitly trusted, and then
    from the RIGHTMOST forwarded hop — proxies append the real peer, so the last
    value is trustworthy and the leftmost is attacker-controlled.

Usage (in a router):

    from app.core.rate_limit import auth_rate_limit
    @router.post("/login", dependencies=[Depends(auth_rate_limit)])
    async def login(...): ...
"""
from __future__ import annotations

import logging
from typing import Callable, Optional

import redis.asyncio as redis
from fastapi import Request

from app.core.config import settings
from app.exceptions import RateLimitExceeded

logger = logging.getLogger(__name__)

# Atomic increment-with-expiry. Setting the TTL only on the first hit, in the same
# round trip as the INCR, closes the window where a crash between a separate INCR
# and EXPIRE would leave the key with no expiry — a permanent block on that IP.
# Returns [count, ttl] so the caller needs no second round trip for Retry-After.
_INCR_EXPIRE_LUA = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('TTL', KEYS[1])}
"""

_client: Optional[redis.Redis] = None


def _get_client() -> redis.Redis:
    """Lazily create one shared, pooled Redis client, reused across requests."""
    global _client
    if _client is None:
        _client = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
    return _client


async def close_rate_limiter() -> None:
    """Dispose the shared client on application shutdown."""
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        finally:
            _client = None


def client_ip(request: Request) -> str:
    """Best-effort client IP used to key limits.

    Proxy headers are honored only when TRUST_PROXY_HEADERS is set — a directly
    exposed app must not trust client-supplied forwarding headers, or a caller
    could rotate a fake IP on every request and bypass the ceiling. Behind a proxy
    we prefer X-Real-IP (the proxy's direct peer, not client-settable); falling
    back to X-Forwarded-For we take the RIGHTMOST hop, which the proxy appended.
    """
    if settings.TRUST_PROXY_HEADERS:
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


async def _hit(key: str, limit: int, window: int) -> tuple[bool, int]:
    """Register one hit against ``key``. Returns (allowed, retry_after_seconds).

    Degrades open: any Redis error allows the request.
    """
    global _client
    try:
        client = _get_client()
        count, ttl = await client.eval(_INCR_EXPIRE_LUA, 1, key, window)
        if int(count) > limit:
            return False, max(int(ttl), 1)
        return True, 0
    except Exception as exc:  # noqa: BLE001 — never lock users out on a Redis blip
        logger.warning("Rate limiter unavailable (%s); allowing request", exc)
        # Drop the (possibly broken) client so the next call reconnects cleanly.
        _client = None
        return True, 0


def rate_limit(*, limit: int, window: int, scope: str) -> Callable:
    """Build a dependency that enforces ``limit`` requests per ``window`` seconds,
    keyed by (scope, client IP). Different scopes count independently.
    """

    async def _dependency(request: Request) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        ip = client_ip(request)
        allowed, retry_after = await _hit(f"rl:{scope}:{ip}", limit, window)
        if not allowed:
            logger.info("Rate limit hit: scope=%s ip=%s", scope, ip)
            raise RateLimitExceeded(retry_after=retry_after)

    return _dependency


# Ready-made dependencies for the two common tiers.
auth_rate_limit = rate_limit(
    limit=settings.RATE_LIMIT_AUTH_MAX,
    window=settings.RATE_LIMIT_AUTH_WINDOW_SECONDS,
    scope="auth",
)

write_rate_limit = rate_limit(
    limit=settings.RATE_LIMIT_WRITE_MAX,
    window=settings.RATE_LIMIT_WRITE_WINDOW_SECONDS,
    scope="write",
)
