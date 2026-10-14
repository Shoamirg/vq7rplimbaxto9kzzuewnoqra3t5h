"""Commercial Operations — the billing aggregate (estimates, invoices, payments).

A single ``Invoice`` model with a ``kind`` discriminator (estimate | invoice)
carries the whole commercial lifecycle, but estimates and invoices stay SEPARATE
rows: converting an approved estimate creates a NEW invoice that references it via
``source_estimate_id`` — estimates remain immutable (audit trail, re-issue, and
multiple invoices from one large job later). Line items and payments are children;
payments are first-class objects (method + kind + source), never a boolean.

Everything links back to customer / vehicle / appointment / case with the same
relationship philosophy used across GarageOS. ``work_order_id`` is reserved for a
future Work Order aggregate. The financial timeline is projected from domain
events via the existing notification engine — no separate timeline table.
"""
import uuid
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class InvoiceKind:
    ESTIMATE = "estimate"
    INVOICE = "invoice"


class InvoiceStatus:
    # Estimate lifecycle
    DRAFT = "draft"
    SENT = "sent"
    VIEWED = "viewed"
    APPROVED = "approved"
    REJECTED = "rejected"
    CHANGES_REQUESTED = "changes_requested"
    EXPIRED = "expired"
    # Invoice lifecycle
    ISSUED = "issued"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"
    VOID = "void"
    REFUNDED = "refunded"


# Invoice statuses that still owe money (drive the "outstanding" queues).
_OUTSTANDING = {InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE}
# Estimate statuses still awaiting the customer.
_ESTIMATE_OPEN = {InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.VIEWED,
                  InvoiceStatus.CHANGES_REQUESTED}


class LineKind:
    PART = "part"
    LABOR = "labor"
    FEE = "fee"
    DISCOUNT = "discount"


class PaymentKind:
    PAYMENT = "payment"
    REFUND = "refund"
    DEPOSIT = "deposit"


class PaymentMethod:
    CASH = "cash"
    CARD = "card"
    BANK_TRANSFER = "bank_transfer"
    ONLINE = "online"


class PaymentSource:
    MANUAL = "manual"
    TERMINAL = "terminal"
    TELEGRAM = "telegram"
    STRIPE = "stripe"
    BANK = "bank"
    CASH = "cash"


class Invoice(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        Index(
            "uq_invoices_final_appointment", "service_center_id", "appointment_id",
            unique=True,
            postgresql_where=text("kind = 'invoice' AND appointment_id IS NOT NULL AND is_active = true"),
        ),
    )

    code: Mapped[str] = mapped_column(String(24), nullable=False, index=True)  # EST-/INV-YYYY-NNNNNN
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default=InvoiceKind.INVOICE, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default=InvoiceStatus.DRAFT, index=True)

    # ── Linked entities (same philosophy as the rest of GarageOS) ──
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True)
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True)
    case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operational_cases.id", ondelete="SET NULL"), nullable=True)
    # An invoice created from an approved estimate points back at it.
    source_estimate_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    # Reserved for a future Work Order aggregate (no table yet).
    work_order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # ── Money (Numeric for correctness; serialized as float) ──
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0"))  # percent
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    discount_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    tax_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    balance: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)

    issued_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)
    due_date: Mapped["Date | None"] = mapped_column(Date, nullable=True, index=True)
    viewed_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    line_items: Mapped[list["InvoiceLineItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", lazy="selectin",
        order_by="InvoiceLineItem.sort_order")
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", lazy="selectin",
        order_by="Payment.received_at")

    def is_estimate(self) -> bool:
        return self.kind == InvoiceKind.ESTIMATE

    def is_outstanding(self) -> bool:
        return not self.is_estimate() and self.status in _OUTSTANDING

    def is_estimate_open(self) -> bool:
        return self.is_estimate() and self.status in _ESTIMATE_OPEN


class InvoiceLineItem(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "invoice_line_items"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default=LineKind.PART)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("1"))  # hours for labor
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    taxable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")


class Payment(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "invoice_payments"
    __table_args__ = (
        Index("uq_invoice_payments_idempotency", "service_center_id", "invoice_id",
              "idempotency_key", unique=True),
    )

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default=PaymentKind.PAYMENT)
    method: Mapped[str] = mapped_column(String(16), nullable=False, default=PaymentMethod.CARD)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default=PaymentSource.MANUAL)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(36), nullable=True)
    received_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    invoice: Mapped["Invoice"] = relationship(back_populates="payments")
