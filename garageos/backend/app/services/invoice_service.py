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
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import joinedload, raiseload

from app.core.events import (
    EstimateApproved,
    EstimateRejected,
    EstimateCreated,
    EstimateSent,
    InvoiceIssued,
    InvoicePaid,
    PaymentReceived,
)
from app.exceptions import (AppointmentNotFound, AppointmentStateError, ConflictError,
                            CustomerNotFound, NotFoundError, VehicleNotFound)
import httpx

from app.core.config import settings
from app.exceptions import ValidationError
from app.models.customer import Customer
from app.models.service_center import ServiceCenter
from app.schemas.branding import branding_dict
from app.models.brand import Brand
from app.models.vehicle_model import VehicleModel
from app.models.appointment import Appointment, AppointmentStatus
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
from app.models.ledger import LedgerEntry
from app.models.notification import Notification
from app.models.operational_case import OperationalCase
from app.models.vehicle import Vehicle
from app.repositories.unit_of_work import UnitOfWork
from app.services.vehicle_health_service import _vehicle_label

_CENTS = Decimal("0.01")
_DEFAULT_TAX = Decimal("12.00")  # % — single document VAT rate for v1
_MAX_MONEY = Decimal("99999999.99")  # matches Numeric(10, 2)


def _money(d: Decimal | float | int | None) -> Decimal:
    try:
        value = Decimal(str(d if d is not None else 0))
        if not value.is_finite() or abs(value) > _MAX_MONEY:
            raise InvalidOperation
        return value.quantize(_CENTS, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        raise FinancialAmountInvalid() from None


def _f(d: Decimal | None) -> float:
    return float(d or 0)


class InvoiceNotFound(NotFoundError):
    def __init__(self):
        super().__init__("Invoice not found")


class InvoiceHasPayments(ConflictError):
    detail = "This document has recorded payments and can't be edited or archived."
    code = "INVOICE_HAS_PAYMENTS"


class LinkedInvoiceCannotDelete(ConflictError):
    detail = "A completed service work invoice must remain linked to its appointment"
    code = "LINKED_INVOICE_CANNOT_DELETE"


class InvoiceLinkMismatch(ValidationError):
    detail = "Invoice customer and vehicle must match the appointment"
    code = "INVOICE_LINK_MISMATCH"


class InvoiceVehicleMismatch(ValidationError):
    detail = "The invoice vehicle must belong to the selected customer"
    code = "INVOICE_VEHICLE_MISMATCH"


class InvoiceCaseNotFound(NotFoundError):
    detail = "Invoice case not found"


class InvoiceNeedsLineItems(ValidationError):
    detail = "Add at least one priced line item to the service work invoice"
    code = "INVOICE_NEEDS_LINE_ITEMS"


class FinancialAmountInvalid(ValidationError):
    detail = "Enter a finite, valid financial amount"
    code = "INVALID_FINANCIAL_AMOUNT"


class PaymentExceedsBalance(ConflictError):
    detail = "Payment exceeds the invoice's remaining balance"
    code = "PAYMENT_EXCEEDS_BALANCE"


class RefundExceedsPayment(ConflictError):
    detail = "Refund exceeds the amount already received"
    code = "REFUND_EXCEEDS_PAYMENT"


class InvoiceFinancialStateError(ConflictError):
    detail = "The document is not in a valid state for this financial action"
    code = "INVALID_INVOICE_FINANCIAL_STATE"


class PaymentRequestMismatch(ConflictError):
    detail = "This payment request was already used with different payment details"
    code = "PAYMENT_REQUEST_MISMATCH"


class InvoiceService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.session = uow.session
        self.sc = uow.service_center_id

    # ── code ──────────────────────────────────────────────────
    async def _next_code(self, kind: str) -> str:
        # Different appointments may be invoiced in parallel. Hold allocation
        # until commit so both transactions cannot print the same document code.
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:code_key, 0))"),
            {"code_key": f"garageos:billing-code:{self.sc}:{kind}"},
        )
        year = datetime.now(timezone.utc).year
        n = await self.session.scalar(
            select(func.count()).select_from(Invoice).where(
                Invoice.service_center_id == self.sc, Invoice.kind == kind))
        prefix = "EST" if kind == InvoiceKind.ESTIMATE else "INV"
        return f"{prefix}-{year}-{int(n or 0) + 1:06d}"

    async def _get(self, invoice_id: uuid.UUID, *, for_update: bool = False) -> Invoice:
        stmt = select(Invoice).where(
            Invoice.id == invoice_id, Invoice.service_center_id == self.sc,
            Invoice.is_active.is_(True))
        if for_update:
            # Serialize payments, edits and deletion on the same invoice. Refresh
            # identity-mapped rows after waiting so balance checks use committed data.
            stmt = stmt.with_for_update().execution_options(populate_existing=True)
        row = await self.session.execute(stmt)
        inv = row.scalar_one_or_none()
        if not inv:
            raise InvoiceNotFound()
        return inv

    async def send_telegram(self, invoice_id: uuid.UUID, link: str) -> dict:
        """Send the invoice/estimate link to the customer via the Telegram bot."""
        inv = await self._get(invoice_id)
        cust = (await self.session.execute(select(Customer).where(
            Customer.id == inv.customer_id, Customer.service_center_id == self.sc,
        ))).scalar_one_or_none()
        if not cust or not cust.telegram_id:
            raise ValidationError("This customer hasn't linked Telegram yet.")
        token = settings.TELEGRAM_BOT_TOKEN
        if not token:
            raise ValidationError("Telegram bot is not configured.")
        noun = "estimate" if inv.kind == InvoiceKind.ESTIMATE else "invoice"
        text = (
            f"Your {noun} {inv.code} is ready.\n"
            f"Total: {inv.currency or 'USD'} {_f(inv.total):.2f}"
            + (f" · Balance due {_f(inv.balance):.2f}" if _f(inv.balance) > 0 else " · Paid")
            + f"\n\nView{' & pay' if _f(inv.balance) > 0 else ''}: {link}"
        )
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": cust.telegram_id, "text": text},
                )
        except Exception as exc:  # noqa: BLE001
            raise ValidationError(f"Couldn't reach Telegram ({exc.__class__.__name__}).")
        if r.status_code != 200:
            raise ValidationError("Telegram rejected the message (is the customer's chat open with the bot?).")
        return {"ok": True}

    async def delete(self, invoice_id: uuid.UUID) -> None:
        """Soft-delete an estimate or invoice. A document with recorded payments
        cannot be deleted (protects the ledger) — void it instead."""
        inv = await self._get(invoice_id, for_update=True)
        if inv.status == InvoiceStatus.VOID:
            raise InvoiceFinancialStateError()
        if inv.is_estimate() and await self._has_converted_invoice(inv.id):
            raise InvoiceFinancialStateError()
        if inv.kind == InvoiceKind.INVOICE and inv.appointment_id is not None:
            raise LinkedInvoiceCannotDelete()
        if _money(inv.amount_paid) > 0 or await self._has_payment_history(inv.id):
            raise InvoiceHasPayments()
        inv.is_active = False
        await self.uow.flush()

    async def update(
        self, invoice_id: uuid.UUID, *,
        vehicle_id: uuid.UUID | None = None, tax_rate: float | None = None,
        due_date: date | None = None, notes: str | None = None,
        line_items: list[dict] | None = None,
    ) -> dict:
        """Edit an estimate or UNPAID invoice — replace line items, update
        vehicle/tax/notes, and recompute totals. A document with recorded payments
        is refused (protects the ledger). For issued invoices the ledger debit is
        kept in sync with the new total, so reports/reconciliation stay correct.
        """
        inv = await self._get(invoice_id, for_update=True)
        if inv.status == InvoiceStatus.VOID:
            raise InvoiceFinancialStateError()
        if inv.is_estimate() and (
            inv.status == InvoiceStatus.APPROVED or await self._has_converted_invoice(inv.id)
        ):
            raise InvoiceFinancialStateError(
                "Reopen the approved estimate before editing it; converted estimates are immutable"
            )
        if _money(inv.amount_paid) > 0 or await self._has_payment_history(inv.id):
            raise InvoiceHasPayments()

        if vehicle_id is not None:
            await self._validate_vehicle_owner(vehicle_id, inv.customer_id)
            if inv.kind == InvoiceKind.INVOICE and inv.appointment_id is not None and vehicle_id != inv.vehicle_id:
                raise InvoiceLinkMismatch()
            inv.vehicle_id = vehicle_id
        if tax_rate is not None:
            if not Decimal("0") <= _money(tax_rate) <= Decimal("100"):
                raise FinancialAmountInvalid()
            inv.tax_rate = _money(tax_rate)
        if due_date is not None:
            inv.due_date = due_date
        if notes is not None:
            inv.notes = notes

        if line_items is not None:
            existing = (await self.session.execute(
                select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == inv.id))).scalars().all()
            for it in existing:
                await self.session.delete(it)
            await self.session.flush()
            items = [self._build_item(inv.id, i, n) for n, i in enumerate(line_items)]
            for it in items:
                self.session.add(it)
            await self.session.flush()
        else:
            items = list((await self.session.execute(
                select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == inv.id))).scalars().all())
        self._recalc(inv, items)
        await self.session.flush()

        # Keep the issued-invoice ledger debit equal to the new total.
        if inv.kind == InvoiceKind.INVOICE:
            led = (await self.session.execute(
                select(LedgerEntry).where(
                    LedgerEntry.invoice_id == inv.id,
                    LedgerEntry.entry_type == "invoice_issued"))).scalar_one_or_none()
            if led is not None:
                led.amount = Decimal(str(_f(inv.total)))
                await self.session.flush()

        return await self.get_document(inv.id)

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
        if inv.total < 0:
            raise FinancialAmountInvalid()
        inv.balance = _money(inv.total - _money(inv.amount_paid))

    # ── create ────────────────────────────────────────────────
    async def _validate_vehicle_owner(self, vehicle_id: uuid.UUID, customer_id: uuid.UUID) -> None:
        owner = await self.session.scalar(select(Vehicle.customer_id).where(
            Vehicle.id == vehicle_id, Vehicle.service_center_id == self.sc,
            Vehicle.is_active.is_(True),
        ))
        if owner is None:
            raise VehicleNotFound()
        if owner != customer_id:
            raise InvoiceVehicleMismatch()

    async def create(
        self, *, kind: str, customer_id: uuid.UUID, vehicle_id: uuid.UUID | None = None,
        appointment_id: uuid.UUID | None = None, case_id: uuid.UUID | None = None,
        line_items: list[dict] | None = None, tax_rate: float | None = None,
        due_date: date | None = None, notes: str | None = None,
        source_estimate_id: uuid.UUID | None = None,
        currency: str = "UZS",
    ) -> dict:
        customer = await self.session.scalar(select(Customer.id).where(
            Customer.id == customer_id, Customer.service_center_id == self.sc,
            Customer.is_active.is_(True),
        ))
        if customer is None:
            raise CustomerNotFound()
        if vehicle_id is not None:
            await self._validate_vehicle_owner(vehicle_id, customer_id)
        if case_id is not None:
            case = await self.session.scalar(select(OperationalCase.id).where(
                OperationalCase.id == case_id, OperationalCase.service_center_id == self.sc,
                OperationalCase.is_active.is_(True),
            ))
            if case is None:
                raise InvoiceCaseNotFound()
        if appointment_id is not None:
            # Lock the parent row so two staff clicks cannot both pass the
            # existence check before either invoice is committed.
            appointment = (await self.session.execute(
                select(Appointment).where(
                    Appointment.id == appointment_id,
                    Appointment.service_center_id == self.sc,
                    Appointment.is_active.is_(True),
                ).with_for_update()
            )).scalar_one_or_none()
            if appointment is None:
                raise AppointmentNotFound()
            if kind == InvoiceKind.INVOICE:
                if appointment.status != AppointmentStatus.COMPLETED:
                    raise AppointmentStateError("Complete service work before creating its invoice")
                if customer_id != appointment.customer_id or vehicle_id != appointment.vehicle_id:
                    raise InvoiceLinkMismatch()
                existing = (await self.session.execute(
                    select(Invoice).where(
                        Invoice.service_center_id == self.sc,
                        Invoice.appointment_id == appointment_id,
                        Invoice.kind == InvoiceKind.INVOICE,
                        Invoice.is_active.is_(True),
                    ).limit(1)
                )).scalar_one_or_none()
                if existing is not None:
                    return await self.get_document(existing.id)
                if not line_items:
                    raise InvoiceNeedsLineItems()
        if tax_rate is not None and not Decimal("0") <= _money(tax_rate) <= Decimal("100"):
            raise FinancialAmountInvalid()
        code = await self._next_code(kind)
        inv = Invoice(
            service_center_id=self.sc, code=code, kind=kind,
            status=InvoiceStatus.DRAFT if kind == InvoiceKind.ESTIMATE else InvoiceStatus.ISSUED,
            customer_id=customer_id, vehicle_id=vehicle_id, appointment_id=appointment_id,
            case_id=case_id, source_estimate_id=source_estimate_id,
            currency=currency,
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
            direction=direction, amount=amount, description=desc, currency=inv.currency)

    def _build_item(self, invoice_id: uuid.UUID, data: dict, order: int) -> InvoiceLineItem:
        qty = _money(data.get("quantity", 1))
        price = _money(data.get("unit_price", 0))
        if qty <= 0 or price < 0:
            raise FinancialAmountInvalid()
        # NB: the API schema always includes line_total (default None), so .get()
        # can't fall back — compute qty*price whenever it's not explicitly given.
        given_total = data.get("line_total")
        line_total = _money(given_total) if given_total is not None else _money(qty * price)
        if line_total < 0:
            raise FinancialAmountInvalid()
        return InvoiceLineItem(
            service_center_id=self.sc, invoice_id=invoice_id,
            kind=data.get("kind", LineKind.PART), description=data["description"],
            quantity=qty, unit_price=price,
            line_total=line_total,
            taxable=data.get("taxable", data.get("kind") != LineKind.DISCOUNT),
            sort_order=data.get("sort_order", order),
        )

    # ── estimate lifecycle ────────────────────────────────────
    async def send(self, invoice_id: uuid.UUID) -> dict:
        inv = await self._get(invoice_id, for_update=True)
        # Sending/sharing an invoice does not change whether money is owed.
        # SENT belongs to the estimate lifecycle only.
        if inv.is_estimate() and inv.status in {
            InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.VIEWED,
            InvoiceStatus.CHANGES_REQUESTED,
        }:
            inv.status = InvoiceStatus.SENT
            await self.session.flush()
            self.uow.add_event(EstimateSent(
                service_center_id=self.sc, invoice_id=inv.id, code=inv.code,
                customer_id=inv.customer_id, vehicle_id=inv.vehicle_id))
        return await self.get_document(inv.id)

    async def set_status(self, invoice_id: uuid.UUID, status: str) -> dict:
        inv = await self._get(invoice_id, for_update=True)
        if inv.status == InvoiceStatus.VOID:
            raise InvoiceFinancialStateError()
        if inv.is_estimate():
            if status not in {InvoiceStatus.APPROVED, InvoiceStatus.REJECTED,
                              InvoiceStatus.CHANGES_REQUESTED, InvoiceStatus.VOID}:
                raise InvoiceFinancialStateError()
            if await self._has_converted_invoice(inv.id):
                raise InvoiceFinancialStateError("An estimate linked to an invoice is immutable")
        elif status == InvoiceStatus.VOID:
            if _money(inv.amount_paid) > 0:
                raise InvoiceHasPayments()
        elif status == InvoiceStatus.OVERDUE:
            if inv.status == InvoiceStatus.VOID or _money(inv.balance) <= 0:
                raise InvoiceFinancialStateError()
        else:
            # PAID/PARTIAL/ISSUED are computed by financial mutations, never
            # assigned by a free-form status request.
            raise InvoiceFinancialStateError()
        inv.status = status
        if status == InvoiceStatus.APPROVED:
            inv.approved_at = datetime.now(timezone.utc)
            self.uow.add_event(EstimateApproved(
                service_center_id=self.sc, invoice_id=inv.id, code=inv.code,
                customer_id=inv.customer_id, vehicle_id=inv.vehicle_id))
        elif status == InvoiceStatus.REJECTED:
            if inv.is_estimate():
                inv.approved_at = None
            self.uow.add_event(EstimateRejected(
                service_center_id=self.sc, invoice_id=inv.id, code=inv.code,
                customer_id=inv.customer_id, vehicle_id=inv.vehicle_id))
        elif inv.is_estimate():
            # Reopening an approved estimate explicitly revokes the prior
            # approval timestamp before the estimate can be revised.
            inv.approved_at = None
        await self.session.flush()
        return await self.get_document(inv.id)

    async def convert_to_invoice(self, estimate_id: uuid.UUID) -> dict:
        """Approved estimate → a NEW invoice referencing it (estimate stays immutable)."""
        est = await self._get(estimate_id, for_update=True)
        if not est.is_estimate():
            raise InvoiceNotFound()
        if est.status != InvoiceStatus.APPROVED:
            raise InvoiceFinancialStateError()
        existing = (await self.session.execute(select(Invoice).where(
            Invoice.service_center_id == self.sc, Invoice.kind == InvoiceKind.INVOICE,
            Invoice.source_estimate_id == est.id,
        ).order_by(Invoice.created_at).limit(1))).scalar_one_or_none()
        if existing is not None:
            if not existing.is_active:
                raise InvoiceFinancialStateError("The linked invoice is archived; this estimate cannot be converted again")
            return await self.get_document(existing.id)
        items = [{"kind": it.kind, "description": it.description, "quantity": _f(it.quantity),
                  "unit_price": _f(it.unit_price), "line_total": _f(it.line_total),
                  "taxable": it.taxable} for it in est.line_items]
        return await self.create(
            kind=InvoiceKind.INVOICE, customer_id=est.customer_id, vehicle_id=est.vehicle_id,
            appointment_id=est.appointment_id, case_id=est.case_id, line_items=items,
            tax_rate=_f(est.tax_rate), notes=est.notes, source_estimate_id=est.id,
            currency=est.currency)

    # ── payments ──────────────────────────────────────────────
    async def _has_payment_history(self, invoice_id: uuid.UUID) -> bool:
        return await self.session.scalar(select(Payment.id).where(
            Payment.service_center_id == self.sc, Payment.invoice_id == invoice_id,
        ).limit(1)) is not None

    async def _has_converted_invoice(self, estimate_id: uuid.UUID) -> bool:
        return await self.session.scalar(select(Invoice.id).where(
            Invoice.service_center_id == self.sc,
            Invoice.kind == InvoiceKind.INVOICE,
            Invoice.source_estimate_id == estimate_id,
        ).limit(1)) is not None

    async def record_payment(
        self, invoice_id: uuid.UUID, *, amount: float, method: str = PaymentMethod.CARD,
        kind: str = PaymentKind.PAYMENT, source: str = PaymentSource.MANUAL,
        reference: str | None = None, note: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict:
        amt = _money(amount)
        if amt <= 0:
            raise FinancialAmountInvalid()
        if kind not in {PaymentKind.PAYMENT, PaymentKind.DEPOSIT, PaymentKind.REFUND}:
            raise FinancialAmountInvalid()
        if method not in {PaymentMethod.CARD, PaymentMethod.CASH,
                          PaymentMethod.BANK_TRANSFER, PaymentMethod.ONLINE}:
            raise FinancialAmountInvalid()
        if source not in {PaymentSource.MANUAL, PaymentSource.TERMINAL, PaymentSource.TELEGRAM,
                          PaymentSource.STRIPE, PaymentSource.BANK, PaymentSource.CASH}:
            raise FinancialAmountInvalid()
        inv = await self._get(invoice_id, for_update=True)
        if idempotency_key is not None:
            try:
                idempotency_key = str(uuid.UUID(idempotency_key))
            except (ValueError, AttributeError, TypeError):
                raise FinancialAmountInvalid() from None
            existing = (await self.session.execute(select(Payment).where(
                Payment.service_center_id == self.sc, Payment.invoice_id == inv.id,
                Payment.idempotency_key == idempotency_key,
            ))).scalar_one_or_none()
            if existing is not None:
                if (existing.amount != amt or existing.method != method or existing.kind != kind
                        or existing.source != source or existing.reference != reference or existing.note != note):
                    raise PaymentRequestMismatch()
                return await self.get_document(inv.id)
        if inv.is_estimate():
            raise InvoiceFinancialStateError()
        if inv.status == InvoiceStatus.VOID:
            raise InvoiceFinancialStateError()
        if kind == PaymentKind.REFUND:
            if amt > _money(inv.amount_paid):
                raise RefundExceedsPayment()
        else:
            if inv.status in {InvoiceStatus.VOID, InvoiceStatus.REFUNDED}:
                raise InvoiceFinancialStateError()
            if amt > _money(inv.balance):
                raise PaymentExceedsBalance()
        pay = Payment(
            service_center_id=self.sc, invoice_id=inv.id, kind=kind, method=method,
            source=source, amount=amt, reference=reference, note=note,
            idempotency_key=idempotency_key,
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
            inv.paid_at = None
        else:
            inv.status = InvoiceStatus.ISSUED
            inv.paid_at = None
        await self.session.flush()

        self.uow.add_event(PaymentReceived(
            service_center_id=self.sc, invoice_id=inv.id, code=inv.code,
            customer_id=inv.customer_id, vehicle_id=inv.vehicle_id,
            amount=_f(amt), method=method, currency=inv.currency, kind=kind))
        self._ledger(
            inv, "refund_issued" if kind == PaymentKind.REFUND else "payment_received",
            "debit" if kind == PaymentKind.REFUND else "credit",
            _f(amt), f"{kind.title()} · {method} · {inv.code}")
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
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]),
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

    async def list_documents(self, *, view: str = "invoices", q: str = "", customer_id: uuid.UUID | None = None, page: int = 1, page_size: int = 80) -> dict:
        base = select(Invoice).where(
            Invoice.service_center_id == self.sc, Invoice.is_active.is_(True))
        if customer_id is not None:
            base = base.where(Invoice.customer_id == customer_id)
        filtered = self._view_where(base, view)
        if query := q.strip():
            # Search is literal: SQL LIKE wildcards in a plate/name must not match everything.
            pattern = "%" + query.replace("/", "//").replace("%", "/%").replace("_", "/_") + "%"
            customer_match = select(Customer.id).where(
                Customer.id == Invoice.customer_id, Customer.service_center_id == self.sc,
                Customer.full_name.ilike(pattern, escape="/")).exists()
            vehicle_match = select(Vehicle.id).join(
                VehicleModel, Vehicle.vehicle_model_id == VehicleModel.id).join(
                Brand, VehicleModel.brand_id == Brand.id).where(
                    Vehicle.id == Invoice.vehicle_id, Vehicle.service_center_id == self.sc,
                    or_(Vehicle.license_plate.ilike(pattern, escape="/"),
                        Vehicle.vin.ilike(pattern, escape="/"),
                        (Brand.name + " " + VehicleModel.name).ilike(pattern, escape="/"))).exists()
            filtered = filtered.where(or_(Invoice.code.ilike(pattern, escape="/"), customer_match, vehicle_match))
        total = int(await self.session.scalar(select(func.count()).select_from(filtered.subquery())) or 0)
        stmt = filtered.options(raiseload("*")).order_by(Invoice.created_at.desc(), Invoice.id.desc()).offset(
            (page - 1) * page_size).limit(page_size)
        rows = list((await self.session.execute(stmt)).scalars().all())
        # History needs names/labels, not each customer's appointments/vehicles
        # or every vehicle's service records. Fetch only this page's projections.
        customer_ids = {inv.customer_id for inv in rows}
        names = dict((await self.session.execute(select(Customer.id, Customer.full_name).where(
            Customer.service_center_id == self.sc, Customer.id.in_(customer_ids),
        ))).all()) if customer_ids else {}
        vehicle_ids = {inv.vehicle_id for inv in rows if inv.vehicle_id}
        labels = {}
        if vehicle_ids:
            vehicles = (await self.session.execute(select(Vehicle).where(
                Vehicle.service_center_id == self.sc, Vehicle.id.in_(vehicle_ids),
                Vehicle.is_active.is_(True),
            ).options(raiseload("*"), joinedload(Vehicle.vehicle_model).joinedload(VehicleModel.brand)))).scalars().all()
            labels = {vehicle.id: _vehicle_label(vehicle) for vehicle in vehicles}
        items = []
        for inv in rows:
            item = self._serialize_fields(inv)
            item["customer_name"] = names.get(inv.customer_id)
            if inv.vehicle_id:
                item["vehicle_label"] = labels.get(inv.vehicle_id)
            items.append(item)
        return {"items": items, "counts": await self.counts(), "kpis": await self.kpis(), "view": view,
                "total": total, "page": page, "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size}

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
        # Demo KPIs are UZS-only: legacy USD invoices remain readable as USD,
        # but their amounts must not be summed into the UZS headline.
        currency = "UZS"
        outstanding = await self.session.scalar(
            select(func.coalesce(func.sum(Invoice.balance), 0)).where(
                Invoice.service_center_id == sc, Invoice.is_active.is_(True),
                Invoice.currency == currency,
                Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE])))
        overdue = await self.session.scalar(
            select(func.coalesce(func.sum(Invoice.balance), 0)).where(
                Invoice.service_center_id == sc, Invoice.is_active.is_(True),
                Invoice.currency == currency,
                Invoice.kind == InvoiceKind.INVOICE, Invoice.balance > 0,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]),
                or_(Invoice.status == InvoiceStatus.OVERDUE, Invoice.due_date < date.today())))
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        paid_month = await self.session.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).join(
                Invoice, Payment.invoice_id == Invoice.id).where(
                Payment.service_center_id == sc, Payment.received_at >= month_start,
                Invoice.service_center_id == sc, Invoice.currency == currency,
                Payment.kind != PaymentKind.REFUND))
        return {
            "currency": currency,
            "outstanding": _f(outstanding), "overdue": _f(overdue),
            "paid_this_month": _f(paid_month),
        }

    # ── detail ────────────────────────────────────────────────
    async def get_document(self, invoice_id: uuid.UUID) -> dict:
        inv = await self._get(invoice_id)
        data = await self.serialize_row(inv, full=True)
        # The document's owner supplies current business presentation. Select
        # only these columns: loading the center ORM would fan out its selectin
        # relationships and expose unrelated private data to this read path.
        center = (await self.session.execute(select(
            ServiceCenter.name, ServiceCenter.brand_name, ServiceCenter.tagline,
            ServiceCenter.monogram, ServiceCenter.phone, ServiceCenter.address,
        ).where(ServiceCenter.id == inv.service_center_id))).first()
        if center is None:
            data["issuer"] = None
        else:
            brand = branding_dict(center)
            data["issuer"] = {
                "name": brand["name"], "tagline": brand["tagline"],
                "monogram": brand["monogram"], "phone": center.phone,
                "address": center.address,
            }
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

    async def get_for_appointment(self, appointment_id: uuid.UUID) -> dict:
        appointment = (await self.session.execute(
            select(Appointment.id).where(
                Appointment.id == appointment_id,
                Appointment.service_center_id == self.sc,
            )
        )).scalar_one_or_none()
        if appointment is None:
            raise AppointmentNotFound()
        invoice = (await self.session.execute(
            select(Invoice).where(
                Invoice.service_center_id == self.sc,
                Invoice.appointment_id == appointment_id,
                Invoice.kind == InvoiceKind.INVOICE,
                Invoice.is_active.is_(True),
            ).limit(1)
        )).scalar_one_or_none()
        if invoice is None:
            raise InvoiceNotFound()
        return await self.get_document(invoice.id)

    async def _timeline(self, invoice_id: uuid.UUID) -> list:
        rows = (await self.session.execute(
            select(Notification).where(
                Notification.service_center_id == self.sc,
                Notification.entity_type == "invoice", Notification.entity_id == invoice_id,
            ).order_by(Notification.created_at.asc()).limit(40))).scalars().all()
        return [{"title": n.title, "detail": n.body, "date": n.created_at.isoformat(),
                 "severity": n.severity} for n in rows]

    @staticmethod
    def _serialize_fields(inv: Invoice) -> dict:
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
                           and inv.status in {InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE}
                           and inv.due_date is not None and inv.due_date < date.today()),
        }
        return out

    async def serialize_row(self, inv: Invoice, full: bool = False) -> dict:
        out = self._serialize_fields(inv)
        cust = (await self.session.execute(select(Customer).where(
            Customer.id == inv.customer_id, Customer.service_center_id == self.sc,
        ))).scalar_one_or_none()
        out["customer_name"] = cust.full_name if cust else None
        if full and cust:
            out["customer"] = {"id": str(cust.id), "name": cust.full_name,
                               "phone": cust.phone, "email": cust.email}
        if inv.vehicle_id:
            from app.repositories.vehicle_repository import VehicleRepository
            vehicle = await VehicleRepository(self.session, self.sc).get_with_model(inv.vehicle_id)
            out["vehicle_label"] = _vehicle_label(vehicle) if vehicle else None
        return out
