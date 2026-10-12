"""A vehicle's repair visit from intake through customer handoff."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class WorkOrderStatus:
    RECEIVED = "received"
    IN_PROGRESS = "in_progress"
    READY = "ready"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class WorkOrder(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "work_orders"

    __table_args__ = (
        UniqueConstraint(
            "service_center_id", "idempotency_key",
            name="uq_work_orders_center_idempotency",
        ),
        Index(
            "uq_work_orders_appointment_id",
            "appointment_id",
            unique=True,
            postgresql_where=text("appointment_id IS NOT NULL"),
            sqlite_where=text("appointment_id IS NOT NULL"),
        ),
        Index("ix_work_orders_center_status_created", "service_center_id", "status", "created_at"),
        Index("ix_work_orders_assignee_status", "assigned_mechanic_user_id", "status"),
        CheckConstraint(
            "intake_odometer_km IS NULL OR intake_odometer_km >= 0",
            name="ck_work_orders_intake_odometer_nonnegative",
        ),
        CheckConstraint(
            "completion_odometer_km IS NULL OR completion_odometer_km >= 0",
            name="ck_work_orders_completion_odometer_nonnegative",
        ),
        CheckConstraint("actual_cost IS NULL OR actual_cost >= 0", name="ck_work_orders_cost_nonnegative"),
    )

    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True
    )
    assigned_mechanic_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    service_type: Mapped[str] = mapped_column(String(100), nullable=False)
    customer_concern: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_performed: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=WorkOrderStatus.RECEIVED, index=True)
    intake_odometer_km: Mapped[int | None] = mapped_column(nullable=True)
    completion_odometer_km: Mapped[int | None] = mapped_column(nullable=True)
    actual_cost: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)

    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    customer = relationship("Customer")
    vehicle = relationship("Vehicle")
    appointment = relationship("Appointment", back_populates="work_order")
    assigned_mechanic = relationship("User", foreign_keys=[assigned_mechanic_user_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    service_record = relationship("ServiceRecord", back_populates="work_order", uselist=False)
