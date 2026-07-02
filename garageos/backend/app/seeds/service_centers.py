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
    brand_name: str | None = None,
    tagline: str | None = None,
    monogram: str | None = None,
    primary_color: str | None = None,
    accent_color: str | None = None,
    slug: str | None = None,
) -> ServiceCenter:
    center, created = await get_or_create(
        session,
        ServiceCenter,
        defaults={
            "name": name,
            "phone": phone,
            "address": address,
            "timezone": timezone,
            "brand_name": brand_name,
            "tagline": tagline,
            "monogram": monogram,
            "primary_color": primary_color,
            "accent_color": accent_color,
            "slug": slug,
        },
        email=email,
    )
    # Keep branding current on existing tenants (idempotent reseeds).
    if not created:
        center.brand_name = brand_name
        center.tagline = tagline
        center.monogram = monogram
        center.primary_color = primary_color
        center.accent_color = accent_color
        center.slug = slug
    return center
