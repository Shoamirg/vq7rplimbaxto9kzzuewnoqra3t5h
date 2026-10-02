"""Ledger invariant: every financial mutation writes exactly one ledger entry
(and estimate-only actions write none). This protects future Reports/exports,
which project over the ledger stream.

| Action              | Ledger delta                 |
|---------------------|------------------------------|
| Estimate created    | 0                            |
| Estimate approved   | 0                            |
| Invoice created     | +1 (debit, invoice_issued)   |
| Estimate → invoice  | +1 (debit, invoice_issued)   |
| Payment received    | +1 (credit, payment_received)|
| Refund issued       | +1 (debit, refund_issued)    |
"""
from __future__ import annotations

import uuid
from collections import namedtuple

from sqlalchemy import func, select

from app.models import Customer, ServiceCenter, Vehicle, VehicleModel, Brand
from app.models.ledger import LedgerDirection, LedgerEntry
from app.repositories.unit_of_work import UnitOfWork
from app.services.invoice_service import InvoiceService

Tenant = namedtuple("Tenant", "center customer vehicle")


async def _tenant(session) -> Tenant:
    center = ServiceCenter(name="L", email=f"l-{uuid.uuid4().hex}@test.local")
    session.add(center)
    await session.flush()
    brand = Brand(name=f"B-{uuid.uuid4().hex[:8]}")
    session.add(brand)
    await session.flush()
    model = VehicleModel(brand_id=brand.id, name="M", year_start=2015)
    session.add(model)
    await session.flush()
    customer = Customer(service_center_id=center.id, full_name="Cust")
    session.add(customer)
    await session.flush()
    vehicle = Vehicle(service_center_id=center.id, customer_id=customer.id,
                      vehicle_model_id=model.id, year=2018, current_km=40000)
    session.add(vehicle)
    await session.flush()
    return Tenant(center, customer, vehicle)


def _svc(session, center) -> InvoiceService:
    uow = UnitOfWork(service_center_id=center.id)
    uow.session = session
    return InvoiceService(uow)


async def _count(session, center) -> int:
    return int(await session.scalar(
        select(func.count()).select_from(LedgerEntry).where(
            LedgerEntry.service_center_id == center.id)) or 0)


async def _by_type(session, center) -> dict:
    rows = (await session.execute(
        select(LedgerEntry).where(LedgerEntry.service_center_id == center.id))).scalars().all()
    return {r.entry_type: r for r in rows}


_LINES = [{"kind": "labor", "description": "Diag", "quantity": 1, "unit_price": 80},
          {"kind": "part", "description": "Filter", "quantity": 1, "unit_price": 20}]


async def test_ledger_invariant(session):
    t = await _tenant(session)
    svc = _svc(session, t.center)

    # Estimate created → 0
    before = await _count(session, t.center)
    est = await svc.create(kind="estimate", customer_id=t.customer.id,
                           vehicle_id=t.vehicle.id, line_items=_LINES)
    assert await _count(session, t.center) - before == 0, "estimate created must write no ledger entry"

    # Estimate approved → 0
    before = await _count(session, t.center)
    await svc.set_status(uuid.UUID(est["id"]), "approved")
    assert await _count(session, t.center) - before == 0, "estimate approved must write no ledger entry"

    # Estimate → invoice → +1 debit
    before = await _count(session, t.center)
    inv = await svc.convert_to_invoice(uuid.UUID(est["id"]))
    assert await _count(session, t.center) - before == 1, "convert must write exactly one ledger entry"

    # Invoice created directly → +1 debit
    before = await _count(session, t.center)
    inv2 = await svc.create(kind="invoice", customer_id=t.customer.id,
                            vehicle_id=t.vehicle.id, line_items=_LINES)
    assert await _count(session, t.center) - before == 1, "invoice created must write exactly one ledger entry"

    # Payment received → +1 credit
    before = await _count(session, t.center)
    await svc.record_payment(uuid.UUID(inv2["id"]), amount=10, method="card")
    assert await _count(session, t.center) - before == 1, "payment must write exactly one ledger entry"

    # Refund → +1 debit: it reverses received money and restores debt.
    before = await _count(session, t.center)
    await svc.record_payment(uuid.UUID(inv2["id"]), amount=5, method="card", kind="refund")
    assert await _count(session, t.center) - before == 1, "refund must write exactly one ledger entry"

    # Directions + types are correct.
    by_type = await _by_type(session, t.center)
    assert by_type["invoice_issued"].direction == LedgerDirection.DEBIT
    assert by_type["payment_received"].direction == LedgerDirection.CREDIT
    assert by_type["refund_issued"].direction == LedgerDirection.DEBIT
    # Estimate approval left no ledger type of its own.
    assert "estimate_approved" not in by_type
