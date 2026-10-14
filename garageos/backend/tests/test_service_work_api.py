"""Staff-facing service-work lifecycle through the appointment API."""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_tenant_uow
from app.main import app
from app.models import Brand, Customer, ServiceCenter, Vehicle, VehicleModel
from app.models.invoice import Invoice, InvoiceKind, InvoiceStatus
from app.models.service_record import ServiceRecord
from app.repositories.unit_of_work import UnitOfWork
from app.seeds.invoices import generate_invoices


async def _tenant(session):
    center = ServiceCenter(name="Service work test", email=f"{uuid.uuid4().hex}@test.local")
    session.add(center)
    await session.flush()
    brand = Brand(name=f"Brand-{uuid.uuid4().hex[:8]}")
    session.add(brand)
    await session.flush()
    model = VehicleModel(brand_id=brand.id, name="Test car", year_start=2015)
    session.add(model)
    await session.flush()
    customer = Customer(service_center_id=center.id, full_name="Demo customer")
    session.add(customer)
    await session.flush()
    vehicle = Vehicle(
        service_center_id=center.id, customer_id=customer.id,
        vehicle_model_id=model.id, year=2020, current_km=10000,
    )
    session.add(vehicle)
    await session.flush()
    return center, customer, vehicle


@asynccontextmanager
async def _api_for(session, center_id):
    async def tenant_uow():
        uow = UnitOfWork(service_center_id=center_id)
        uow.session = session
        yield uow

    app.dependency_overrides[get_tenant_uow] = tenant_uow
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_tenant_uow, None)


async def test_assigned_service_work_starts_and_completes_once(session):
    center, customer, vehicle = await _tenant(session)
    async with _api_for(session, center.id) as client:
        created = await client.post("/api/v1/appointments/direct", json={
            "customer_id": str(customer.id), "vehicle_id": str(vehicle.id),
            "appointment_date": date(2030, 5, 1).isoformat(),
            "appointment_time": "10:00",
            "customer_notes": "Tormozda shovqin bor",
        })
        assert created.status_code == 201, created.text
        appointment_id = created.json()["id"]
        assert created.json()["customer_notes"] == "Tormozda shovqin bor"

        confirmed = await client.patch(f"/api/v1/appointments/{appointment_id}/confirm")
        assert confirmed.status_code == 200, confirmed.text

        no_mechanic = await client.patch(f"/api/v1/appointments/{appointment_id}/start")
        assert no_mechanic.status_code == 409, no_mechanic.text

        assigned = await client.patch(
            f"/api/v1/appointments/{appointment_id}/assign-mechanic",
            json={"mechanic_name": "Demo mechanic"},
        )
        assert assigned.status_code == 200, assigned.text

        started = await client.patch(f"/api/v1/appointments/{appointment_id}/start")
        assert started.status_code == 200, started.text
        assert started.json()["status"] == "in_progress"

        completed = await client.patch(
            f"/api/v1/appointments/{appointment_id}/complete",
            json={"service_type": "Diagnostika", "notes": "Dvigatel xatolari tekshirildi"},
        )
        assert completed.status_code == 200, completed.text
        assert completed.json()["status"] == "completed"
        assert completed.json()["notes"] == "Dvigatel xatolari tekshirildi"
        record_id = completed.json()["service_record_id"]
        record = await session.get(ServiceRecord, uuid.UUID(record_id))
        assert record.service_type == "Diagnostika"
        assert record.description == "Dvigatel xatolari tekshirildi"
        timeline = await client.get(f"/api/v1/vehicles/{vehicle.id}/timeline")
        assert timeline.status_code == 200, timeline.text
        assert any(
            event["type"] == "service" and event["id"] == record_id
            for event in timeline.json()["events"]
        )
        search = await client.get("/api/v1/appointments", params={"q": "Diagnostika"})
        assert search.status_code == 200, search.text
        assert any(item["id"] == appointment_id for item in search.json()["items"])

        savepoint = await session.begin_nested()
        session.add(ServiceRecord(
            service_center_id=center.id, vehicle_id=vehicle.id,
            appointment_id=uuid.UUID(appointment_id), service_type="duplicate",
            performed_km=10000, performed_date=datetime.now(timezone.utc),
        ))
        with pytest.raises(IntegrityError):
            await session.flush()
        await savepoint.rollback()

        repeated = await client.patch(
            f"/api/v1/appointments/{appointment_id}/complete", json={}
        )
        assert repeated.status_code == 409, repeated.text


async def test_active_service_work_cannot_be_cancelled(session):
    center, customer, vehicle = await _tenant(session)
    async with _api_for(session, center.id) as client:
        created = await client.post("/api/v1/appointments/direct", json={
            "customer_id": str(customer.id), "vehicle_id": str(vehicle.id),
            "appointment_date": date(2030, 5, 2).isoformat(),
            "appointment_time": "11:00", "mechanic_name": "Demo mechanic",
        })
        assert created.status_code == 201, created.text
        appointment_id = created.json()["id"]

        pending_complete = await client.patch(
            f"/api/v1/appointments/{appointment_id}/complete", json={}
        )
        assert pending_complete.status_code == 409, pending_complete.text
        assert (await client.patch(
            f"/api/v1/appointments/{appointment_id}/confirm"
        )).status_code == 200
        assert (await client.patch(
            f"/api/v1/appointments/{appointment_id}/start"
        )).status_code == 200

        assert (await client.patch(
            f"/api/v1/appointments/{appointment_id}/start"
        )).status_code == 409
        assert (await client.patch(
            f"/api/v1/appointments/{appointment_id}", json={"mechanic_name": " "}
        )).status_code == 409
        assert (await client.patch(
            f"/api/v1/appointments/{appointment_id}/assign-mechanic",
            json={"mechanic_name": " "},
        )).status_code == 409

        cancelled = await client.patch(f"/api/v1/appointments/{appointment_id}/cancel")
        assert cancelled.status_code == 409, cancelled.text
        current = await client.get(f"/api/v1/appointments/{appointment_id}")
        assert current.json()["status"] == "in_progress"


async def test_service_work_actions_are_tenant_scoped(session):
    owner, customer, vehicle = await _tenant(session)
    other, _, _ = await _tenant(session)
    async with _api_for(session, owner.id) as client:
        created = await client.post("/api/v1/appointments/direct", json={
            "customer_id": str(customer.id), "vehicle_id": str(vehicle.id),
            "appointment_date": date(2030, 5, 3).isoformat(),
            "appointment_time": "12:00", "mechanic_name": "Demo mechanic",
        })
        assert created.status_code == 201, created.text
        appointment_id = created.json()["id"]
        assert (await client.patch(
            f"/api/v1/appointments/{appointment_id}/confirm"
        )).status_code == 200

    async with _api_for(session, other.id) as client:
        for action in ("start", "complete"):
            response = await client.patch(
                f"/api/v1/appointments/{appointment_id}/{action}", json={}
            )
            assert response.status_code == 404, response.text


async def test_completed_work_has_one_linked_uzs_invoice(session):
    center, customer, vehicle = await _tenant(session)
    async with _api_for(session, center.id) as client:
        created = await client.post("/api/v1/appointments/direct", json={
            "customer_id": str(customer.id), "vehicle_id": str(vehicle.id),
            "appointment_date": date(2030, 5, 4).isoformat(),
            "appointment_time": "13:00", "mechanic_name": "Demo mechanic",
        })
        assert created.status_code == 201, created.text
        appointment_id = created.json()["id"]
        payload = {
            "kind": "invoice", "customer_id": str(customer.id),
            "vehicle_id": str(vehicle.id), "appointment_id": appointment_id,
            "tax_rate": 0,
            "line_items": [{"kind": "labor", "description": "Diagnostika", "quantity": 1,
                            "unit_price": 150000}],
        }
        pending = await client.post("/api/v1/invoices", json=payload)
        assert pending.status_code == 409, pending.text
        assert (await client.patch(f"/api/v1/appointments/{appointment_id}/confirm")).status_code == 200
        assert (await client.patch(f"/api/v1/appointments/{appointment_id}/start")).status_code == 200
        assert (await client.patch(f"/api/v1/appointments/{appointment_id}/complete", json={})).status_code == 200

        first = await client.post("/api/v1/invoices", json=payload)
        assert first.status_code == 201, first.text
        doc = first.json()
        assert doc["appointment_id"] == appointment_id
        assert doc["customer_id"] == str(customer.id)
        assert doc["vehicle_id"] == str(vehicle.id)
        assert doc["currency"] == "UZS"
        assert doc["total"] == 150000
        assert doc["line_items"][0]["unit_price"] == 150000

        again = await client.post("/api/v1/invoices", json=payload)
        assert again.status_code == 201, again.text
        assert again.json()["id"] == doc["id"]
        lookup = await client.get(f"/api/v1/appointments/{appointment_id}/invoice")
        assert lookup.status_code == 200, lookup.text
        assert lookup.json()["id"] == doc["id"]

        next_visit = await client.post("/api/v1/appointments/direct", json={
            "customer_id": str(customer.id), "vehicle_id": str(vehicle.id),
            "appointment_date": date(2030, 5, 6).isoformat(),
            "appointment_time": "10:00", "mechanic_name": "Demo mechanic",
        })
        assert next_visit.status_code == 201, next_visit.text
        rows = await client.get("/api/v1/appointments?date_from=2030-05-04&date_to=2030-05-06")
        assert rows.status_code == 200, rows.text
        by_id = {item["id"]: item for item in rows.json()["items"]}
        assert by_id[appointment_id]["billing"]["id"] == doc["id"]
        assert by_id[next_visit.json()["id"]]["billing"] is None

        savepoint = await session.begin_nested()
        session.add(Invoice(
            service_center_id=center.id, code="INV-DUPLICATE", kind=InvoiceKind.INVOICE,
            status=InvoiceStatus.ISSUED, customer_id=customer.id, vehicle_id=vehicle.id,
            appointment_id=uuid.UUID(appointment_id), currency="UZS",
        ))
        with pytest.raises(IntegrityError):
            await session.flush()
        await savepoint.rollback()


async def test_appointment_search_filters_before_pagination(session):
    center, customer, vehicle = await _tenant(session)
    hidden_customer = Customer(service_center_id=center.id, full_name="Hidden Page Customer")
    session.add(hidden_customer)
    await session.flush()
    hidden_vehicle = Vehicle(
        service_center_id=center.id, customer_id=hidden_customer.id,
        vehicle_model_id=vehicle.vehicle_model_id, license_plate="SEARCH777",
        year=2021, current_km=5000,
    )
    session.add(hidden_vehicle)
    await session.flush()

    async with _api_for(session, center.id) as client:
        newer = await client.post("/api/v1/appointments/direct", json={
            "customer_id": str(customer.id), "vehicle_id": str(vehicle.id),
            "appointment_date": "2030-05-09", "appointment_time": "10:00",
        })
        older = await client.post("/api/v1/appointments/direct", json={
            "customer_id": str(hidden_customer.id), "vehicle_id": str(hidden_vehicle.id),
            "appointment_date": "2030-05-08", "appointment_time": "10:00",
        })
        assert newer.status_code == older.status_code == 201

        first_page = await client.get("/api/v1/appointments?page_size=1")
        assert first_page.json()["items"][0]["id"] == newer.json()["id"]
        for query in ("Hidden Page Customer", "search777", "Test car"):
            found = await client.get("/api/v1/appointments", params={"q": query, "page_size": 1})
            assert found.status_code == 200, found.text
            if query == "Test car":
                assert found.json()["total"] == 2
            else:
                assert found.json()["total"] == 1
                assert found.json()["items"][0]["id"] == older.json()["id"]


async def test_invoice_cannot_use_another_tenants_appointment(session):
    owner, customer, vehicle = await _tenant(session)
    other, other_customer, other_vehicle = await _tenant(session)
    async with _api_for(session, owner.id) as client:
        created = await client.post("/api/v1/appointments/direct", json={
            "customer_id": str(customer.id), "vehicle_id": str(vehicle.id),
            "appointment_date": date(2030, 5, 5).isoformat(),
            "appointment_time": "14:00", "mechanic_name": "Demo mechanic",
        })
        appointment_id = created.json()["id"]
        await client.patch(f"/api/v1/appointments/{appointment_id}/confirm")
        await client.patch(f"/api/v1/appointments/{appointment_id}/start")
        await client.patch(f"/api/v1/appointments/{appointment_id}/complete", json={})

    async with _api_for(session, other.id) as client:
        response = await client.post("/api/v1/invoices", json={
            "kind": "invoice", "customer_id": str(other_customer.id),
            "vehicle_id": str(other_vehicle.id), "appointment_id": appointment_id,
            "line_items": [{"kind": "labor", "description": "Test", "unit_price": 1000}],
        })
        assert response.status_code == 404, response.text


async def test_fresh_demo_invoices_use_uzs(session):
    center, _, vehicle = await _tenant(session)
    from app.models.appointment import Appointment, AppointmentStatus
    completed = Appointment(
        service_center_id=center.id, customer_id=vehicle.customer_id,
        vehicle_id=vehicle.id, appointment_date=datetime.now(timezone.utc),
        appointment_time="10:00", status=AppointmentStatus.COMPLETED,
    )
    session.add(completed)
    await session.flush()
    created = await generate_invoices(session, center, [vehicle])
    assert created > 0
    invoices = (await session.execute(
        select(Invoice).where(Invoice.service_center_id == center.id)
    )).scalars().all()
    assert len(invoices) == created
    assert all(invoice.currency == "UZS" for invoice in invoices)
    assert all(invoice.total > 1000 for invoice in invoices)
    assert sum(invoice.appointment_id == completed.id for invoice in invoices if invoice.kind == InvoiceKind.INVOICE) == 1
