"""Final-invoice work queue through authenticated HTTP and PostgreSQL."""
import uuid

import pytest
from sqlalchemy import event, update

from app.core.database import async_session_factory, engine
from app.models import Appointment, User
from app.models.invoice import Invoice
from tests.test_mechanic_work_api import client, identity, workshop, create_job


async def completed_job(client, workshop):
    job = await create_job(client, workshop)
    async with async_session_factory() as session:
        await session.execute(update(Appointment).where(Appointment.id == uuid.UUID(job)).values(status="completed"))
        await session.commit()
    detail = (await client.get(f"/api/v1/appointments/{job}", headers=workshop["admin"])).json()
    return job, detail


@pytest.mark.parametrize("document", ["none", "estimate", "inactive", "foreign", "invoice", "draft", "void"])
async def test_queue_uses_same_tenant_active_final_document_not_estimates(client, workshop, identity, document):
    job, detail = await completed_job(client, workshop)
    invoice_id = None
    if document != "none":
        async with async_session_factory() as session:
            foreign = await session.get(User, uuid.UUID(workshop["ids"][2]))
            invoice = Invoice(service_center_id=foreign.service_center_id if document == "foreign" else identity["center"],
                customer_id=uuid.UUID(detail["customer_id"]), vehicle_id=uuid.UUID(detail["vehicle_id"]),
                appointment_id=uuid.UUID(job), code=f"QUEUE-{uuid.uuid4().hex[:12]}",
                kind="estimate" if document == "estimate" else "invoice",
                status=document if document in {"draft", "void"} else "issued", is_active=document != "inactive")
            session.add(invoice)
            await session.commit()
            invoice_id = str(invoice.id)
    headers = workshop["admin"]
    listed = (await client.get("/api/v1/appointments", headers=headers)).json()
    row = next(item for item in listed["items"] if item["id"] == job)
    present = document in {"invoice", "draft", "void"}
    assert row["final_invoice_id"] == (invoice_id if present else None)
    assert row["awaiting_invoice"] is (not present)
    queue = await client.get("/api/v1/appointments", headers=headers, params={"awaiting_invoice": "true"})
    assert queue.status_code == 200, queue.text
    assert queue.json()["total"] == (0 if present else 1)
    assert [item["id"] for item in queue.json()["items"]] == ([] if present else [job])


async def test_queue_excludes_other_statuses_and_refreshes_after_single_invoice_creation(client, workshop):
    job, detail = await completed_job(client, workshop)
    await create_job(client, workshop)  # Pending visits must never enter the queue.
    headers = workshop["admin"]
    before = (await client.get("/api/v1/appointments", headers=headers, params={"awaiting_invoice": "true"})).json()
    assert [row["id"] for row in before["items"]] == [job]
    payload = {"kind": "invoice", "customer_id": detail["customer_id"],
        "vehicle_id": detail["vehicle_id"], "appointment_id": job,
        "line_items": [{"description": "Diagnostika", "quantity": 1, "unit_price": 100000, "kind": "labor"}],
        "tax_rate": 0,
    }
    created = await client.post("/api/v1/invoices", headers=headers, json=payload)
    assert created.status_code == 201, created.text
    repeated = await client.post("/api/v1/invoices", headers=headers, json=payload)
    assert repeated.status_code == 201, repeated.text
    assert repeated.json()["id"] == created.json()["id"]
    after = (await client.get("/api/v1/appointments", headers=headers, params={"awaiting_invoice": "true"})).json()
    assert after["items"] == []
    assert after["total"] == 0
    all_rows = (await client.get("/api/v1/appointments", headers=headers)).json()["items"]
    done = next(row for row in all_rows if row["id"] == job)
    assert done["final_invoice_id"] == created.json()["id"]
    assert done["awaiting_invoice"] is False
    pending = next(row for row in all_rows if row["id"] != job)
    assert pending["awaiting_invoice"] is False
    assert (await client.get("/api/v1/appointments", headers=workshop["mechanics"][0], params={"awaiting_invoice": "true"})).status_code == 403


async def test_queue_search_pages_and_invoice_metadata_are_bounded_to_visible_jobs(client, workshop):
    jobs = [await create_job(client, workshop, time=f"{hour}:00") for hour in range(10, 15)]
    async with async_session_factory() as session:
        for job, status in zip(jobs, ["completed", "completed", "in_progress", "cancelled", "completed"]):
            await session.execute(update(Appointment).where(Appointment.id == uuid.UUID(job)).values(
                status=status, is_active=job != jobs[-1],
            ))
        await session.commit()

    metadata_queries = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("SELECT invoices.appointment_id, invoices.id"):
            metadata_queries.append((statement, parameters))

    event.listen(engine.sync_engine, "before_cursor_execute", capture)
    try:
        headers = workshop["admin"]
        params = {"awaiting_invoice": "true", "q": "Assigned customer", "page_size": 1}
        first = await client.get("/api/v1/appointments", headers=headers, params=params)
        second = await client.get("/api/v1/appointments", headers=headers, params={**params, "page": 2})
        assert first.status_code == second.status_code == 200
        assert first.json()["total"] == second.json()["total"] == 2
        rows = first.json()["items"] + second.json()["items"]
        assert {row["id"] for row in rows} == set(jobs[:2])
        assert all(row["awaiting_invoice"] is True for row in rows)
        assert len(metadata_queries) == 2  # One batch per non-empty page, never per row.
        for (_, parameters), row in zip(metadata_queries, rows):
            assert uuid.UUID(row["id"]) in parameters
            assert sum(value in {uuid.UUID(job) for job in jobs} for value in parameters) == 1
        missing = await client.get("/api/v1/appointments", headers=headers, params={**params, "q": "missing"})
        assert missing.json()["items"] == []
        assert missing.json()["total"] == 0
        assert len(metadata_queries) == 2  # No lookup for an empty page.
        full = await client.get("/api/v1/appointments", headers=headers, params={"awaiting_invoice": "true"})
        assert len(full.json()["items"]) == 2
        assert len(metadata_queries) == 3
        assert all(uuid.UUID(job) in metadata_queries[-1][1] for job in jobs[:2])
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", capture)
