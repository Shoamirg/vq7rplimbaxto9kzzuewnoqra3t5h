"""Generate demo vehicles distributed across customers."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, ServiceCenter, Vehicle, VehicleModel
from app.seeds.base import COLORS, TRANSMISSIONS, license_plate, rng, vin

_CURRENT_YEAR = datetime.now(timezone.utc).year


def _pick_year(model: VehicleModel) -> int:
    start = model.year_start or 2010
    end = model.year_end or _CURRENT_YEAR
    if end < start:
        end = start
    return rng.randint(start, end)


async def generate_vehicles(
    session: AsyncSession,
    service_center: ServiceCenter,
    customers: list[Customer],
    models: list[VehicleModel],
    count: int,
) -> list[Vehicle]:
    if not customers or not models:
        return []

    vehicles: list[Vehicle] = []
    for _ in range(count):
        customer = rng.choice(customers)
        model = rng.choice(models)
        year = _pick_year(model)
        # Older cars tend to have more kilometers.
        age = max(0, _CURRENT_YEAR - year)
        current_km = rng.randint(0, 30000) + age * rng.randint(8000, 22000)
        engine = None
        if model.engine_options:
            engine = rng.choice([e.strip() for e in model.engine_options.split(",")])
        vehicle = Vehicle(
            service_center_id=service_center.id,
            customer_id=customer.id,
            vehicle_model_id=model.id,
            year=year,
            license_plate=license_plate(),
            vin=vin(),
            engine_type=engine,
            transmission=rng.choice(TRANSMISSIONS),
            color=rng.choice(COLORS),
            current_km=current_km,
            notes=None,
        )
        vehicles.append(vehicle)
    session.add_all(vehicles)
    await session.flush()
    return vehicles
