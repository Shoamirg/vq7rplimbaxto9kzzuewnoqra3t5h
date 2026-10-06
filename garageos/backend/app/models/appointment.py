from datetime import datetime
from sqlalchemy import DateTime, Index, Integer, String, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class AppointmentStatus:
    PENDING = "pending"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    RESCHEDULED = "rescheduled"


class Appointment(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "appointments"

    __table_args__ = (
        Index("ix_appointments_center_date", "service_center_id", "appointment_date"),
        Index("ix_appointments_center_status", "service_center_id", "status"),
        Index("ix_appointments_center_mechanic", "service_center_id", "mechanic_user_id"),
    )

    customer_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vehicle_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
    )
    maintenance_rule_id: Mapped[UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("maintenance_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    mechanic_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mechanic_user_id: Mapped[UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    appointment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    appointment_time: Mapped[str] = mapped_column(String(10), nullable=False)  # HH:MM format
    estimated_duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    status: Mapped[str] = mapped_column(String(20), default=AppointmentStatus.PENDING, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_cost: Mapped[float | None] = mapped_column(nullable=True)

    # Relationships
    customer = relationship("Customer", back_populates="appointments")
    vehicle = relationship("Vehicle", lazy="selectin")
    maintenance_rule = relationship("MaintenanceRule", lazy="selectin")
    service_center = relationship("ServiceCenter", back_populates="appointments")
    slot = relationship("AppointmentSlot", back_populates="appointment", uselist=False)
