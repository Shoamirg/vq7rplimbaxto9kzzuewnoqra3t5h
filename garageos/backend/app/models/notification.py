"""Notification — a persisted, tenant-scoped record of a notable event.

Every notification originates from a domain event (see notification_handlers).
Modules never write notifications directly; they emit events, and the engine
maps events -> notifications. This one table is the source feed for the bell,
and later for Telegram / email / push / audit — one event stream, many views.
"""
import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text, false, true
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class Notification(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "notifications"
    # Existing migrations use the primary-key index and these server defaults.
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())

    # e.g. appointment | vehicle | customer | passport | emergency | finance | system
    category: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    # critical | high | medium | low | info
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="info", server_default="info")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Deep-link target (entity kind + id) so the bell can jump to the source.
    entity_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # Entity linkage so the SAME event projects onto the vehicle & customer
    # timelines (one stream, many views). Nullable — not every event has both.
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)

    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false(), index=True)
