"""Seed the global brand catalog from data/brands.json (idempotent)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Brand
from app.seeds.base import get_or_create, load_json


async def seed_brands(session: AsyncSession) -> dict[str, Brand]:
    brands: dict[str, Brand] = {}
    for entry in load_json("brands.json"):
        brand, _ = await get_or_create(
            session,
            Brand,
            defaults={"logo_url": entry.get("logo_url")},
            name=entry["name"],
        )
        brands[brand.name] = brand
    return brands
