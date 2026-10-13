"""Persistent, one-time refresh-token rotation shared by staff and customers."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.exceptions import InvalidToken
from app.models.refresh_session_token import RefreshSessionToken


class RefreshTokenReplay(InvalidToken):
    """A previously consumed token was presented again; its family is revoked."""


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_expiry(payload: dict) -> datetime:
    try:
        return datetime.fromtimestamp(float(payload["exp"]), tz=timezone.utc)
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        raise InvalidToken() from exc


def _principal_fields(*, staff_user_id: uuid.UUID | None, customer_id: uuid.UUID | None) -> dict:
    if (staff_user_id is None) == (customer_id is None):
        raise ValueError("Exactly one refresh-token principal is required")
    return {"staff_user_id": staff_user_id, "customer_id": customer_id}


def _belongs_to(
    row: RefreshSessionToken,
    *,
    staff_user_id: uuid.UUID | None,
    customer_id: uuid.UUID | None,
) -> bool:
    return row.staff_user_id == staff_user_id and row.customer_id == customer_id


async def register_refresh_token(
    session: AsyncSession,
    token: str,
    family_id: uuid.UUID,
    *,
    staff_user_id: uuid.UUID | None = None,
    customer_id: uuid.UUID | None = None,
) -> None:
    payload = decode_token(token)
    if not payload:
        raise InvalidToken()
    session.add(
        RefreshSessionToken(
            family_id=family_id,
            token_hash=token_hash(token),
            expires_at=token_expiry(payload),
            **_principal_fields(staff_user_id=staff_user_id, customer_id=customer_id),
        )
    )
    await session.flush()


async def _find_token(session: AsyncSession, digest: str) -> RefreshSessionToken | None:
    return (
        await session.execute(
            select(RefreshSessionToken)
            .where(RefreshSessionToken.token_hash == digest)
            .with_for_update()
        )
    ).scalar_one_or_none()


async def _revoke_family(session: AsyncSession, family_id: uuid.UUID) -> None:
    await session.execute(
        update(RefreshSessionToken)
        .where(
            RefreshSessionToken.family_id == family_id,
            RefreshSessionToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(timezone.utc))
    )
    await session.flush()


async def consume_refresh_token(
    session: AsyncSession,
    token: str,
    payload: dict,
    *,
    staff_user_id: uuid.UUID | None = None,
    customer_id: uuid.UUID | None = None,
) -> uuid.UUID:
    """Consume one token and return its family id; bootstrap pre-migration tokens once."""
    principal = _principal_fields(staff_user_id=staff_user_id, customer_id=customer_id)
    digest = token_hash(token)
    row = await _find_token(session, digest)

    if row is None:
        # Existing signed tokens have no database record. Let each one migrate
        # exactly once while preserving the old JWT claims and API response.
        family_id = uuid.uuid5(uuid.NAMESPACE_URL, digest)
        legacy = RefreshSessionToken(
            family_id=family_id,
            token_hash=digest,
            expires_at=token_expiry(payload),
            used_at=datetime.now(timezone.utc),
            **principal,
        )
        try:
            async with session.begin_nested():
                session.add(legacy)
                await session.flush()
        except IntegrityError:
            # Another request migrated the same token while this one waited on
            # the unique index. Re-read under a row lock and treat it as replay.
            row = await _find_token(session, digest)
            if row is None:
                raise InvalidToken()
        else:
            return family_id

    assert row is not None
    if not _belongs_to(row, staff_user_id=staff_user_id, customer_id=customer_id):
        raise InvalidToken()
    if row.revoked_at is not None:
        raise InvalidToken()
    if row.used_at is not None:
        await _revoke_family(session, row.family_id)
        raise RefreshTokenReplay()

    row.used_at = datetime.now(timezone.utc)
    await session.flush()
    return row.family_id


async def revoke_refresh_token(
    session: AsyncSession,
    token: str,
    payload: dict,
    *,
    staff_user_id: uuid.UUID | None = None,
    customer_id: uuid.UUID | None = None,
) -> None:
    """Revoke a whole family; also tombstone an untracked legacy token."""
    principal = _principal_fields(staff_user_id=staff_user_id, customer_id=customer_id)
    digest = token_hash(token)
    row = await _find_token(session, digest)
    if row is None:
        family_id = uuid.uuid5(uuid.NAMESPACE_URL, digest)
        tombstone = RefreshSessionToken(
            family_id=family_id,
            token_hash=digest,
            expires_at=token_expiry(payload),
            used_at=datetime.now(timezone.utc),
            revoked_at=datetime.now(timezone.utc),
            **principal,
        )
        try:
            async with session.begin_nested():
                session.add(tombstone)
                await session.flush()
        except IntegrityError:
            row = await _find_token(session, digest)
            if row is None:
                return
        else:
            return

    assert row is not None
    if _belongs_to(row, staff_user_id=staff_user_id, customer_id=customer_id):
        await _revoke_family(session, row.family_id)
