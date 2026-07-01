"""Seed service centers / tenants (idempotent by unique email)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ServiceCenter
from app.seeds.base import get_or_create


async def seed_service_center(
    session: AsyncSession,
    *,
    name: str,
    email: str,
    phone: str | None = None,
    address: str | None = None,
    timezone: str = "UTC",
) -> ServiceCenter:
    center, _ = await get_or_create(
        session,
        ServiceCenter,
        defaults={
            "name": name,
            "phone": phone,
            "address": address,
            "timezone": timezone,
        },
        email=email,
    )
    return center
