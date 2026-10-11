"""Vehicle Health API tests (service layer)."""
from __future__ import annotations

import uuid
from collections import namedtuple
from datetime import datetime, timezone

import pytest

from app.exceptions import VehicleNotFound
from app.models import (
    Appointment,
    Brand,
    Customer,
    MaintenanceRule,
    ServiceCenter,
    ServiceRecord,
    Vehicle,
    VehicleModel,
)
from app.repositories.unit_of_work import UnitOfWork
from app.services.vehicle_health_service import VehicleHealthService, _passport_highlights

Ctx = namedtuple("Ctx", "center brand model customer vehicle")


def test_passport_highlights_do_not_claim_certification_or_unobserved_mileage():
    empty = _passport_highlights("North Garage", 0, False, 2)
    assert empty == [
        {"label": "Service records available", "ok": False},
        {"label": "No tracked high-priority services overdue", "ok": False},
        {"label": "Mileage recorded in service history", "ok": False},
        {"label": "Service records from North Garage", "ok": True},
    ]

    recorded = _passport_highlights("North Garage", 3, True, 0)
    assert [item["ok"] for item in recorded] == [True, True, True, True]
    assert all("certif" not in item["label"].lower() and "verif" not in item["label"].lower() for item in recorded)


async def _ctx(session, *, current_km: int = 60000) -> Ctx:
    center = ServiceCenter(name="T", email=f"t-{uuid.uuid4().hex}@test.local")
    session.add(center)
    await session.flush()
    brand = Brand(name=f"Brand-{uuid.uuid4().hex[:8]}")
    session.add(brand)
    await session.flush()
    model = VehicleModel(brand_id=brand.id, name="M1", year_start=2015)
    session.add(model)
    await session.flush()
    customer = Customer(service_center_id=center.id, full_name="Cust")
    session.add(customer)
    await session.flush()
    vehicle = Vehicle(
        service_center_id=center.id, customer_id=customer.id,
        vehicle_model_id=model.id, year=2018, license_plate="ABC123",
        current_km=current_km,
    )
    session.add(vehicle)
    await session.flush()
    return Ctx(center, brand, model, customer, vehicle)


async def _rule(session, ctx: Ctx, service_type: str, interval_km: int) -> MaintenanceRule:
    rule = MaintenanceRule(
        service_center_id=ctx.center.id, brand_id=ctx.brand.id,
        service_type=service_type, interval_km=interval_km, is_required=True,
    )
    session.add(rule)
    await session.flush()
    return rule


def _service(session, center) -> VehicleHealthService:
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    return VehicleHealthService(uow)


async def test_get_health_returns_full_report(session):
    ctx = await _ctx(session, current_km=60000)
    await _rule(session, ctx, "Oil Change", 10000)      # overdue at 60k km
    await _rule(session, ctx, "Brake Inspection", 20000)
    svc = _service(session, ctx.center)

    health = await svc.get_health(ctx.vehicle.id)

    assert isinstance(health["overall_score"], (int, float))
    assert health["band"] in {"excellent", "good", "fair", "poor"}
    assert health["vehicle"]["license_plate"] == "ABC123"
    assert len(health["services"]) == 2
    assert {c["name"] for c in health["categories"]} == {"Engine & Fluids", "Brakes"}
    assert health["urgent_count"] >= 1  # oil change overdue


async def test_due_services_are_filtered_and_sorted(session):
    ctx = await _ctx(session, current_km=100000)
    await _rule(session, ctx, "Oil Change", 10000)         # overdue -> due
    await _rule(session, ctx, "Timing Belt", 500000)       # far away -> not due
    svc = _service(session, ctx.center)

    due = await svc.get_due_services(ctx.vehicle.id)
    assert due["due_count"] >= 1
    assert all(s["is_due"] for s in due["services"])
    assert any(s["service_type"] == "Oil Change" for s in due["services"])


async def test_timeline_merges_services_and_appointments(session):
    ctx = await _ctx(session)
    session.add(ServiceRecord(
        service_center_id=ctx.center.id, vehicle_id=ctx.vehicle.id,
        service_type="Oil Change", performed_km=40000,
        performed_date=datetime(2029, 1, 1, tzinfo=timezone.utc),
    ))
    session.add(Appointment(
        service_center_id=ctx.center.id, customer_id=ctx.customer.id,
        vehicle_id=ctx.vehicle.id, appointment_date=datetime(2030, 6, 1, tzinfo=timezone.utc),
        appointment_time="09:00", status="completed", estimated_duration_minutes=60,
    ))
    await session.flush()
    svc = _service(session, ctx.center)

    timeline = await svc.get_timeline(ctx.vehicle.id)
    types = {e["type"] for e in timeline["events"]}
    assert "service" in types
    assert any(t.startswith("appointment_") for t in types)
    # newest first
    dates = [e["date"] for e in timeline["events"]]
    assert dates == sorted(dates, reverse=True)


async def test_fleet_health_aggregates(session):
    ctx = await _ctx(session, current_km=100000)
    await _rule(session, ctx, "Oil Change", 10000)  # makes vehicle overdue/urgent
    # second vehicle in same tenant
    v2 = Vehicle(
        service_center_id=ctx.center.id, customer_id=ctx.customer.id,
        vehicle_model_id=ctx.model.id, year=2020, current_km=90000,
    )
    session.add(v2)
    await session.flush()
    svc = _service(session, ctx.center)

    fleet = await svc.fleet_health()
    assert fleet["evaluated_count"] == 2
    assert isinstance(fleet["average_score"], (int, float))
    assert sum(fleet["distribution"].values()) == 2
    assert len(fleet["needs_attention"]) >= 1


async def test_cross_tenant_vehicle_is_404(session):
    a = await _ctx(session)
    b = await _ctx(session)
    svc_a = _service(session, a.center)
    with pytest.raises(VehicleNotFound):
        await svc_a.get_health(b.vehicle.id)
