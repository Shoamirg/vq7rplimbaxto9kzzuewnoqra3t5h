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
                   amount: float, currency: str = "USD", description: str | None = None, when: datetime | None = None) -> None:
        self.session.add(LedgerEntry(
            service_center_id=self.sc, customer_id=customer_id, invoice_id=invoice_id,
            entry_type=entry_type, direction=direction, amount=Decimal(str(amount)),
            currency=currency,
            description=description, occurred_at=when or datetime.now(timezone.utc)))

    # ── customer financial summary ────────────────────────────
    async def customer_summary(self, customer_id: uuid.UUID) -> dict:
        invoices = list((await self.session.execute(
            select(Invoice).where(
                Invoice.service_center_id == self.sc, Invoice.customer_id == customer_id,
                Invoice.is_active.is_(True)))).scalars().all())
        payment_rows = (await self.session.execute(
            select(Payment, Invoice.currency).join(Invoice, Payment.invoice_id == Invoice.id).where(
                Invoice.service_center_id == self.sc, Invoice.customer_id == customer_id,
                Payment.service_center_id == self.sc))).all()
        payments = [payment for payment, _ in payment_rows]

        inv = [i for i in invoices if i.kind == InvoiceKind.INVOICE]
        est = [i for i in invoices if i.kind == InvoiceKind.ESTIMATE]
        today = date.today()

        overdue = [i for i in inv if i.status in _OUTSTANDING and _f(i.balance) > 0 and i.due_date and i.due_date < today]

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

        # Debt pressure uses unpaid invoice fractions, independent of currency units.
        debt_pressure = sum(_f(i.balance) / max(_f(i.total), 0.01) for i in inv if i.status in _OUTSTANDING) * 150
        health = commercial_health(avg_days_to_pay=avg_days, outstanding=debt_pressure,
                                   overdue_count=len(overdue), invoice_count=len(inv))
        currency_by_invoice = {i.id: i.currency for i in invoices}
        currency_by_invoice.update({payment.invoice_id: currency for payment, currency in payment_rows})
        by_currency: dict[str, dict] = {}
        for currency in sorted(set(currency_by_invoice.values())):
            ci = [i for i in inv if i.currency == currency]
            cp = [p for p in payments if currency_by_invoice.get(p.invoice_id) == currency]
            co = [i for i in ci if i.status in _OUTSTANDING and _f(i.balance) > 0 and i.due_date and i.due_date < today]
            by_currency[currency] = {
                "lifetime_spend": round(sum(_f(p.amount) for p in cp if p.kind != PaymentKind.REFUND), 2),
                "refunds": round(sum(_f(p.amount) for p in cp if p.kind == PaymentKind.REFUND), 2),
                "outstanding": round(sum(_f(i.balance) for i in ci if i.status in _OUTSTANDING), 2),
                "overdue_amount": round(sum(_f(i.balance) for i in co), 2),
            }
        # Scalars describe a single currency; mixed-currency consumers use by_currency.
        summary_currency = next(iter(by_currency)) if len(by_currency) == 1 else "USD"
        summary_amounts = by_currency.get(summary_currency, {})
        return {
            "currency": summary_currency,
            "by_currency": by_currency,
            "lifetime_spend": summary_amounts.get("lifetime_spend", 0),
            "refunds": summary_amounts.get("refunds", 0),
            "outstanding": summary_amounts.get("outstanding", 0),
            "overdue_amount": summary_amounts.get("overdue_amount", 0),
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
                              "currency": currency_by_invoice.get(last_payment.invoice_id, "USD"),
                              "date": last_payment.received_at.isoformat()} if last_payment else None),
            "commercial_health": health,
            "invoices": [self._doc_row(i) for i in sorted(inv, key=lambda x: x.created_at, reverse=True)[:20]],
            "estimates": [self._doc_row(i) for i in sorted(est, key=lambda x: x.created_at, reverse=True)[:20]],
            "payments": [self._pay_row(p, currency_by_invoice.get(p.invoice_id, "USD")) for p in sorted(payments, key=lambda x: x.received_at, reverse=True)[:20]],
        }

    def _doc_row(self, i: Invoice) -> dict:
        overdue = i.kind == InvoiceKind.INVOICE and i.status in _OUTSTANDING and _f(i.balance) > 0 and i.due_date and i.due_date < date.today()
        return {"id": str(i.id), "code": i.code, "kind": i.kind, "status": "overdue" if overdue else i.status,
                "currency": i.currency,
                "total": _f(i.total), "balance": _f(i.balance),
                "due_date": i.due_date.isoformat() if i.due_date else None,
                "created_at": i.created_at.isoformat() if i.created_at else None}

    def _pay_row(self, p: Payment, currency: str = "USD") -> dict:
        return {"id": str(p.id), "kind": p.kind, "method": p.method, "source": p.source,
                "amount": _f(p.amount), "reference": p.reference,
                "currency": currency,
                "received_at": p.received_at.isoformat() if p.received_at else None}

    # ── quick figure for the appointment row (bounded) ────────
    async def invoice_for_appointment(self, appointment_id: uuid.UUID) -> dict | None:
        """Return only a document linked to this appointment.

        A vehicle can have several visits; showing its latest invoice on every
        visit incorrectly presents an earlier bill as this visit's bill.
        """
        i = (await self.session.execute(
            select(Invoice).where(
                Invoice.service_center_id == self.sc, Invoice.appointment_id == appointment_id,
                Invoice.is_active.is_(True)).order_by(Invoice.created_at.desc()).limit(1))).scalar_one_or_none()
        if not i:
            return None
        overdue = i.kind == InvoiceKind.INVOICE and i.status in _OUTSTANDING and _f(i.balance) > 0 and i.due_date and i.due_date < date.today()
        return {"id": str(i.id), "code": i.code, "kind": i.kind,
                "currency": i.currency,
                "status": "overdue" if overdue else i.status,
                "total": _f(i.total), "balance": _f(i.balance)}
