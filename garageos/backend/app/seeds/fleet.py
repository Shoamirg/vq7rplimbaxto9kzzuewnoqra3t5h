"""Engineered fleet with a realistic, healthy-leaning health distribution.

The maintenance engine derives health from mileage vs service intervals vs the
most recent service record. Random vehicles with no history score "poor" on
everything — a whole fleet of them reads as a broken garage, not a polished
demo. So we generate the *entire* fleet with controlled mileage + service
coverage to land a believable spread: mostly excellent/good, some fair, a small
poor tail (the up-sell opportunities that make "needs attention" meaningful).

This is what makes Demo Mode a known, polished starting point: the RNG is
seeded (see base.rng), so a `--fresh` reseed reproduces the same fleet every
time. One vehicle is pinned as a near-perfect hero for the flagship screen.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import List

from app.models import Customer, MaintenanceRule, ServiceCenter, ServiceRecord, Vehicle, VehicleModel
from app.seeds.base import COLORS, TRANSMISSIONS, license_plate, rng, vin

_NOW = datetime.now(timezone.utc)

# band, weight, (km_min, km_max), (interval-consumed min, max), rule coverage, (months-ago min, max)
# Full coverage + low wear -> high score; partial coverage leaves overdue
# services that drag the average down into the lower bands. Weights sum to 1.0
# and skew healthy — a well-run workshop, not a scrapyard.
_BANDS = [
    ("excellent", 0.33, (10000, 34000), (0.02, 0.08), 1.00, (1, 3)),
    ("good", 0.46, (34000, 78000), (0.10, 0.25), 0.95, (1, 6)),
    ("fair", 0.15, (72000, 120000), (0.30, 0.55), 0.75, (3, 10)),
    ("poor", 0.06, (128000, 235000), (0.70, 0.95), 0.45, (10, 26)),
]

# The flagship "digital passport" vehicle — pinned to near-perfect so the
# Vehicle Health screen always has a hero to open on.
_HERO = {"km": 18000, "consumed": 0.03}


def _band_counts(total: int) -> list[tuple]:
    """Split ``total`` across bands by weight (largest-remainder), sum == total.

    Returns ``(band, (km_range, consumed_range, coverage, months_range), count)``.
    """
    exact = [total * weight for _band, weight, *_rest in _BANDS]
    counts = [int(x) for x in exact]
    # Hand leftover units to the bands with the largest fractional parts.
    order = sorted(range(len(_BANDS)), key=lambda i: exact[i] - int(exact[i]), reverse=True)
    for i in range(total - sum(counts)):
        counts[order[i % len(order)]] += 1
    return [
        (band, (km_range, consumed_range, coverage, months_range), counts[i])
        for i, (band, _weight, km_range, consumed_range, coverage, months_range)
        in enumerate(_BANDS)
    ]


def _add_history(
    records: List[ServiceRecord],
    center: ServiceCenter,
    vehicle: Vehicle,
    rules: List[MaintenanceRule],
    *,
    consumed_range: tuple,
    coverage: float,
    months_range: tuple,
    force_full: bool = False,
) -> None:
    c_min, c_max = consumed_range
    mo_min, mo_max = months_range
    for rule in rules:
        # Skipping a rule leaves it un-serviced (overdue) — drags the score.
        if not force_full and rng.random() > coverage:
            continue
        interval = rule.interval_km or 20000
        consumed_km = int(rng.uniform(c_min, c_max) * interval)
        performed_km = max(500, (vehicle.current_km or 0) - consumed_km)
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


async def generate_fleet_vehicles(
    session,
    center: ServiceCenter,
    customers: List[Customer],
    models: List[VehicleModel],
    rules: List[MaintenanceRule],
    count: int,
) -> List[Vehicle]:
    """Generate ``count`` vehicles across a healthy-leaning health distribution."""
    if not customers or not models or not rules or count <= 0:
        return []

    rules_by_brand: dict = defaultdict(list)
    for rule in rules:
        rules_by_brand[rule.brand_id].append(rule)
    models_with_rules = [m for m in models if m.brand_id in rules_by_brand]
    if not models_with_rules:
        return []

    # Expand bands into a flat, shuffled assignment list. Shuffling matters:
    # fleet_health samples the first N vehicles by insertion order, so a
    # band-ordered fleet would make that sample unrepresentative (all healthy).
    assignments: List[tuple] = []
    for band, spec, band_count in _band_counts(count):
        assignments.extend([(band, spec)] * band_count)
    rng.shuffle(assignments)

    vehicles: List[Vehicle] = []
    records: List[ServiceRecord] = []
    is_first_excellent = True

    for band, (km_range, consumed_range, coverage, months_range) in assignments:
        model = rng.choice(models_with_rules)
        # The first excellent-band vehicle is the pinned near-perfect hero.
        hero = band == "excellent" and is_first_excellent
        current_km = _HERO["km"] if hero else rng.randint(*km_range)
        engine = None
        if model.engine_options:
            engine = rng.choice([e.strip() for e in model.engine_options.split(",")])
        vehicle = Vehicle(
            service_center_id=center.id,
            customer_id=rng.choice(customers).id,
            vehicle_model_id=model.id,
            year=rng.randint(2018, 2024),
            license_plate=license_plate(),
            vin=vin(),
            engine_type=engine,
            transmission=rng.choice(TRANSMISSIONS),
            color=rng.choice(COLORS),
            current_km=current_km,
            notes=f"Demo fleet: {band} health",
        )
        session.add(vehicle)
        await session.flush()
        vehicles.append(vehicle)

        if hero:
            # Spread the hero's history across ~a year so the passport reads as a
            # genuine multi-service record, not one clustered date.
            _add_history(
                records, center, vehicle, rules_by_brand[model.brand_id],
                consumed_range=(_HERO["consumed"], _HERO["consumed"]),
                coverage=1.0, months_range=(1, 11),
                force_full=True,
            )
            is_first_excellent = False
        else:
            _add_history(
                records, center, vehicle, rules_by_brand[model.brand_id],
                consumed_range=consumed_range, coverage=coverage, months_range=months_range,
            )

    if records:
        session.add_all(records)
        await session.flush()
    return vehicles
