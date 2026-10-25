"""Billing regression checks that run without a database or demo services.

Exercise the real service mutations; stub only persistence and the read model.
The database suite separately proves ledger writes and tenant isolation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from pydantic import ValidationError as SchemaValidationError

from app.api.v1.endpoints.invoices import PaymentIn
from app.core.events import EstimateSent
from app.core.events import PaymentReceived
from app.core.notification_handlers import _spec_for
from app.exceptions import ConflictError, ValidationError
from app.models.invoice import Invoice, InvoiceKind, InvoiceStatus
from app.services.invoice_service import InvoiceService


def _service(*, kind="invoice", status="issued", paid=0, total=100):
    invoice = Invoice(
        id=uuid.uuid4(), service_center_id=uuid.uuid4(), customer_id=uuid.uuid4(),
        code="INV-test", kind=kind, status=status, total=Decimal(str(total)),
        amount_paid=Decimal(str(paid)), balance=Decimal(str(total - paid)),
        paid_at=datetime.now(timezone.utc) if status == "paid" else None,
    )
    session = SimpleNamespace(add=Mock(), flush=AsyncMock())
    uow = SimpleNamespace(session=session, service_center_id=invoice.service_center_id, actor_user_id=None,
                          add_event=Mock())
    svc = InvoiceService(uow)
    svc._get = AsyncMock(return_value=invoice)
    svc._ledger = Mock()

    async def document(_):
        return {"status": invoice.status, "balance": float(invoice.balance),
                "amount_paid": float(invoice.amount_paid)}

    svc.get_document = AsyncMock(side_effect=document)
    return svc, invoice, session, uow


@pytest.mark.parametrize("status,paid", [
    ("issued", 0), ("partial", 25), ("paid", 100), ("overdue", 0),
])
async def test_send_invoice_preserves_financial_status(status, paid):
    svc, inv, _, uow = _service(status=status, paid=paid)
    result = await svc.send(inv.id)
    assert result["status"] == status
    assert inv.is_outstanding() == (status != "paid")
    # Sending an invoice must not emit an estimate lifecycle event.
    uow.add_event.assert_not_called()


async def test_send_draft_estimate_retains_estimate_lifecycle():
    svc, inv, _, uow = _service(kind=InvoiceKind.ESTIMATE, status=InvoiceStatus.DRAFT)
    assert (await svc.send(inv.id))["status"] == InvoiceStatus.SENT
    assert isinstance(uow.add_event.call_args.args[0], EstimateSent)


@pytest.mark.parametrize("amount", [0, -1, 0.001, float("nan"), float("inf"), -float("inf")])
async def test_invalid_payment_never_mutates_balance(amount):
    svc, inv, session, uow = _service()
    with pytest.raises(ValidationError):
        await svc.record_payment(inv.id, amount=amount)
    assert inv.amount_paid == 0
    assert inv.balance == 100
    session.add.assert_not_called()
    svc._ledger.assert_not_called()
    uow.add_event.assert_not_called()


async def test_overpayment_is_rejected_before_financial_mutation():
    svc, inv, session, _ = _service(status="partial", paid=25)
    with pytest.raises(ConflictError):
        await svc.record_payment(inv.id, amount=75.01)
    assert inv.amount_paid == 25
    session.add.assert_not_called()


async def test_refund_cannot_exceed_received_amount():
    svc, inv, session, _ = _service(status="partial", paid=25)
    with pytest.raises(ConflictError):
        await svc.record_payment(inv.id, amount=25.01, kind="refund")
    assert inv.amount_paid == 25
    session.add.assert_not_called()


async def test_payments_require_an_invoice():
    svc, inv, session, _ = _service(kind="estimate", status="approved")
    with pytest.raises(ConflictError):
        await svc.record_payment(inv.id, amount=10)
    session.add.assert_not_called()


async def test_partial_then_full_payment_and_refund_update_status():
    svc, inv, _, _ = _service()
    assert (await svc.record_payment(inv.id, amount=25))["status"] == "partial"
    assert (await svc.record_payment(inv.id, amount=75))["status"] == "paid"
    assert inv.paid_at is not None
    assert (await svc.record_payment(inv.id, amount=100, kind="refund"))["status"] == "issued"
    assert inv.paid_at is None
    assert inv.amount_paid == 0 and inv.balance == 100


@pytest.mark.parametrize("payload", [
    {"amount": 0}, {"amount": -1}, {"amount": float("nan")},
    {"amount": float("inf")}, {"amount": 1, "method": "other"},
    {"amount": 1, "kind": "other"}, {"amount": 1, "source": "other"},
])
def test_payment_request_rejects_invalid_financial_input(payload):
    with pytest.raises(SchemaValidationError):
        PaymentIn(**payload)


async def test_payment_requests_invoice_row_lock():
    svc, inv, _, _ = _service()
    await svc.record_payment(inv.id, amount=10)
    svc._get.assert_called_once_with(inv.id, for_update=True)


def test_financial_notifications_keep_currency_and_refund_direction():
    event = PaymentReceived(service_center_id=uuid.uuid4(), invoice_id=uuid.uuid4(),
        customer_id=uuid.uuid4(), code="INV-test", amount=25000, method="cash",
        currency="UZS", kind="refund")
    notification = _spec_for(event)
    assert notification["body"] == "UZS 25,000.00 · cash"
    assert notification["title"].startswith("Refund issued")
