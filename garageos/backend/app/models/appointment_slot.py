from datetime import datetime
from sqlalchemy import Boolean, DateTime, Index, Integer, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class AppointmentSlotStatus:
    AVAILABLE = "available"
    RESERVED = "reserved"
    BOOKED = "booked"
    BLOCKED = "blocked"


class AppointmentSlot(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "appointment_slots"

    __table_args__ = (
        Index("ix_slots_center_date_status", "service_center_id", "slot_date", "status"),
    )

    mechanic_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    slot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)  # HH:MM
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)  # HH:MM
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[str] = mapped_column(String(20), default=AppointmentSlotStatus.AVAILABLE, index=True)
    reserved_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    appointment_id: Mapped[UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    appointment = relationship("Appointment", back_populates="slot")
