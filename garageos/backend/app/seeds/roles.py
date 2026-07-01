"""Seed the global role catalog (idempotent)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Role
from app.seeds.base import get_or_create

ROLES = [
    ("super_admin", "Platform-wide administrator across all service centers"),
    ("admin", "Service center administrator"),
    ("manager", "Service center manager"),
    ("mechanic", "Workshop technician"),
    ("receptionist", "Front-desk / scheduling staff"),
]


async def seed_roles(session: AsyncSession) -> dict[str, Role]:
    roles: dict[str, Role] = {}
    for name, description in ROLES:
        role, _ = await get_or_create(
            session, Role, defaults={"description": description}, name=name
        )
        roles[name] = role
    return roles
