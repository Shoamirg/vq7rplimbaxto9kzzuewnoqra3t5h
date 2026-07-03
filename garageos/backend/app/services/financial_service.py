"""Financial summaries — the commercial equivalent of Vehicle Health.

Computes a customer's **Commercial Health** (an operational score, NOT a credit
score) and the financial figures Customer 360, the Appointments row, Billing and
future AI all reuse. Also owns the ledger-append helper so every money movement
lands in the reserved ``LedgerEntry`` stream.
"""
from __future__ import annotations

import uuid
from collections import Counter
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select

from app.models.invoice import Invoice, InvoiceKind, InvoiceStatus, Payment, PaymentKind
from app.models.ledger import LedgerEntry
from app.repositories.unit_of_work import UnitOfWork

_OUTSTANDING = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]


def _f(d) -> float:
    return float(d or 0)


def commercial_health(*, avg_days_to_pay: float | None, outstanding: float,
                      overdue_count: int, invoice_count: int) -> dict:
    """An operational payer score in [0,100] with a band + risk. Heuristic, not credit."""
    score = 100.0
    if avg_days_to_pay is not None:
        score -= max(0.0, avg_days_to_pay - 7) * 1.4      # slow payment hurts gradually
    score -= overdue_count * 12                            # overdue invoices hurt sharply
    if outstanding > 0:
        score -= min(20.0, outstanding / 150.0)
    score = max(0.0, min(100.0, round(score, 1)))
    stars = max(1, min(5, round(score / 20)))
    if score >= 85:
        band, label, risk = "excellent", "Excellent payer", "low"
    elif score >= 70:
        band, label, risk = "good", "Reliable payer", "low"
    elif score >= 50:
        band, label, risk = "fair", "Slow payer", "medium"
    else:
        band, label, risk = "poor", "At risk", "high"
    if invoice_count == 0:
        band, label, risk, stars = "new", "No history", "unknown", 0
    return {"score": score, "stars": stars, "band": band, "label": label, "risk": risk}


class FinancialService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.session = uow.session
        self.sc = uow.service_center_id

    # ── ledger append (reserved stream) ───────────────────────
    def add_ledger(self, *, customer_id, invoice_id, entry_type: str, direction: str,
                   amount: float, description: str | None = None, when: datetime | None = None) -> None:
        self.session.add(LedgerEntry(
            service_center_id=self.sc, customer_id=customer_id, invoice_id=invoice_id,
            entry_type=entry_type, direction=direction, amount=Decimal(str(amount)),
            description=description, occurred_at=when or datetime.now(timezone.utc)))

    # ── customer financial summary ────────────────────────────
    async def customer_summary(self, customer_id: uuid.UUID) -> dict:
        invoices = list((await self.session.execute(
            select(Invoice).where(
                Invoice.service_center_id == self.sc, Invoice.customer_id == customer_id,
                Invoice.is_active.is_(True)))).scalars().all())
        payments = list((await self.session.execute(
            select(Payment).join(Invoice, Payment.invoice_id == Invoice.id).where(
                Invoice.service_center_id == self.sc, Invoice.customer_id == customer_id))).scalars().all())

        inv = [i for i in invoices if i.kind == InvoiceKind.INVOICE]
        est = [i for i in invoices if i.kind == InvoiceKind.ESTIMATE]
        today = date.today()

        lifetime_spend = sum(_f(p.amount) for p in payments if p.kind != PaymentKind.REFUND)
        refunds = sum(_f(p.amount) for p in payments if p.kind == PaymentKind.REFUND)
        outstanding = sum(_f(i.balance) for i in inv if i.status in _OUTSTANDING)
        overdue = [i for i in inv if _f(i.balance) > 0 and i.due_date and i.due_date < today]
        overdue_amount = sum(_f(i.balance) for i in overdue)

        # Average days to pay over fully-paid invoices.
        pay_days = [(i.paid_at.date() - (i.issued_at.date() if i.issued_at else i.created_at.date())).days
                    for i in inv if i.status == InvoiceStatus.PAID and i.paid_at]
        avg_days = round(sum(pay_days) / len(pay_days), 1) if pay_days else None

        methods = Counter(p.method for p in payments if p.kind != PaymentKind.REFUND)
        preferred_method = methods.most_common(1)[0][0] if methods else None
        last_payment = max(payments, key=lambda p: p.received_at) if payments else None

        approved = sum(1 for e in est if e.status == InvoiceStatus.APPROVED)
        decided = approved + sum(1 for e in est if e.status == InvoiceStatus.REJECTED)
        approval_rate = round(approved / decided, 2) if decided else None

        health = commercial_health(avg_days_to_pay=avg_days, outstanding=outstanding,
                                   overdue_count=len(overdue), invoice_count=len(inv))
        return {
            "lifetime_spend": round(lifetime_spend, 2),
            "refunds": round(refunds, 2),
            "outstanding": round(outstanding, 2),
            "overdue_amount": round(overdue_amount, 2),
            "overdue_count": len(overdue),
            "avg_days_to_pay": avg_days,
            "invoice_count": len(inv),
            "estimate_count": len(est),
            "open_estimate_count": sum(1 for e in est if e.status in
                                       (InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.DRAFT)),
            "payment_count": len([p for p in payments if p.kind != PaymentKind.REFUND]),
            "preferred_method": preferred_method,
            "approval_rate": approval_rate,
            "last_payment": ({"amount": _f(last_payment.amount), "method": last_payment.method,
                              "date": last_payment.received_at.isoformat()} if last_payment else None),
            "commercial_health": health,
            "invoices": [self._doc_row(i) for i in sorted(inv, key=lambda x: x.created_at, reverse=True)[:20]],
            "estimates": [self._doc_row(i) for i in sorted(est, key=lambda x: x.created_at, reverse=True)[:20]],
            "payments": [self._pay_row(p) for p in sorted(payments, key=lambda x: x.received_at, reverse=True)[:20]],
        }

    def _doc_row(self, i: Invoice) -> dict:
        return {"id": str(i.id), "code": i.code, "kind": i.kind, "status": i.status,
                "total": _f(i.total), "balance": _f(i.balance),
                "due_date": i.due_date.isoformat() if i.due_date else None,
                "created_at": i.created_at.isoformat() if i.created_at else None}

    def _pay_row(self, p: Payment) -> dict:
        return {"id": str(p.id), "kind": p.kind, "method": p.method, "source": p.source,
                "amount": _f(p.amount), "reference": p.reference,
                "received_at": p.received_at.isoformat() if p.received_at else None}

    # ── quick figure for the appointment row (bounded) ────────
    async def invoice_for_appointment(
        self, appointment_id: uuid.UUID, vehicle_id: uuid.UUID | None = None) -> dict | None:
        """The billing signal for an appointment row: the directly-linked
        document if any, else the vehicle's most recent one (an operational
        "does this vehicle owe / have a pending estimate" cue)."""
        i = (await self.session.execute(
            select(Invoice).where(
                Invoice.service_center_id == self.sc, Invoice.appointment_id == appointment_id,
                Invoice.is_active.is_(True)).order_by(Invoice.created_at.desc()).limit(1))).scalar_one_or_none()
        if not i and vehicle_id is not None:
            i = (await self.session.execute(
                select(Invoice).where(
                    Invoice.service_center_id == self.sc, Invoice.vehicle_id == vehicle_id,
                    Invoice.is_active.is_(True)).order_by(Invoice.created_at.desc()).limit(1))).scalar_one_or_none()
        if not i:
            return None
        overdue = i.kind == InvoiceKind.INVOICE and _f(i.balance) > 0 and i.due_date and i.due_date < date.today()
        return {"id": str(i.id), "code": i.code, "kind": i.kind,
                "status": "overdue" if overdue else i.status,
                "total": _f(i.total), "balance": _f(i.balance)}
