"""Persisted QA token families for seeded identities, never a production bypass.

Tests that focus on authorization can supply a synthetic signed demo claim while
still exercising the normal server session, identity and tenant checks. Invalid
proof tests continue using the low-level JWT encoder explicitly.
"""
import uuid

from sqlalchemy import select

from app.core.database import async_session_factory
from app.models import Customer, User
from app.services.auth_session_service import AuthSessionService


async def persisted_pair(claims):
    kind = "customer" if claims.get("type", "access").startswith("customer_") else "staff"
    model = Customer if kind == "customer" else User
    async with async_session_factory() as session:
        principal = await session.scalar(select(model).where(model.id == uuid.UUID(claims["sub"])))
        if principal is None:
            raise ValueError("Persisted QA credentials require a real seeded principal")
        data = {key: value for key, value in claims.items() if key not in {"type", "exp", "sid", "jti"}}
        return await AuthSessionService(session).issue(kind=kind, principal_id=principal.id,
            center_id=principal.service_center_id, claims=data)


async def persisted_access(claims):
    return (await persisted_pair(claims))["access_token"]
