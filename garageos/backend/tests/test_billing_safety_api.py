"""Real PostgreSQL/HTTP proof for billing retries, row locks and status safety."""
from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager

import httpx
import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.api.deps import get_tenant_uow
from app.exceptions import GarageException
from app.main import app
from app.models import Customer, ServiceCenter
from app.models.invoice import Invoice, Payment
from app.models.ledger import LedgerEntry
from app.repositories.unit_of_work import UnitOfWork
from app.services.invoice_service import InvoiceService


def _svc(session, center_id):
    uow = UnitOfWork(service_center_id=center_id)
    uow.session = session
    return InvoiceService(uow)


async def _invoice(session):
    center = ServiceCenter(name="Billing safety", email=f"billing-{uuid.uuid4().hex}@test.local")
    session.add(center)
    await session.flush()
    customer = Customer(service_center_id=center.id, full_name="Billing test customer")
    session.add(customer)
    await session.flush()
    svc = _svc(session, center.id)
    doc = await svc.create(kind="invoice", customer_id=customer.id, tax_rate=0,
                           line_items=[{"kind": "labor", "description": "Service", "unit_price": 100}])
    return center, svc, uuid.UUID(doc["id"])


@asynccontextmanager
async def _api(session, center_id):
    async def uow_override():
        svc = _svc(session, center_id)
        yield svc.uow

    app.dependency_overrides[get_tenant_uow] = uow_override
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_tenant_uow, None)


async def test_payment_retry_records_one_payment_and_one_credit(session):
    center, _, invoice_id = await _invoice(session)
    key = str(uuid.uuid4())
    async with _api(session, center.id) as client:
        path = f"/api/v1/invoices/{invoice_id}/payments"
        headers = {"Idempotency-Key": key}
        first = await client.post(path, headers=headers, json={"amount": 25, "method": "cash"})
        retry = await client.post(path, headers=headers, json={"amount": 25, "method": "cash"})
        assert first.status_code == retry.status_code == 201
        assert retry.json()["amount_paid"] == 25
        assert retry.json()["balance"] == 75
        assert len(retry.json()["payments"]) == 1
        assert await session.scalar(select(func.count()).select_from(LedgerEntry).where(
            LedgerEntry.invoice_id == invoice_id, LedgerEntry.entry_type == "payment_received")) == 1

        mismatch = await client.post(path, headers=headers, json={"amount": 30, "method": "cash"})
        assert mismatch.status_code == 409
        assert mismatch.json()["error"]["code"] == "PAYMENT_REQUEST_MISMATCH"

        # Sending preserves partial and paid status in the real read model.
        sent = await client.post(f"/api/v1/invoices/{invoice_id}/send")
        assert sent.json()["status"] == "partial"
        paid = await client.post(path, headers={"Idempotency-Key": str(uuid.uuid4())}, json={"amount": 75})
        assert paid.json()["status"] == "paid"
        sent_paid = await client.post(f"/api/v1/invoices/{invoice_id}/send")
        assert sent_paid.json()["status"] == "paid"


@pytest.mark.parametrize("amount", [0, -1, "NaN", "Infinity", 100.01])
async def test_invalid_http_payment_does_not_change_invoice(session, amount):
    center, svc, invoice_id = await _invoice(session)
    async with _api(session, center.id) as client:
        result = await client.post(f"/api/v1/invoices/{invoice_id}/payments", json={"amount": amount})
        assert result.status_code == (409 if amount == 100.01 else 422)
    doc = await svc.get_document(invoice_id)
    assert doc["amount_paid"] == 0 and doc["balance"] == 100
    assert doc["payments"] == []


async def test_invoice_customer_and_vehicle_cannot_cross_tenants_or_owners(session):
    from tests.test_calendar import _tenant

    ours = await _tenant(session)
    foreign = await _tenant(session)
    another_customer = Customer(service_center_id=ours.center.id, full_name="Other owner")
    session.add(another_customer)
    await session.flush()
    async with _api(session, ours.center.id) as client:
        base = {"line_items": [{"description": "Service", "unit_price": 100}], "tax_rate": 0}
        foreign_customer = await client.post("/api/v1/invoices", json={**base,
            "customer_id": str(foreign.customer.id)})
        assert foreign_customer.status_code == 404
        foreign_vehicle = await client.post("/api/v1/invoices", json={**base,
            "customer_id": str(ours.customer.id), "vehicle_id": str(foreign.vehicle.id)})
        assert foreign_vehicle.status_code == 404
        wrong_owner = await client.post("/api/v1/invoices", json={**base,
            "customer_id": str(another_customer.id), "vehicle_id": str(ours.vehicle.id)})
        assert wrong_owner.status_code == 422

        created = await client.post("/api/v1/invoices", json={**base,
            "customer_id": str(ours.customer.id), "vehicle_id": str(ours.vehicle.id)})
        assert created.status_code == 201
        invoice_id = created.json()["id"]
        changed = await client.put(f"/api/v1/invoices/{invoice_id}",
                                   json={"vehicle_id": str(foreign.vehicle.id)})
        assert changed.status_code == 404
        # A different customer's car from the same garage is rejected as well.
        foreign.vehicle.service_center_id = ours.center.id
        foreign.customer.service_center_id = ours.center.id
        await session.flush()
        wrong_owner_edit = await client.put(f"/api/v1/invoices/{invoice_id}",
                                            json={"vehicle_id": str(foreign.vehicle.id)})
        assert wrong_owner_edit.status_code == 422


async def test_refund_restores_debt_and_ledger_identity(session):
    center, svc, invoice_id = await _invoice(session)
    await svc.record_payment(invoice_id, amount=100)
    doc = await svc.record_payment(invoice_id, amount=25, kind="refund")
    assert doc["status"] == "partial" and doc["balance"] == 25
    entries = (await session.execute(select(LedgerEntry).where(
        LedgerEntry.invoice_id == invoice_id))).scalars().all()
    net_debt = sum(float(e.amount) * (1 if e.direction == "debit" else -1) for e in entries)
    assert net_debt == doc["balance"]
    refund = next(e for e in entries if e.entry_type == "refund_issued")
    assert refund.direction == "debit" and refund.currency == "UZS"


async def test_fully_refunded_invoice_retains_immutable_payment_history(session):
    from app.exceptions import ConflictError

    _, svc, invoice_id = await _invoice(session)
    await svc.record_payment(invoice_id, amount=100)
    await svc.record_payment(invoice_id, amount=100, kind="refund")
    with pytest.raises(ConflictError):
        await svc.update(invoice_id, line_items=[{"description": "Replacement", "unit_price": 50}])
    with pytest.raises(ConflictError):
        await svc.delete(invoice_id)
    doc = await svc.get_document(invoice_id)
    assert len(doc["payments"]) == 2 and doc["total"] == 100


async def test_void_invoice_is_not_an_overdue_debt(session):
    from datetime import date, timedelta

    _, svc, invoice_id = await _invoice(session)
    invoice = await session.get(Invoice, invoice_id)
    invoice.due_date = date.today() - timedelta(days=1)
    await session.flush()
    assert (await svc.kpis())["overdue"] == 100
    await svc.set_status(invoice_id, "void")
    assert (await svc.get_document(invoice_id))["is_overdue"] is False
    assert (await svc.kpis())["overdue"] == 0
    assert (await svc.list_documents(view="overdue"))["items"] == []


async def test_estimate_conversion_requires_approval_preserves_currency_and_reuses_invoice(session):
    from app.exceptions import ConflictError

    center, svc, invoice_id = await _invoice(session)
    original = await svc.get_document(invoice_id)
    estimate = await svc.create(kind="estimate", customer_id=uuid.UUID(original["customer_id"]),
        currency="USD", tax_rate=0, line_items=[{"description": "Legacy estimate", "unit_price": 50}])
    estimate_id = uuid.UUID(estimate["id"])
    with pytest.raises(ConflictError):
        await svc.convert_to_invoice(estimate_id)
    await svc.set_status(estimate_id, "approved")
    first = await svc.convert_to_invoice(estimate_id)
    second = await svc.convert_to_invoice(estimate_id)
    assert first["id"] == second["id"]
    assert first["currency"] == "USD" and first["total"] == 50
    assert await session.scalar(select(func.count()).select_from(Invoice).where(
        Invoice.service_center_id == center.id, Invoice.source_estimate_id == estimate_id)) == 1


async def test_parallel_invoice_creation_allocates_distinct_codes(session):
    center, svc, invoice_id = await _invoice(session)
    customer_id = uuid.UUID((await svc.get_document(invoice_id))["customer_id"])
    center_id = center.id
    await session.commit()
    factory = async_sessionmaker(session.bind, expire_on_commit=False)

    async def issue():
        async with factory() as concurrent:
            doc = await _svc(concurrent, center_id).create(
                kind="invoice", customer_id=customer_id, tax_rate=0,
                line_items=[{"description": "Concurrent service", "unit_price": 10}])
            await concurrent.commit()
            return doc["code"]

    try:
        codes = await asyncio.gather(issue(), issue())
        assert codes[0] != codes[1]
    finally:
        await session.rollback()
        for model in (Payment, LedgerEntry, Invoice, Customer):
            await session.execute(delete(model).where(model.service_center_id == center_id))
        await session.execute(delete(ServiceCenter).where(ServiceCenter.id == center_id))
        await session.commit()


@pytest.mark.parametrize("same_key", [True, False])
async def test_concurrent_payments_serialize_on_invoice(session, same_key):
    center, _, invoice_id = await _invoice(session)
    center_id = center.id
    # Concurrent transactions need their own sessions and committed fixture rows.
    await session.commit()
    factory = async_sessionmaker(session.bind, expire_on_commit=False)
    shared_key = str(uuid.uuid4())
    amount = 10 if same_key else 60

    async def pay():
        async with factory() as concurrent:
            svc = _svc(concurrent, center_id)
            try:
                result = await svc.record_payment(invoice_id, amount=amount,
                    idempotency_key=shared_key if same_key else str(uuid.uuid4()))
                await concurrent.commit()
                return result
            except GarageException as exc:
                await concurrent.rollback()
                return exc.code

    try:
        results = await asyncio.gather(pay(), pay())
        if same_key:
            assert all(isinstance(r, dict) for r in results)
        else:
            assert results.count("PAYMENT_EXCEEDS_BALANCE") == 1
        doc = await _svc(session, center_id).get_document(invoice_id)
        assert doc["amount_paid"] == amount
        assert doc["balance"] == 100 - amount
        assert len(doc["payments"]) == 1
        assert await session.scalar(select(func.count()).select_from(LedgerEntry).where(
            LedgerEntry.invoice_id == invoice_id, LedgerEntry.entry_type == "payment_received")) == 1
    finally:
        # This test alone commits fixtures; remove them explicitly after proof.
        await session.rollback()
        for model in (Payment, LedgerEntry, Invoice, Customer):
            await session.execute(delete(model).where(model.service_center_id == center_id))
        await session.execute(delete(ServiceCenter).where(ServiceCenter.id == center_id))
        await session.commit()
