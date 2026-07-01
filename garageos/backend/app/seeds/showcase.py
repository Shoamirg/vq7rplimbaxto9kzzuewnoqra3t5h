"""Showcase vehicles with engineered health, so the demo spans every band.

The maintenance engine derives health from mileage vs service intervals vs the
most recent service record. To land a vehicle in a target band we control that
relationship directly: lower mileage + recent, near-complete service history =
Excellent; higher mileage + partial/older history = Fair; the bulk random
vehicles (high mileage, sparse history) stay Poor.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import List

from app.models import Customer, MaintenanceRule, ServiceCenter, ServiceRecord, Vehicle, VehicleModel
from app.seeds.base import COLORS, TRANSMISSIONS, license_plate, rng, vin

_NOW = datetime.now(timezone.utc)

# band, count, (km_min, km_max), (interval-consumed min, max), rule coverage, (months-ago min, max)
# Full coverage + low wear -> high average; partial coverage leaves overdue
# services that drag the average down into the lower bands.
_TIERS = [
    ("excellent", 3, (15000, 35000), (0.02, 0.08), 1.0, (1, 3)),
    ("good", 4, (40000, 70000), (0.10, 0.20), 1.0, (1, 5)),
    ("fair", 6, (70000, 110000), (0.25, 0.50), 0.75, (3, 9)),
]


async def generate_showcase_vehicles(
    session,
    center: ServiceCenter,
    customers: List[Customer],
    models: List[VehicleModel],
    rules: List[MaintenanceRule],
) -> List[Vehicle]:
    if not customers or not models or not rules:
        return []

    rules_by_brand: dict = defaultdict(list)
    for rule in rules:
        rules_by_brand[rule.brand_id].append(rule)
    models_with_rules = [m for m in models if m.brand_id in rules_by_brand]
    if not models_with_rules:
        return []

    vehicles: List[Vehicle] = []
    records: List[ServiceRecord] = []

    for band, count, (km_min, km_max), (c_min, c_max), coverage, (mo_min, mo_max) in _TIERS:
        for _ in range(count):
            model = rng.choice(models_with_rules)
            current_km = rng.randint(km_min, km_max)
            engine = None
            if model.engine_options:
                engine = rng.choice([e.strip() for e in model.engine_options.split(",")])
            vehicle = Vehicle(
                service_center_id=center.id,
                customer_id=rng.choice(customers).id,
                vehicle_model_id=model.id,
                year=rng.randint(2018, 2023),
                license_plate=license_plate(),
                vin=vin(),
                engine_type=engine,
                transmission=rng.choice(TRANSMISSIONS),
                color=rng.choice(COLORS),
                current_km=current_km,
                notes=f"Showcase: {band} health",
            )
            session.add(vehicle)
            await session.flush()
            vehicles.append(vehicle)

            for rule in rules_by_brand[model.brand_id]:
                # Skipping a rule leaves it un-serviced (overdue) — drags the score.
                if rng.random() > coverage:
                    continue
                interval = rule.interval_km or 20000
                consumed_km = int(rng.uniform(c_min, c_max) * interval)
                performed_km = max(500, current_km - consumed_km)
                days_ago = rng.randint(mo_min * 30, mo_max * 30)
                records.append(ServiceRecord(
                    service_center_id=center.id,
                    vehicle_id=vehicle.id,
                    appointment_id=None,
                    service_type=rule.service_type,
                    description=rule.description,
                    performed_km=performed_km,
                    performed_date=_NOW - timedelta(days=days_ago),
                    cost=rule.estimated_cost,
                ))

    if records:
        session.add_all(records)
        await session.flush()
    return vehicles
