"""Tenant business receipts retained for the associated message's lifetime."""
import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class MessageIntent(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "message_intents"
    __table_args__ = (
        UniqueConstraint("service_center_id", "conversation_id", "actor_kind", "actor_id", "key",
                         name="uq_message_intent_scope"),
        CheckConstraint("actor_kind = 'staff' OR actor_kind = 'customer'", name="ck_message_intent_actor_kind"),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    # Staff and customer IDs occupy different namespaces. This is authenticated
    # identity, separate from the message's accepted display-author snapshot.
    actor_kind: Mapped[str] = mapped_column(String(8), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    key: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    fingerprint_version: Mapped[int] = mapped_column(Integer, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversation_messages.id", ondelete="CASCADE"), nullable=False, unique=True)
    # Preserve the acknowledged representation even if delivery status or a
    # current author profile subsequently changes. Never project this ledger
    # through normal thread/list responses.
    response: Mapped[dict] = mapped_column(JSONB, nullable=False)
