"""Financial ledger — a reserved append-only stream of money movements.

Not a double-entry accounting system (yet). Every financial event (invoice
issued, payment received, refund, write-off, credit) also writes a
``LedgerEntry``, so reports, analytics, exports, tax summaries and future
accounting integrations become a projection over this stream rather than a
re-derivation from invoices. Reserving it now avoids treating the invoice as the
only financial record.
"""
import uuid
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class LedgerEntryType:
    ESTIMATE_APPROVED = "estimate_approved"
    INVOICE_ISSUED = "invoice_issued"
    PAYMENT_RECEIVED = "payment_received"
    REFUND_ISSUED = "refund_issued"
    WRITE_OFF = "write_off"
    CREDIT_APPLIED = "credit_applied"


class LedgerDirection:
    DEBIT = "debit"    # increases customer debt (invoice issued, refunded payment)
    CREDIT = "credit"  # reduces customer debt (payment, credit applied)


class LedgerEntry(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "ledger_entries"

    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)

    entry_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    occurred_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), nullable=False)
