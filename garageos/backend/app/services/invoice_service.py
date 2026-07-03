"""Commercial Operations — the billing service.

Owns the estimate/invoice lifecycle and the read models the Billing workspace
needs (queues, counts, KPIs, the full document with its financial timeline).
Money is computed with ``Decimal`` and serialized as float. Every state change
emits a domain event → the notification engine projects the financial timeline
(no separate timeline table), consistent with the rest of GarageOS.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, or_, select

from app.core.events import (
    EstimateApproved,
    EstimateCreated,
    EstimateSent,
    InvoiceIssued,
    InvoicePaid,
    PaymentReceived,
)
from app.exceptions import NotFoundError
from app.models.customer import Customer
from app.models.invoice import (
    Invoice,
    InvoiceKind,
    InvoiceLineItem,
    InvoiceStatus,
    LineKind,
    Payment,
    PaymentKind,
    PaymentMethod,
    PaymentSource,
)
from app.models.notification import Notification
from app.repositories.unit_of_work import UnitOfWork
from app.services.vehicle_health_service import _vehicle_label

_CENTS = Decimal("0.01")
_DEFAULT_TAX = Decimal("12.00")  # % — single document VAT rate for v1


def _money(d: Decimal | float | int | None) -> Decimal:
    return (Decimal(str(d or 0))).quantize(_CENTS, rounding=ROUND_HALF_UP)


def _f(d: Decimal | None) -> float:
    return float(d or 0)


class InvoiceNotFound(NotFoundError):
    def __init__(self):
        super().__init__("Invoice not found")


class InvoiceService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.session = uow.session
        self.sc = uow.service_center_id

    # ── code ──────────────────────────────────────────────────
    async def _next_code(self, kind: str) -> str:
        year = datetime.now(timezone.utc).year
        n = await self.session.scalar(
            select(func.count()).select_from(Invoice).where(
                Invoice.service_center_id == self.sc, Invoice.kind == kind))
        prefix = "EST" if kind == InvoiceKind.ESTIMATE else "INV"
        return f"{prefix}-{year}-{int(n or 0) + 1:06d}"

    async def _get(self, invoice_id: uuid.UUID) -> Invoice:
        row = await self.session.execute(
            select(Invoice).where(
                Invoice.id == invoice_id, Invoice.service_center_id == self.sc,
                Invoice.is_active.is_(True)))
        inv = row.scalar_one_or_none()
        if not inv:
            raise InvoiceNotFound()
        return inv

    # ── money ─────────────────────────────────────────────────
    def _recalc(self, inv: Invoice, items: list[InvoiceLineItem]) -> None:
        subtotal = Decimal("0")
        discount = Decimal("0")
        taxable_base = Decimal("0")
        for it in items:
            lt = _money(it.line_total)
            if it.kind == LineKind.DISCOUNT:
                discount += abs(lt)
            else:
                subtotal += lt
                if it.taxable:
                    taxable_base += lt
        taxable_base = max(Decimal("0"), taxable_base - discount)
        tax = _money(taxable_base * (inv.tax_rate or Decimal("0")) / Decimal("100"))
        inv.subtotal = _money(subtotal)
        inv.discount_total = _money(discount)
        inv.tax_total = tax
        inv.total = _money(subtotal - discount + tax)
        inv.balance = _money(inv.total - _money(inv.amount_paid))

    # ── create ────────────────────────────────────────────────
    async def create(
        self, *, kind: str, customer_id: uuid.UUID, vehicle_id: uuid.UUID | None = None,
        appointment_id: uuid.UUID | None = None, case_id: uuid.UUID | None = None,
        line_items: list[dict] | None = None, tax_rate: float | None = None,
        due_date: date | None = None, notes: str | None = None,
        source_estimate_id: uuid.UUID | None = None,
    ) -> dict:
        code = await self._next_code(kind)
        inv = Invoice(
            service_center_id=self.sc, code=code, kind=kind,
            status=InvoiceStatus.DRAFT if kind == InvoiceKind.ESTIMATE else InvoiceStatus.ISSUED,
            customer_id=customer_id, vehicle_id=vehicle_id, appointment_id=appointment_id,
            case_id=case_id, source_estimate_id=source_estimate_id,
            tax_rate=_money(tax_rate) if tax_rate is not None else _DEFAULT_TAX,
            due_date=due_date, notes=notes,
        )
        if kind == InvoiceKind.INVOICE:
            inv.issued_at = datetime.now(timezone.utc)
            if not inv.due_date:
                inv.due_date = date.today() + timedelta(days=7)
        self.session.add(inv)
        await self.session.flush()

        items = [self._build_item(inv.id, i, n) for n, i in enumerate(line_items or [])]
        for it in items:
            self.session.add(it)
        self._recalc(inv, items)
        await self.session.flush()

        if kind == InvoiceKind.ESTIMATE:
            self.uow.add_event(EstimateCreated(
                service_center_id=self.sc, invoice_id=inv.id, code=code,
                customer_id=customer_id, vehicle_id=vehicle_id, total=_f(inv.total)))
        else:
            self.uow.add_event(InvoiceIssued(
                service_center_id=self.sc, invoice_id=inv.id, code=code,
                customer_id=customer_id, vehicle_id=vehicle_id, total=_f(inv.total)))
            self._ledger(inv, "invoice_issued", "debit", _f(inv.total), f"Invoice issued · {code}")
        await self.session.flush()
        return await self.get_document(inv.id)

    def _ledger(self, inv: Invoice, entry_type: str, direction: str, amount: float, desc: str) -> None:
        # Append to the reserved ledger stream (reports/exports project over it).
        from app.services.financial_service import FinancialService
        FinancialService(self.uow).add_ledger(
            customer_id=inv.customer_id, invoice_id=inv.id, entry_type=entry_type,
            direction=direction, amount=amount, description=desc)

    def _build_item(self, invoice_id: uuid.UUID, data: dict, order: int) -> InvoiceLineItem:
        qty = _money(data.get("quantity", 1))
        price = _money(data.get("unit_price", 0))
        return InvoiceLineItem(
            service_center_id=self.sc, invoice_id=invoice_id,
            kind=data.get("kind", LineKind.PART), description=data["description"],
            quantity=qty, unit_price=price,
            line_total=_money(data.get("line_total", qty * price)),
            taxable=data.get("taxable", data.get("kind") != LineKind.DISCOUNT),
            sort_order=data.get("sort_order", order),
        )

    # ── estimate lifecycle ────────────────────────────────────
    async def send(self, invoice_id: uuid.UUID) -> dict:
        inv = await self._get(invoice_id)
        inv.status = InvoiceStatus.SENT
        await self.session.flush()
        self.uow.add_event(EstimateSent(
            service_center_id=self.sc, invoice_id=inv.id, code=inv.code,
            customer_id=inv.customer_id, vehicle_id=inv.vehicle_id))
        return await self.get_document(inv.id)

    async def set_status(self, invoice_id: uuid.UUID, status: str) -> dict:
        inv = await self._get(invoice_id)
        inv.status = status
        if status == InvoiceStatus.APPROVED:
            inv.approved_at = datetime.now(timezone.utc)
            self.uow.add_event(EstimateApproved(
                service_center_id=self.sc, invoice_id=inv.id, code=inv.code,
                customer_id=inv.customer_id, vehicle_id=inv.vehicle_id))
        await self.session.flush()
        return await self.get_document(inv.id)

    async def convert_to_invoice(self, estimate_id: uuid.UUID) -> dict:
        """Approved estimate → a NEW invoice referencing it (estimate stays immutable)."""
        est = await self._get(estimate_id)
        if not est.is_estimate():
            raise InvoiceNotFound()
        items = [{"kind": it.kind, "description": it.description, "quantity": _f(it.quantity),
                  "unit_price": _f(it.unit_price), "line_total": _f(it.line_total),
                  "taxable": it.taxable} for it in est.line_items]
        return await self.create(
            kind=InvoiceKind.INVOICE, customer_id=est.customer_id, vehicle_id=est.vehicle_id,
            appointment_id=est.appointment_id, case_id=est.case_id, line_items=items,
            tax_rate=_f(est.tax_rate), notes=est.notes, source_estimate_id=est.id)

    # ── payments ──────────────────────────────────────────────
    async def record_payment(
        self, invoice_id: uuid.UUID, *, amount: float, method: str = PaymentMethod.CARD,
        kind: str = PaymentKind.PAYMENT, source: str = PaymentSource.MANUAL,
        reference: str | None = None, note: str | None = None,
    ) -> dict:
        inv = await self._get(invoice_id)
        amt = _money(amount)
        pay = Payment(
            service_center_id=self.sc, invoice_id=inv.id, kind=kind, method=method,
            source=source, amount=amt, reference=reference, note=note,
            received_at=datetime.now(timezone.utc))
        self.session.add(pay)
        # Refunds subtract; payments/deposits add.
        delta = -amt if kind == PaymentKind.REFUND else amt
        inv.amount_paid = _money(_money(inv.amount_paid) + delta)
        inv.balance = _money(_money(inv.total) - _money(inv.amount_paid))
        if inv.balance <= Decimal("0") and inv.total > Decimal("0"):
            inv.status = InvoiceStatus.PAID
            inv.paid_at = datetime.now(timezone.utc)
        elif inv.amount_paid > Decimal("0"):
            inv.status = InvoiceStatus.PARTIAL
        await self.session.flush()

        self.uow.add_event(PaymentReceived(
            service_center_id=self.sc, invoice_id=inv.id, code=inv.code,
            customer_id=inv.customer_id, vehicle_id=inv.vehicle_id,
            amount=_f(amt), method=method))
        self._ledger(
            inv, "refund_issued" if kind == PaymentKind.REFUND else "payment_received",
            "credit", _f(amt), f"{kind.title()} · {method} · {inv.code}")
        if inv.status == InvoiceStatus.PAID:
            self.uow.add_event(InvoicePaid(
                service_center_id=self.sc, invoice_id=inv.id, code=inv.code,
                customer_id=inv.customer_id, vehicle_id=inv.vehicle_id))
        return await self.get_document(inv.id)

    # ── queue / list ──────────────────────────────────────────
    def _view_where(self, stmt, view: str):
        today = date.today()
        if view == "invoices":
            return stmt.where(Invoice.kind == InvoiceKind.INVOICE)
        if view == "estimates":
            return stmt.where(Invoice.kind == InvoiceKind.ESTIMATE)
        if view == "overdue":
            return stmt.where(
                Invoice.kind == InvoiceKind.INVOICE, Invoice.balance > 0,
                or_(Invoice.status == InvoiceStatus.OVERDUE, Invoice.due_date < today))
        if view == "awaiting":
            return stmt.where(
                Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL]))
        if view == "drafts":
            return stmt.where(Invoice.status == InvoiceStatus.DRAFT)
        if view == "payments":
            return stmt.where(Invoice.amount_paid > 0)
        if view == "recurring":
            return stmt.where(Invoice.id == None)  # noqa: E711 — placeholder (none yet)
        return stmt

    async def list_documents(self, *, view: str = "invoices") -> dict:
        base = select(Invoice).where(
            Invoice.service_center_id == self.sc, Invoice.is_active.is_(True))
        stmt = self._view_where(base, view).order_by(Invoice.created_at.desc()).limit(80)
        rows = list((await self.session.execute(stmt)).scalars().all())
        items = [await self.serialize_row(inv) for inv in rows]
        return {"items": items, "counts": await self.counts(), "kpis": await self.kpis(), "view": view}

    async def counts(self) -> dict:
        base = select(func.count()).select_from(Invoice).where(
            Invoice.service_center_id == self.sc, Invoice.is_active.is_(True))
        out = {}
        for v in ("invoices", "estimates", "overdue", "awaiting", "drafts", "payments"):
            out[v] = int(await self.session.scalar(self._view_where(base, v)) or 0)
        out["recurring"] = 0
        return out

    async def kpis(self) -> dict:
        sc = self.sc
        outstanding = await self.session.scalar(
            select(func.coalesce(func.sum(Invoice.balance), 0)).where(
                Invoice.service_center_id == sc, Invoice.is_active.is_(True),
                Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE])))
        overdue = await self.session.scalar(
            select(func.coalesce(func.sum(Invoice.balance), 0)).where(
                Invoice.service_center_id == sc, Invoice.is_active.is_(True),
                Invoice.kind == InvoiceKind.INVOICE, Invoice.balance > 0,
                or_(Invoice.status == InvoiceStatus.OVERDUE, Invoice.due_date < date.today())))
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        paid_month = await self.session.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.service_center_id == sc, Payment.received_at >= month_start,
                Payment.kind != PaymentKind.REFUND))
        return {
            "outstanding": _f(outstanding), "overdue": _f(overdue),
            "paid_this_month": _f(paid_month),
        }

    # ── detail ────────────────────────────────────────────────
    async def get_document(self, invoice_id: uuid.UUID) -> dict:
        inv = await self._get(invoice_id)
        data = await self.serialize_row(inv, full=True)
        # Query children explicitly — the identity-mapped `inv` may carry a stale
        # selectin collection after an in-session mutation (e.g. record_payment).
        items = list((await self.session.execute(
            select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == inv.id)
            .order_by(InvoiceLineItem.sort_order))).scalars().all())
        pays = list((await self.session.execute(
            select(Payment).where(Payment.invoice_id == inv.id)
            .order_by(Payment.received_at))).scalars().all())
        data["line_items"] = [
            {"id": str(it.id), "kind": it.kind, "description": it.description,
             "quantity": _f(it.quantity), "unit_price": _f(it.unit_price),
             "line_total": _f(it.line_total), "taxable": it.taxable}
            for it in items]
        data["payments"] = [
            {"id": str(p.id), "kind": p.kind, "method": p.method, "source": p.source,
             "amount": _f(p.amount), "reference": p.reference, "note": p.note,
             "received_at": p.received_at.isoformat() if p.received_at else None}
            for p in pays]
        data["timeline"] = await self._timeline(inv.id)
        return data

    async def _timeline(self, invoice_id: uuid.UUID) -> list:
        rows = (await self.session.execute(
            select(Notification).where(
                Notification.service_center_id == self.sc,
                Notification.entity_type == "invoice", Notification.entity_id == invoice_id,
            ).order_by(Notification.created_at.asc()).limit(40))).scalars().all()
        return [{"title": n.title, "detail": n.body, "date": n.created_at.isoformat(),
                 "severity": n.severity} for n in rows]

    async def serialize_row(self, inv: Invoice, full: bool = False) -> dict:
        out = {
            "id": str(inv.id), "code": inv.code, "kind": inv.kind, "status": inv.status,
            "currency": inv.currency, "tax_rate": _f(inv.tax_rate),
            "subtotal": _f(inv.subtotal), "discount_total": _f(inv.discount_total),
            "tax_total": _f(inv.tax_total), "total": _f(inv.total),
            "amount_paid": _f(inv.amount_paid), "balance": _f(inv.balance),
            "notes": inv.notes,
            "customer_id": str(inv.customer_id),
            "vehicle_id": str(inv.vehicle_id) if inv.vehicle_id else None,
            "appointment_id": str(inv.appointment_id) if inv.appointment_id else None,
            "case_id": str(inv.case_id) if inv.case_id else None,
            "source_estimate_id": str(inv.source_estimate_id) if inv.source_estimate_id else None,
            "issued_at": inv.issued_at.isoformat() if inv.issued_at else None,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "approved_at": inv.approved_at.isoformat() if inv.approved_at else None,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
            "is_overdue": (inv.kind == InvoiceKind.INVOICE and inv.balance > 0
                           and inv.due_date is not None and inv.due_date < date.today()),
        }
        cust = await self.session.get(Customer, inv.customer_id)
        out["customer_name"] = cust.full_name if cust else None
        if full and cust:
            out["customer"] = {"id": str(cust.id), "name": cust.full_name,
                               "phone": cust.phone, "email": cust.email}
        if inv.vehicle_id:
            from app.repositories.vehicle_repository import VehicleRepository
            vehicle = await VehicleRepository(self.session, self.sc).get_with_model(inv.vehicle_id)
            out["vehicle_label"] = _vehicle_label(vehicle) if vehicle else None
        return out
