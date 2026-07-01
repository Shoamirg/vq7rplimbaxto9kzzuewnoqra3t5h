"""Seed the global vehicle-model catalog from data/models.json (idempotent)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Brand, VehicleModel
from app.seeds.base import get_or_create, load_json


async def seed_vehicle_models(
    session: AsyncSession, brands: dict[str, Brand]
) -> list[VehicleModel]:
    models: list[VehicleModel] = []
    for entry in load_json("models.json"):
        brand = brands.get(entry["brand"])
        if brand is None:
            raise ValueError(
                f"models.json references unknown brand {entry['brand']!r}; "
                f"add it to brands.json first."
            )
        model, _ = await get_or_create(
            session,
            VehicleModel,
            defaults={
                "engine_options": entry.get("engine_options"),
                "year_start": entry.get("year_start"),
                "year_end": entry.get("year_end"),
            },
            brand_id=brand.id,
            name=entry["name"],
        )
        models.append(model)
    return models
