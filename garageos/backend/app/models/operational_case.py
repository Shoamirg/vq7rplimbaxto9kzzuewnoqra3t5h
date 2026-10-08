"""OperationalCase — one generic model for every operational workflow.

Deliberately NOT EmergencyCase/SupportCase/WarrantyCase. A single case type
with a ``case_type`` discriminator + a shared lifecycle keeps the Operations
Center a platform: adding "towing" or "warranty" later is data, not a new table.
Reusable optional relations (vehicle, appointment) attach as needed.
"""
import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, true
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class CaseType:
    EMERGENCY = "emergency"
    SUPPORT = "support"
    TOWING = "towing"
    WARRANTY = "warranty"
    VIP = "vip"


class CaseStatus:
    NEW = "new"
    ACKNOWLEDGED = "acknowledged"
    ASSIGNED = "assigned"
    EN_ROUTE = "en_route"
    IN_PROGRESS = "in_progress"
    WAITING_CUSTOMER = "waiting_customer"
    RESOLVED = "resolved"
    CLOSED = "closed"


OPEN_CASE_STATUSES = frozenset({
    CaseStatus.NEW, CaseStatus.ACKNOWLEDGED, CaseStatus.ASSIGNED,
    CaseStatus.EN_ROUTE, CaseStatus.IN_PROGRESS, CaseStatus.WAITING_CUSTOMER,
})


class OperationalCase(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "operational_cases"
    # Existing migrations use the primary-key index and these server defaults.
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())

    # Universal id referenced everywhere (chat, notifications, reports, audit).
    code: Mapped[str] = mapped_column(String(24), nullable=False, index=True)

    case_type: Mapped[str] = mapped_column(String(24), nullable=False, default=CaseType.EMERGENCY, server_default=CaseType.EMERGENCY, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default=CaseStatus.NEW, server_default=CaseStatus.NEW, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="medium", server_default="medium")

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    channel: Mapped[str | None] = mapped_column(String(24), nullable=True)  # telegram/phone/web/…

    # Reusable optional relations.
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True)
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True)
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Location (roadside).
    location_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_lng: Mapped[float | None] = mapped_column(Float, nullable=True)

    # SLA target for first response, in minutes.
    sla_response_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15, server_default="15")

    def is_open(self) -> bool:
        return self.status in OPEN_CASE_STATUSES
