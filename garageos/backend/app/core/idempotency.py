"""PostgreSQL-backed idempotency for business writes.

The idempotency row, domain changes, and replay response share one transaction.
If the transaction rolls back, retrying the same key can safely execute again;
if it commits but the HTTP response is lost, retry returns the stored response.
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.exceptions import IdempotencyKeyRequired, IdempotencyKeyReuse
from app.models.idempotency_record import IdempotencyRecord
from app.repositories.unit_of_work import UnitOfWork

T = TypeVar("T")


def request_fingerprint(operation: str, request: Any) -> str:
    """Hash a canonical JSON representation without retaining request data."""
    encoded = jsonable_encoder(request)
    canonical = json.dumps(
        {"operation": operation, "request": encoded},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def require_idempotency_key(key: str | None) -> None:
    """Refuse mutations without a retry token in staging and production."""
    if settings.ENVIRONMENT in {"staging", "production"} and not key:
        raise IdempotencyKeyRequired()


async def execute_idempotent(
    uow: UnitOfWork,
    *,
    key: str | None,
    operation: str,
    request: Any,
    execute: Callable[[], Awaitable[T]],
) -> T | dict | list:
    """Run once per tenant/key and replay the exact successful response.

    Keys remain optional in local development for compatibility with internal
    scripts. Staging and production reject missing keys, so released clients
    cannot accidentally bypass the guarantee.
    """
    if key is not None:
        key = key.strip()
    require_idempotency_key(key)
    if not key:
        return await execute()
    if len(key) > 128:
        raise IdempotencyKeyRequired("Idempotency-Key must be at most 128 characters")
    if uow.service_center_id is None or uow.session is None:
        raise RuntimeError("Idempotent business writes require a tenant-scoped UnitOfWork")

    request_hash = request_fingerprint(operation, request)
    stmt = (
        insert(IdempotencyRecord)
        .values(
            service_center_id=uow.service_center_id,
            key=key,
            request_hash=request_hash,
            response_payload=None,
        )
        .on_conflict_do_nothing(index_elements=[
            IdempotencyRecord.service_center_id,
            IdempotencyRecord.key,
        ])
        .returning(IdempotencyRecord.id)
    )
    inserted_id = (await uow.session.execute(stmt)).scalar_one_or_none()

    if inserted_id is None:
        existing = await uow.session.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.service_center_id == uow.service_center_id,
                IdempotencyRecord.key == key,
            )
        )
        if existing is None:
            # The conflicting transaction could have rolled back while this
            # request was waiting. Retry the claim once before rejecting it.
            inserted_id = (await uow.session.execute(stmt)).scalar_one_or_none()
        else:
            if existing.request_hash != request_hash:
                raise IdempotencyKeyReuse()
            if existing.response_payload is None:
                # Successful rows are finalized in the same transaction, so a
                # committed empty response indicates corrupted/incomplete data.
                raise IdempotencyKeyReuse(
                    "This Idempotency-Key has no completed result; use a new key"
                )
            return existing.response_payload

    if inserted_id is None:
        raise IdempotencyKeyReuse("The request is still being processed; retry with the same key")

    response = await execute()
    response_payload = jsonable_encoder(response)
    await uow.session.execute(
        update(IdempotencyRecord)
        .where(IdempotencyRecord.id == inserted_id)
        .values(response_payload=response_payload)
    )
    return response
