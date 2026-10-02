"""Reception scheduling must respect each mechanic's entire work interval."""
from datetime import date
from uuid import UUID
import asyncio

import pytest

from app.exceptions import AppointmentConflict
from app.models.appointment_slot import AppointmentSlot, AppointmentSlotStatus
from tests.test_calendar import _tenant, _service


DAY = date(2032, 10, 2)


async def _book(svc, tenant, time="09:00", mechanic="Usta Ali", duration=60):
    return await svc.create_appointment_direct(
        customer_id=tenant.customer.id, vehicle_id=tenant.vehicle.id,
        appointment_date=DAY, appointment_time=time,
        mechanic_name=mechanic, estimated_duration_minutes=duration,
    )


async def test_direct_booking_rejects_overlap_not_only_equal_start(session):
    tenant = await _tenant(session)
    svc, _ = _service(session, tenant.center)
    await _book(svc, tenant)
    with pytest.raises(AppointmentConflict):
        await _book(svc, tenant, time="09:30")


async def test_distinct_mechanics_and_adjacent_intervals_are_allowed(session):
    tenant = await _tenant(session)
    svc, _ = _service(session, tenant.center)
    await _book(svc, tenant)
    await _book(svc, tenant, mechanic="Usta Vali")
    await _book(svc, tenant, time="10:00")
    await _book(svc, tenant, time="09:30", mechanic=None)


async def test_change_time_duration_or_mechanic_checks_conflicts(session):
    tenant = await _tenant(session)
    svc, _ = _service(session, tenant.center)
    await _book(svc, tenant)
    second = await _book(svc, tenant, time="10:00", duration=30)
    with pytest.raises(AppointmentConflict):
        await svc.update_appointment(UUID(second["id"]), appointment_time="09:30")
    third = await _book(svc, tenant, time="08:00", duration=30)
    with pytest.raises(AppointmentConflict):
        await svc.update_appointment(UUID(third["id"]), estimated_duration_minutes=90)
    other = await _book(svc, tenant, mechanic="Usta Vali")
    with pytest.raises(AppointmentConflict):
        await svc.assign_mechanic(UUID(other["id"]), "  Usta Ali  ")
    # An unchanged appointment must not conflict with itself.
    await svc.update_appointment(UUID(second["id"]), appointment_time="10:00")


async def test_overlap_across_midnight_and_other_tenant_isolation(session):
    tenant = await _tenant(session)
    svc, _ = _service(session, tenant.center)
    await _book(svc, tenant, time="23:30", duration=90)
    with pytest.raises(AppointmentConflict):
        await svc.create_appointment_direct(
            customer_id=tenant.customer.id, vehicle_id=tenant.vehicle.id,
            appointment_date=date(2032, 10, 3), appointment_time="00:15",
            mechanic_name="Usta Ali", estimated_duration_minutes=30,
        )
    other = await _tenant(session)
    other_svc, _ = _service(session, other.center)
    await _book(other_svc, other, time="23:30", duration=90)


async def test_cancelled_visit_releases_mechanic_time(session):
    tenant = await _tenant(session)
    svc, _ = _service(session, tenant.center)
    first = await _book(svc, tenant)
    await svc.cancel_appointment(UUID(first["id"]))
    await _book(svc, tenant, time="09:30")


async def test_available_slots_and_calendar_hide_direct_booking_overlap(session):
    tenant = await _tenant(session)
    svc, _ = _service(session, tenant.center)
    await svc.generate_slots_range(start_date=DAY, days=1, start_hour=9, end_hour=11,
                                   slot_minutes=30, mechanic_names=["Usta Ali", "Usta Vali"])
    await _book(svc, tenant)
    available = await svc.get_available_slots(tenant.center.id, DAY)
    assert not any(s["mechanic"] == "Usta Ali" and s["time"] in ("09:00", "09:30") for s in available)
    assert any(s["mechanic"] == "Usta Vali" and s["time"] == "09:30" for s in available)
    calendar = await svc.get_calendar(DAY, date(2032, 10, 3))
    assert {s["start_time"] for s in calendar["blocked"] if s["mechanic"] == "Usta Ali"} == {"09:00", "09:30"}


async def test_free_edit_releases_original_generated_slot(session):
    tenant = await _tenant(session)
    svc, _ = _service(session, tenant.center)
    await svc.generate_slots_range(start_date=DAY, days=1, start_hour=9, end_hour=10,
                                   slot_minutes=30, mechanic_names=["Usta Ali"])
    slots = await svc.slot_repo.find_available(tenant.center.id, DAY)
    original = slots[0]
    booked = await svc.create_appointment(customer_id=tenant.customer.id, vehicle_id=tenant.vehicle.id, slot_id=original.id)
    await svc.update_appointment(UUID(booked["id"]), appointment_time="11:00")
    await session.refresh(original)
    assert original.status == AppointmentSlotStatus.AVAILABLE
    assert original.appointment_id is None
    assert any(s["time"] == "09:00" for s in await svc.get_available_slots(tenant.center.id, DAY))


async def test_slot_booking_and_move_respect_direct_booking(session):
    from datetime import datetime, timezone

    tenant = await _tenant(session)
    svc, _ = _service(session, tenant.center)
    await _book(svc, tenant)
    slot = AppointmentSlot(
        service_center_id=tenant.center.id, mechanic_name="Usta Ali",
        slot_date=datetime(2032, 10, 2, 9, 30, tzinfo=timezone.utc),
        start_time="09:30", end_time="10:00", duration_minutes=30,
        status=AppointmentSlotStatus.AVAILABLE,
    )
    session.add(slot)
    await session.flush()
    with pytest.raises(AppointmentConflict):
        await svc.create_appointment(
            customer_id=tenant.customer.id, vehicle_id=tenant.vehicle.id, slot_id=slot.id,
        )
    second = await _book(svc, tenant, time="11:00")
    with pytest.raises(AppointmentConflict):
        await svc.move_appointment(UUID(second["id"]), slot.id)


@pytest.mark.parametrize("operation", ["booking", "slot_generation"])
async def test_simultaneous_schedule_writes_do_not_duplicate_booking_or_slots(session, operation):
    from sqlalchemy import delete
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.models import Brand, ServiceCenter, VehicleModel

    tenant = await _tenant(session)
    model = await session.get(VehicleModel, tenant.vehicle.vehicle_model_id)
    model_id, brand_id, center_id = model.id, model.brand_id, tenant.center.id
    await session.commit()  # Independent transactions must see the same customer.
    factory = async_sessionmaker(session.bind, expire_on_commit=False)

    async def receptionist():
        async with factory() as connection:
            try:
                async with connection.begin():
                    svc, _ = _service(connection, tenant.center)
                    if operation == "booking":
                        await _book(svc, tenant, time="12:00")
                        outcome = "booked"
                    else:
                        result = await svc.generate_slots_range(
                            start_date=DAY, days=1, start_hour=12, end_hour=13,
                            slot_minutes=30, mechanic_names=["Usta Ali"],
                        )
                        outcome = "created" if result["created"] == 2 else "existing"
                return outcome
            except AppointmentConflict:
                return "conflict"

    try:
        outcomes = await asyncio.gather(receptionist(), receptionist())
        assert sorted(outcomes) == (["booked", "conflict"] if operation == "booking" else ["created", "existing"])
    finally:
        await session.rollback()
        await session.execute(delete(ServiceCenter).where(ServiceCenter.id == center_id))
        await session.execute(delete(VehicleModel).where(VehicleModel.id == model_id))
        await session.execute(delete(Brand).where(Brand.id == brand_id))
        await session.commit()
