"""Operational summary must count the same active tenant records as its queue."""
import uuid
from datetime import date, datetime, timezone

import httpx
from sqlalchemy import update

from app.core.database import async_session_factory
from app.main import app
from app.models import Appointment, Customer, User, Vehicle
from app.repositories.unit_of_work import UnitOfWork
from tests.test_calendar_period_api import workshop  # noqa: F401
from tests.test_mechanic_work_api import create_job, workshop as mechanic_workshop  # noqa: F401
from tests.test_staff_access_lifecycle import client, identity  # noqa: F401


async def test_queue_summary_today_excludes_inactive_and_foreign_records(client, workshop, identity):
    jobs = [await create_job(client, workshop) for _ in range(3)]
    current_day = datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc)
    async with async_session_factory() as session:
        await session.execute(update(Appointment).where(Appointment.id.in_([uuid.UUID(id) for id in jobs])).values(appointment_date=current_day))
        await session.execute(update(Appointment).where(Appointment.id == uuid.UUID(jobs[1])).values(is_active=False))
        await session.execute(update(Appointment).where(Appointment.id == uuid.UUID(jobs[2])).values(status="cancelled"))
        foreign_actor = await session.get(User, uuid.UUID(workshop["ids"][2]))
        foreign_customer = Customer(service_center_id=foreign_actor.service_center_id, full_name="Other queue tenant")
        session.add(foreign_customer)
        await session.flush()
        foreign_vehicle = Vehicle(service_center_id=foreign_actor.service_center_id, customer_id=foreign_customer.id,
                                  vehicle_model_id=uuid.UUID(workshop["model"]), year=2024)
        session.add(foreign_vehicle)
        await session.flush()
        session.add(Appointment(service_center_id=foreign_actor.service_center_id, customer_id=foreign_customer.id,
                                vehicle_id=foreign_vehicle.id, appointment_date=current_day,
                                appointment_time="10:00", status="pending"))
        await session.commit()
    summary = await client.get("/api/v1/appointments/stats", headers=workshop["admin"])
    assert summary.status_code == 200
    assert summary.json() == dict(today_count=2, pending_count=1, confirmed_count=0, completed_count=0, cancelled_count=1)
    queue = await client.get("/api/v1/appointments", headers=workshop["admin"], params={"date_from": str(date.today()), "date_to": str(date.today())})
    assert queue.status_code == 200 and {row["id"] for row in queue.json()["items"]} == {jobs[0], jobs[2]}
    # A mechanic from the other fixture garage cannot read this staff summary.
    foreign = await client.get("/api/v1/appointments/stats", headers=workshop["mechanics"][2])
    assert foreign.status_code == 403
    # Give only this owned fixture account the existing admin role; its token
    # must resolve current stored permissions and return only its garage counts.
    async with async_session_factory() as session:
        admin = await session.get(User, identity["user"])
        await session.execute(update(User).where(User.id == uuid.UUID(workshop["ids"][2])).values(role_id=admin.role_id))
        await session.commit()
    foreign_summary = await client.get("/api/v1/appointments/stats", headers=workshop["mechanics"][2])
    assert foreign_summary.status_code == 200
    assert foreign_summary.json() == dict(today_count=1, pending_count=1, confirmed_count=0, completed_count=0, cancelled_count=0)


async def test_appointment_update_is_committed_before_success_is_sent(client, workshop, monkeypatch):
    job = await create_job(client, workshop)
    target = "2038-04-04T09:00:00Z"
    observations = []
    committed = False
    original_commit = UnitOfWork.commit

    async def record_commit(uow):
        nonlocal committed
        await original_commit(uow)
        committed = True

    async def observe_response(scope, receive, send):
        async def observed_send(message):
            if message["type"] == "http.response.start" and message["status"] == 200:
                # Observe the first success send, before ASGITransport waits for
                # request-scope cleanup. A separate actual PG session must see
                # the persisted date, not this request's flushed identity map.
                committed_at_send = committed
                async with async_session_factory() as session:
                    row = await session.get(Appointment, uuid.UUID(job))
                    observations.append((committed_at_send, row.appointment_date.date().isoformat()))
            await send(message)
        await app(scope, receive, observed_send)

    with monkeypatch.context() as patch:
        patch.setattr(UnitOfWork, "commit", record_commit)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=observe_response, raise_app_exceptions=False), base_url="http://test") as observed:
            response = await observed.patch(f"/api/v1/appointments/{job}", headers=workshop["admin"],
                                            json={"appointment_date": target, "appointment_time": "09:00"})
    assert response.status_code == 200
    assert response.json()["appointment_date"][:10] == target[:10]
    assert observations == [(True, target[:10])]
    immediate = await client.get(f"/api/v1/appointments/{job}", headers=workshop["admin"])
    assert immediate.status_code == 200 and immediate.json()["appointment_date"][:10] == target[:10]


async def test_appointment_update_commit_failure_cannot_send_success(client, workshop, monkeypatch):
    job = await create_job(client, workshop)
    before = await client.get(f"/api/v1/appointments/{job}", headers=workshop["admin"])
    statuses = []

    async def failed_commit(uow):
        raise RuntimeError("Controlled appointment commit failure")

    async def observe_response(scope, receive, send):
        async def observed_send(message):
            if message["type"] == "http.response.start":
                statuses.append(message["status"])
            await send(message)
        await app(scope, receive, observed_send)

    with monkeypatch.context() as patch:
        patch.setattr(UnitOfWork, "commit", failed_commit)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=observe_response, raise_app_exceptions=False), base_url="http://test") as observed:
            response = await observed.patch(f"/api/v1/appointments/{job}", headers=workshop["admin"],
                                            json={"appointment_date": "2038-04-05T09:00:00Z", "appointment_time": "09:00"})
    assert response.status_code == 500 and statuses == [500]
    after = await client.get(f"/api/v1/appointments/{job}", headers=workshop["admin"])
    assert after.status_code == 200
    assert after.json()["appointment_date"] == before.json()["appointment_date"]
    assert after.json()["appointment_time"] == before.json()["appointment_time"]
