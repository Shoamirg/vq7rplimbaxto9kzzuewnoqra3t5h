"""Phase A tests: slot generation, calendar aggregation, and drag/drop moves."""
from __future__ import annotations

import uuid
from collections import namedtuple
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.models import (
    AppointmentSlot,
    Brand,
    Customer,
    Role,
    ServiceCenter,
    User,
    Vehicle,
    VehicleModel,
)
from app.models.appointment_slot import AppointmentSlotStatus
from app.repositories.unit_of_work import UnitOfWork
from app.services.appointment_service import AppointmentService

Tenant = namedtuple("Tenant", "center customer vehicle")
DAY = date(2030, 4, 1)


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
        vehicle_model_id=model.id, year=2018, current_km=40000,
    )
    session.add(vehicle)
    await session.flush()
    return Tenant(center, customer, vehicle)


def _service(session, center):
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    return AppointmentService(uow), uow


async def test_generate_slots_creates_and_is_idempotent(session):
    t = await _tenant(session)
    svc, _ = _service(session, t.center)

    first = await svc.generate_slots_range(
        start_date=DAY, days=2, start_hour=9, end_hour=11,
        slot_minutes=30, mechanic_names=["Alex", "Sam"],
    )
    # 2 days x 2 mechanics x 4 slots (09:00,09:30,10:00,10:30) = 16
    assert first == {"created": 16, "skipped": 0}

    again = await svc.generate_slots_range(
        start_date=DAY, days=2, start_hour=9, end_hour=11,
        slot_minutes=30, mechanic_names=["Alex", "Sam"],
    )
    assert again == {"created": 0, "skipped": 16}  # idempotent


async def test_calendar_aggregates(session):
    t = await _tenant(session)
    # A mechanic user (lane) for this tenant. Reuse the global 'mechanic' role
    # (name is unique) — create it only if this DB has none.
    role = (await session.execute(select(Role).where(Role.name == "mechanic"))).scalar_one_or_none()
    if role is None:
        role = Role(name="mechanic")
        session.add(role)
        await session.flush()
    session.add(User(
        service_center_id=t.center.id, email=f"mech-{uuid.uuid4().hex}@test.app",
        password_hash="x", full_name="Alex Mechanic", role_id=role.id,
    ))
    await session.flush()

    svc, _ = _service(session, t.center)
    await svc.generate_slots_range(
        start_date=DAY, days=1, start_hour=9, end_hour=11,
        slot_minutes=30, mechanic_names=["Alex Mechanic"],
    )
    # Book the first available slot.
    slot = (await svc.slot_repo.list_in_range(
        datetime.combine(DAY, datetime.min.time(), tzinfo=timezone.utc),
        datetime.combine(date(2030, 4, 2), datetime.min.time(), tzinfo=timezone.utc),
    ))[0]
    await svc.create_appointment(
        customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=slot.id
    )

    cal = await svc.get_calendar(DAY, date(2030, 4, 2))
    assert any(m["name"] == "Alex Mechanic" for m in cal["mechanics"])
    assert len(cal["appointments"]) == 1
    assert len(cal["slots"]) >= 1
    assert cal["blocked"] == []


async def test_move_frees_old_slot_and_books_new(session):
    t = await _tenant(session)
    svc, _ = _service(session, t.center)

    def _slot(start):
        s = AppointmentSlot(
            service_center_id=t.center.id, mechanic_name="Alex",
            slot_date=datetime(2030, 4, 1, int(start[:2]), int(start[3:]), tzinfo=timezone.utc),
            start_time=start, end_time="00:00", duration_minutes=30,
            status=AppointmentSlotStatus.AVAILABLE,
        )
        session.add(s)
        return s

    slot1, slot2 = _slot("09:00"), _slot("10:00")
    await session.flush()

    booked = await svc.create_appointment(
        customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=slot1.id
    )
    result = await svc.move_appointment(uuid.UUID(booked["id"]), slot2.id)

    await session.refresh(slot1)
    await session.refresh(slot2)
    assert slot1.status == AppointmentSlotStatus.AVAILABLE
    assert slot1.appointment_id is None
    assert slot2.status == AppointmentSlotStatus.BOOKED
    assert result["appointment_time"] == "10:00"


async def test_assign_mechanic(session):
    t = await _tenant(session)
    svc, _ = _service(session, t.center)
    slot = AppointmentSlot(
        service_center_id=t.center.id, mechanic_name="Alex",
        slot_date=datetime(2030, 4, 1, 9, 0, tzinfo=timezone.utc),
        start_time="09:00", end_time="09:30", duration_minutes=30,
        status=AppointmentSlotStatus.AVAILABLE,
    )
    session.add(slot)
    await session.flush()

    booked = await svc.create_appointment(
        customer_id=t.customer.id, vehicle_id=t.vehicle.id, slot_id=slot.id
    )
    result = await svc.assign_mechanic(uuid.UUID(booked["id"]), "Bob")
    assert result["mechanic_name"] == "Bob"
    await session.refresh(slot)
    assert slot.mechanic_name == "Bob"
