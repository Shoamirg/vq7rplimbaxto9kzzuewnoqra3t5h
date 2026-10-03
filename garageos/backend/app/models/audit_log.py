"""AuditLog — an append-only record of security-relevant actions.

Distinct from Notification (a user-facing feed): the audit log is a tamper-evident
trail for *who did what* — logins (success and failure), privileged writes, billing
actions — that a pilot garage or a security review can inspect. It is written in its
own transaction (see AuditService) so a record survives even when the action it
describes rolls back (e.g. a rejected login attempt).

Nullable tenant/actor: pre-authentication events (a failed login for an unknown
email) have no service center and no user id, but must still be recorded.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # Tenant + actor — nullable for pre-auth events (unknown-email login failures).
    service_center_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("service_centers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_email: Mapped[str | None] = mapped_column(String(320), nullable=True)

    # e.g. "auth.login.success", "auth.login.failure", "invoice.void"
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # "success" | "failure"
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="success", server_default="success")

    # Optional target entity (invoice, vehicle, customer, …).
    resource_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Request provenance.
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)

    # Free-form structured context (reason codes, changed fields). Never secrets.
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
