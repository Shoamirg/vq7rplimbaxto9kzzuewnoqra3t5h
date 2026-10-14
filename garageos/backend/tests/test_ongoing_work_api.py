"""The all-date ongoing-work shortcut relies on the existing server list filter."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import update

from app.core.database import async_session_factory
from app.models import Appointment
from tests.test_mechanic_work_api import client, identity, workshop, create_job


async def test_all_date_ongoing_work_search_and_pages_exclude_finished_jobs(client, workshop):
    jobs = [await create_job(client, workshop, time=f"{hour}:00") for hour in range(10, 14)]
    async with async_session_factory() as session:
        for job, status in zip(jobs, ["in_progress", "in_progress", "completed", "cancelled"]):
            await session.execute(update(Appointment).where(Appointment.id == uuid.UUID(job)).values(
                appointment_date=datetime(2020, 5, 1, tzinfo=timezone.utc), status=status,
            ))
        await session.commit()
    params = {"status": "in_progress", "q": "Assigned customer", "page_size": 1}
    headers = workshop["admin"]
    first = await client.get("/api/v1/appointments", headers=headers, params=params)
    second = await client.get("/api/v1/appointments", headers=headers, params={**params, "page": 2})
    assert first.status_code == second.status_code == 200
    assert first.json()["total"] == second.json()["total"] == 2
    assert {row["id"] for row in first.json()["items"] + second.json()["items"]} == set(jobs[:2])
    assert all(row["appointment_date"].startswith("2020-05-01") for row in first.json()["items"])
    today_only = await client.get("/api/v1/appointments", headers=headers,
                                  params={**params, "date_from": "2030-05-01", "date_to": "2030-05-01"})
    assert today_only.json()["total"] == 0
    missing = await client.get("/api/v1/appointments", headers=headers, params={**params, "q": "missing"})
    assert missing.json()["total"] == 0
    assert (await client.get("/api/v1/appointments", headers=workshop["mechanics"][2], params=params)).status_code == 403
