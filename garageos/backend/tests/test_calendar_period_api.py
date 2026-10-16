"""Calendar range/roster and scheduling identities through real tenant HTTP."""
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import update

from app.core.database import async_session_factory
from app.models import Appointment, Customer, Role, ServiceCenter, User, Vehicle
from tests.test_mechanic_work_api import workshop as mechanic_workshop, create_job  # noqa: F401
from tests.test_staff_access_lifecycle import client, identity  # noqa: F401


class PrivateWorkshop(dict):
    def __repr__(self):
        return "<private calendar workshop>"


@pytest_asyncio.fixture
async def workshop(mechanic_workshop):
    return PrivateWorkshop(mechanic_workshop)


async def read_calendar(client, workshop, start="2030-04-29", end="2030-05-06", **params):
    response = await client.get("/api/v1/calendar", headers=workshop["admin"],
                                params={"start": start, "end": end, **params})
    assert response.status_code == 200, response.text
    return response.json()


async def test_period_boundaries_cancelled_opt_in_and_tenant_scope(client, workshop, identity):
    jobs = [await create_job(client, workshop) for _ in range(6)]
    async with async_session_factory() as session:
        for job, day in zip(jobs[:4], ["2030-04-28", "2030-04-29", "2030-05-05", "2030-05-06"]):
            await session.execute(update(Appointment).where(Appointment.id == uuid.UUID(job)).values(
                appointment_date=datetime.fromisoformat(day).replace(tzinfo=timezone.utc)))
        await session.execute(update(Appointment).where(Appointment.id == uuid.UUID(jobs[4])).values(status="cancelled"))
        await session.execute(update(Appointment).where(Appointment.id == uuid.UUID(jobs[5])).values(is_active=False))
        foreign = await session.get(User, uuid.UUID(workshop["ids"][2]))
        customer = Customer(service_center_id=foreign.service_center_id, full_name="Foreign calendar")
        session.add(customer)
        await session.flush()
        vehicle = Vehicle(service_center_id=foreign.service_center_id, customer_id=customer.id,
                          vehicle_model_id=uuid.UUID(workshop["model"]), year=2024)
        session.add(vehicle)
        await session.flush()
        foreign_job = Appointment(service_center_id=foreign.service_center_id, customer_id=customer.id,
                                  vehicle_id=vehicle.id, appointment_date=datetime(2030, 5, 1, tzinfo=timezone.utc),
                                  appointment_time="10:00", status="cancelled")
        session.add(foreign_job)
        await session.commit()
    week = await read_calendar(client, workshop)
    assert {a["id"] for a in week["appointments"]} == set(jobs[1:3])
    assert week["start"] == "2030-04-29" and week["end"] == "2030-05-06"
    opt_in = await read_calendar(client, workshop, include_cancelled="true")
    assert {a["id"] for a in opt_in["appointments"]} == set(jobs[1:3] + [jobs[4]])
    month = await read_calendar(client, workshop, "2030-04-29", "2030-06-03", include_cancelled="true")
    assert {a["id"] for a in month["appointments"]} == set(jobs[1:5])
    cancelled = await client.patch(f"/api/v1/appointments/{jobs[4]}", headers=workshop["admin"],
                                   json={"appointment_time": "14:00"})
    assert cancelled.status_code == 409
    for headers in workshop["mechanics"]:
        assert (await client.get("/api/v1/calendar?start=2030-04-29&end=2030-05-06&include_cancelled=true",
                                 headers=headers)).status_code == 403


@pytest.mark.parametrize("inactive", ["user", "role"])
async def test_calendar_roster_uses_only_active_mechanic_accounts(client, workshop, inactive):
    before = await read_calendar(client, workshop)
    assert {m["id"] for m in before["mechanics"]} == set(workshop["ids"][:2])
    async with async_session_factory() as session:
        if inactive == "user":
            await session.execute(update(User).where(User.id == uuid.UUID(workshop["ids"][0])).values(is_active=False))
        else:
            await session.execute(update(Role).where(Role.id == workshop["role"]).values(is_active=False))
        await session.commit()
    after = await read_calendar(client, workshop)
    expected = {workshop["ids"][1]} if inactive == "user" else set()
    assert {m["id"] for m in after["mechanics"]} == expected


async def test_time_resize_tomorrow_reassignment_and_clear_preserve_native_visibility(client, workshop):
    job = await create_job(client, workshop)
    path = f"/api/v1/appointments/{job}"
    for patch in [{"mechanic_user_id": workshop["ids"][0]}, {"appointment_time": "11:00"},
                  {"estimated_duration_minutes": 90}, {"appointment_date": "2030-05-02T11:00:00Z"}]:
        response = await client.patch(path, headers=workshop["admin"], json=patch)
        assert response.status_code == 200, response.text
        assert response.json()["mechanic_user_id"] == workshop["ids"][0]
        assert (await client.get(f"/api/v1/mechanic/work/{job}", headers=workshop["mechanics"][0])).status_code == 200
    reassigned = await client.patch(path, headers=workshop["admin"], json={"mechanic_user_id": workshop["ids"][1]})
    assert reassigned.status_code == 200
    assert reassigned.json()["mechanic_user_id"] == workshop["ids"][1]
    assert (await client.get(f"/api/v1/mechanic/work/{job}", headers=workshop["mechanics"][0])).status_code == 404
    assert (await client.get(f"/api/v1/mechanic/work/{job}", headers=workshop["mechanics"][1])).status_code == 200
    cleared = await client.patch(path, headers=workshop["admin"], json={"mechanic_name": ""})
    assert cleared.status_code == 200
    assert cleared.json()["mechanic_name"] is None and cleared.json()["mechanic_user_id"] is None
    assert (await client.get(f"/api/v1/mechanic/work/{job}", headers=workshop["mechanics"][1])).status_code == 404


async def test_customer_contacts_and_service_center_dates_are_recorded_staff_reads(client, workshop, identity):
    async with async_session_factory() as session:
        await session.execute(update(ServiceCenter).where(
            ServiceCenter.id == identity["center"]
        ).values(timezone="Asia/Tashkent"))
        await session.commit()
    job = await create_job(client, workshop)
    appointment = (await client.get(f"/api/v1/appointments/{job}", headers=workshop["admin"])).json()
    customer_id = uuid.UUID(appointment["customer_id"])
    async with async_session_factory() as session:
        await session.execute(update(Customer).where(Customer.id == customer_id).values(
            telegram_username="qa_calendar_contact", phone="+998900000032"))
        await session.commit()
    path = f"/api/v1/customers/{customer_id}"
    response = await client.get(path, headers=workshop["admin"])
    assert response.status_code == 200
    details = response.json()
    assert details.get("telegram_username") == "qa_calendar_contact"
    assert details["phone"] == "+998900000032"
    assert details["stats"]["next_booking_local_date"] == "2030-05-01"
    assert details["appointments"][0]["local_date"] == "2030-05-01"
    assert (await client.get(path, headers=workshop["mechanics"][0])).status_code == 403
    async with async_session_factory() as session:
        await session.execute(update(Customer).where(Customer.id == customer_id).values(telegram_username=None, phone=None))
        await session.commit()
    absent = (await client.get(path, headers=workshop["admin"])).json()
    assert absent["telegram_username"] is None and absent["phone"] is None


@pytest.mark.parametrize("start,end", [("2030-05-01", "2030-05-01"), ("2030-05-02", "2030-05-01"),
                                       ("2030-05-01", "2030-08-01")])
async def test_period_bounds_still_reject_empty_reverse_and_over_90_days(client, workshop, start, end):
    response = await client.get("/api/v1/calendar", headers=workshop["admin"],
                                params={"start": start, "end": end, "include_cancelled": "true"})
    assert response.status_code == 400
