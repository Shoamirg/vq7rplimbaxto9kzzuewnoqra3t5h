from datetime import datetime
from sqlalchemy import DateTime, Integer, String, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class ServiceRecord(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "service_records"
    __table_args__ = (
        Index(
            "uq_service_records_appointment", "appointment_id", unique=True,
            postgresql_where=text("appointment_id IS NOT NULL"),
        ),
    )

    vehicle_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    appointment_id: Mapped[UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="SET NULL"),
        nullable=True,
    )
    service_type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    performed_km: Mapped[int] = mapped_column(Integer, nullable=False)
    performed_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cost: Mapped[float | None] = mapped_column(nullable=True)
    technician_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    warranty_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    warranty_months: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    vehicle = relationship("Vehicle", back_populates="service_records")
