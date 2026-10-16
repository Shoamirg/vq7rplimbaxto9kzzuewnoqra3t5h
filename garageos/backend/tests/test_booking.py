"""Booking lifecycle tests (Sprint 3 Phase 2) at the service layer.

Each test builds a self-contained tenant in a rolled-back transaction and drives
AppointmentService directly, asserting state transitions, slot handling, the
completion value chain, and emitted domain events.
"""
from __future__ import annotations

import uuid
from collections import namedtuple
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.core.events import (
    AppointmentCancelled,
    AppointmentCompleted,
    AppointmentConfirmed,
    AppointmentCreated,
)
from app.exceptions import (
    AppointmentConflict,
    AppointmentStateError,
    CustomerNotFound,
    SlotUnavailable,
    VehicleNotFound,
)
from app.models import (
    AppointmentSlot,
    Brand,
    Customer,
    MaintenanceRule,
    ServiceCenter,
    ServiceRecord,
    Vehicle,
    VehicleModel,
)
from app.models.appointment_slot import AppointmentSlotStatus
from app.repositories.unit_of_work import UnitOfWork
from app.services.appointment_service import AppointmentService

Tenant = namedtuple("Tenant", "center brand model customer vehicle")
WHEN = datetime(2030, 1, 15, 9, 0, tzinfo=timezone.utc)


async def _tenant(session) -> Tenant:
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
        vehicle_model_id=model.id, year=2018, current_km=50000,
    )
    session.add(vehicle)
    await session.flush()
    return Tenant(center, brand, model, customer, vehicle)


async def _slot(session, center, *, start="09:00", mechanic="Alex") -> AppointmentSlot:
    slot = AppointmentSlot(
        service_center_id=center.id, mechanic_name=mechanic, slot_date=WHEN,
        start_time=start, end_time="09:30", duration_minutes=30,
        status=AppointmentSlotStatus.AVAILABLE,
    )
    session.add(slot)
    await session.flush()
    return slot


def _service(session, center):
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    return AppointmentService(uow), uow


# --- create -----------------------------------------------------------------

async def test_create_books_slot_and_emits_event(session):
    t = await _tenant(session)
    slot = await _slot(session, t.center)
    svc, uow = _service(session, t.center)

    result = await svc.create_appointment(
        customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=slot.id
    )

    assert result["status"] == "pending"
    await session.refresh(slot)
    assert slot.status == AppointmentSlotStatus.BOOKED
    assert slot.appointment_id is not None
    assert any(isinstance(e, AppointmentCreated) for e in uow._events)


async def test_create_conflicting_time_raises(session):
    t = await _tenant(session)
    slot1 = await _slot(session, t.center, start="09:00")
    slot2 = await _slot(session, t.center, start="09:00")  # same date/time/mechanic
    svc, _ = _service(session, t.center)

    await svc.create_appointment(customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=slot1.id)
    with pytest.raises(AppointmentConflict):
        await svc.create_appointment(customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=slot2.id)


async def test_create_invalid_slot_raises(session):
    t = await _tenant(session)
    svc, _ = _service(session, t.center)
    with pytest.raises(SlotUnavailable):
        await svc.create_appointment(
            customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=uuid.uuid4()
        )


async def test_create_invalid_vehicle_raises(session):
    t = await _tenant(session)
    slot = await _slot(session, t.center)
    svc, _ = _service(session, t.center)
    with pytest.raises(VehicleNotFound):
        await svc.create_appointment(
            customer_id=t.customer.id, vehicle_id=uuid.uuid4(), slot_id=slot.id
        )


async def test_create_invalid_customer_raises(session):
    t = await _tenant(session)
    slot = await _slot(session, t.center)
    svc, _ = _service(session, t.center)
    with pytest.raises(CustomerNotFound):
        await svc.create_appointment(
            customer_id=uuid.uuid4(), vehicle_id=t.vehicle.id, slot_id=slot.id
        )


async def test_create_cannot_use_another_tenants_slot(session):
    a = await _tenant(session)
    b = await _tenant(session)
    slot_b = await _slot(session, b.center)
    svc_a, _ = _service(session, a.center)
    # Slot belongs to tenant B; tenant-A's scoped slot repo can't see it -> unavailable.
    with pytest.raises(SlotUnavailable):
        await svc_a.create_appointment(
            customer_id=a.customer.id, vehicle_id=a.vehicle.id, slot_id=slot_b.id
        )


# --- confirm ----------------------------------------------------------------

async def test_confirm_pending(session):
    t = await _tenant(session)
    slot = await _slot(session, t.center)
    svc, uow = _service(session, t.center)
    booked = await svc.create_appointment(customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=slot.id)

    result = await svc.confirm_appointment(uuid.UUID(booked["id"]))
    assert result["status"] == "confirmed"
    assert any(isinstance(e, AppointmentConfirmed) for e in uow._events)


async def test_confirm_non_pending_raises(session):
    t = await _tenant(session)
    slot = await _slot(session, t.center)
    svc, _ = _service(session, t.center)
    booked = await svc.create_appointment(customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=slot.id)
    await svc.confirm_appointment(uuid.UUID(booked["id"]))
    with pytest.raises(AppointmentStateError):
        await svc.confirm_appointment(uuid.UUID(booked["id"]))


# --- cancel -----------------------------------------------------------------

async def test_cancel_releases_slot_and_emits_event(session):
    t = await _tenant(session)
    slot = await _slot(session, t.center)
    svc, uow = _service(session, t.center)
    booked = await svc.create_appointment(customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=slot.id)

    result = await svc.cancel_appointment(uuid.UUID(booked["id"]), reason="customer request")
    assert result["status"] == "cancelled"
    await session.refresh(slot)
    assert slot.status == AppointmentSlotStatus.AVAILABLE
    assert slot.appointment_id is None
    assert any(isinstance(e, AppointmentCancelled) for e in uow._events)


# --- complete (the value chain) ---------------------------------------------

async def test_complete_creates_record_recalcs_health_and_emits_event(session):
    t = await _tenant(session)
    rule = MaintenanceRule(
        service_center_id=t.center.id, brand_id=t.brand.id,
        service_type="Oil Change", interval_km=10000, is_required=True,
    )
    session.add(rule)
    await session.flush()
    slot = await _slot(session, t.center)
    svc, uow = _service(session, t.center)
    booked = await svc.create_appointment(
        customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=slot.id,
        maintenance_rule_id=rule.id,
    )
    await svc.confirm_appointment(uuid.UUID(booked["id"]))
    await svc.assign_mechanic(uuid.UUID(booked["id"]), "Demo mechanic")
    await svc.start_appointment(uuid.UUID(booked["id"]))

    result = await svc.complete_appointment(
        uuid.UUID(booked["id"]), odometer_km=60000, total_cost=99.0
    )

    assert result["status"] == "completed"
    assert result["service_record_id"]
    assert result["vehicle_health_score"] is not None

    records = (await session.execute(
        select(ServiceRecord).where(ServiceRecord.appointment_id == uuid.UUID(booked["id"]))
    )).scalars().all()
    assert len(records) == 1
    assert records[0].service_type == "Oil Change"
    assert records[0].performed_km == 60000

    await session.refresh(t.vehicle)
    assert t.vehicle.current_km == 60000  # odometer advanced
    assert any(isinstance(e, AppointmentCompleted) for e in uow._events)
