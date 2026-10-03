"""Identity guarantees at the PostgreSQL write boundary, including imports."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Brand, Customer, ServiceCenter, Vehicle, VehicleModel


async def _center(session):
    center = ServiceCenter(name="Identity test")
    session.add(center)
    await session.flush()
    return center


async def test_database_rejects_same_active_phone_with_different_formatting(session):
    center = await _center(session)
    session.add(Customer(service_center_id=center.id, full_name="Original",
                         phone="+998 (90) 123-4567"))
    await session.flush()

    with pytest.raises(IntegrityError, match="uq_customers_center_phone_active"):
        async with session.begin_nested():
            session.add(Customer(service_center_id=center.id, full_name="Duplicate",
                                 phone="998901234567"))
            await session.flush()


@pytest.mark.parametrize("field", ["license_plate", "vin"])
async def test_vehicle_identifiers_can_be_reused_after_archive_and_in_other_garages(session, field):
    first = await _center(session)
    second = await _center(session)
    owners = [Customer(service_center_id=center.id, full_name="Owner") for center in (first, second)]
    brand = Brand(name=f"Identity-{uuid.uuid4().hex}")
    session.add_all([*owners, brand])
    await session.flush()
    model = VehicleModel(brand_id=brand.id, name="Model")
    session.add(model)
    await session.flush()
    for center, owner, active, identifier in [
        (first, owners[0], False, "JH4KA8260MC"),
        (first, owners[0], True, "JH4KA8260MC"),
        (second, owners[1], True, "JH4KA8260MC"),
        (first, owners[0], True, None),
        (first, owners[0], True, ""),
        (first, owners[0], True, ""),
    ]:
        session.add(Vehicle(service_center_id=center.id, customer_id=owner.id,
                            vehicle_model_id=model.id, year=2020, is_active=active,
                            **{field: identifier}))
    await session.flush()


async def test_phone_can_be_shared_across_garages_and_reused_after_archiving(session):
    first = await _center(session)
    second = await _center(session)
    session.add_all([
        Customer(service_center_id=first.id, full_name="Archived", phone="+998901234567", is_active=False),
        Customer(service_center_id=first.id, full_name="Replacement", phone="998901234567"),
        Customer(service_center_id=second.id, full_name="Other garage", phone="+998901234567"),
        Customer(service_center_id=first.id, full_name="Unknown phone A"),
        Customer(service_center_id=first.id, full_name="Unknown phone B", phone=""),
        Customer(service_center_id=first.id, full_name="Unknown phone C", phone=""),
    ])
    await session.flush()


@pytest.mark.parametrize("field,original,duplicate,index", [
    ("license_plate", "01 A 123 BC", "01-a123bc", "uq_vehicles_center_plate_active"),
    ("vin", "JH4-KA8260MC", "jh4ka8260mc", "uq_vehicles_center_vin_active"),
])
async def test_database_rejects_duplicate_active_vehicle_identifiers(session, field, original, duplicate, index):
    center = await _center(session)
    customer = Customer(service_center_id=center.id, full_name="Owner")
    brand = Brand(name=f"Identity-{uuid.uuid4().hex}")
    session.add_all([customer, brand])
    await session.flush()
    model = VehicleModel(brand_id=brand.id, name="Model")
    session.add(model)
    await session.flush()
    values = dict(service_center_id=center.id, customer_id=customer.id,
                  vehicle_model_id=model.id, year=2020)
    session.add(Vehicle(**values, **{field: original}))
    await session.flush()

    with pytest.raises(IntegrityError, match=index):
        async with session.begin_nested():
            session.add(Vehicle(**values, **{field: duplicate}))
            await session.flush()
