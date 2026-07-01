"""Generate historical service records across vehicles."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ServiceCenter, ServiceRecord, Vehicle
from app.seeds.base import load_json, rng

_NOW = datetime.now(timezone.utc)


async def generate_service_records(
    session: AsyncSession,
    service_center: ServiceCenter,
    vehicles: list[Vehicle],
    count: int,
) -> list[ServiceRecord]:
    if not vehicles:
        return []

    rule_catalog = load_json("maintenance_rules.json")
    records: list[ServiceRecord] = []
    for _ in range(count):
        vehicle = rng.choice(vehicles)
        rule = rng.choice(rule_catalog)
        # Service happened in the past, at a km below the vehicle's current km.
        days_ago = rng.randint(15, 900)
        performed_date = _NOW - timedelta(days=days_ago)
        max_km = max(1000, vehicle.current_km)
        performed_km = rng.randint(int(max_km * 0.2), max_km)
        base_cost = rule.get("estimated_cost") or 100.0
        cost = round(base_cost * rng.uniform(0.85, 1.3), 2)
        records.append(
            ServiceRecord(
                service_center_id=service_center.id,
                vehicle_id=vehicle.id,
                appointment_id=None,
                service_type=rule["service_type"],
                description=rule.get("description"),
                performed_km=performed_km,
                performed_date=performed_date,
                cost=cost,
                technician_notes=None,
                warranty_km=rng.choice([None, 10000, 20000]),
                warranty_months=rng.choice([None, 6, 12]),
            )
        )
    session.add_all(records)
    await session.flush()
    return records
