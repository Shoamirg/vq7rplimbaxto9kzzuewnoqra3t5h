"""Lightweight Redis-backed idempotency for booking-style write operations.

A client sends an ``Idempotency-Key`` header; if the same key is replayed (double
click, Telegram retry, network glitch) we return the original result instead of
creating a duplicate. Degrades gracefully: if Redis is unavailable the operation
proceeds without idempotency rather than failing the booking.
"""
from __future__ import annotations

import logging
from typing import Optional, Tuple

import redis.asyncio as redis

from app.core.config import settings

logger = logging.getLogger(__name__)

_PENDING = "pending"
_TTL_SECONDS = 24 * 3600


class IdempotencyStore:
    def __init__(self, url: Optional[str] = None):
        self._url = url or settings.REDIS_URL

    def _client(self):
        return redis.from_url(self._url, socket_connect_timeout=2)

    async def reserve(self, key: str) -> Tuple[str, Optional[str]]:
        """Attempt to claim ``key``.

        Returns (state, value):
          - ("new", None)          -> caller should proceed, then call store()
          - ("done", result_id)    -> a prior request finished; replay result_id
          - ("in_progress", None)  -> a concurrent request holds the key
          - ("unavailable", None)  -> Redis down; proceed without idempotency
        """
        try:
            client = self._client()
            try:
                acquired = await client.set(key, _PENDING, nx=True, ex=_TTL_SECONDS)
                if acquired:
                    return "new", None
                existing = await client.get(key)
                existing = existing.decode() if isinstance(existing, bytes) else existing
                if existing and existing != _PENDING:
                    return "done", existing
                return "in_progress", None
            finally:
                await client.aclose()
        except Exception as exc:  # noqa: BLE001 — never block a booking on Redis
            logger.warning("Idempotency unavailable (%s); proceeding without it", exc)
            return "unavailable", None

    async def store(self, key: str, value: str) -> None:
        try:
            client = self._client()
            try:
                await client.set(key, value, ex=_TTL_SECONDS)
            finally:
                await client.aclose()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Idempotency write failed (%s)", exc)

    async def release(self, key: str) -> None:
        """Release a still-pending reservation so the client can retry (on error)."""
        try:
            client = self._client()
            try:
                current = await client.get(key)
                current = current.decode() if isinstance(current, bytes) else current
                if current == _PENDING:
                    await client.delete(key)
            finally:
                await client.aclose()
        except Exception:  # noqa: BLE001
            pass


idempotency_store = IdempotencyStore()
