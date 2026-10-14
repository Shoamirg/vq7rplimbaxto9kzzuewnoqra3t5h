from sqlalchemy import Index, Integer, String, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class Vehicle(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "vehicles"

    __table_args__ = (
        Index("ix_vehicles_vin", "vin", postgresql_using="hash"),
        Index("ix_vehicles_customer_active", "customer_id", "is_active"),
        Index("ix_vehicles_center_km", "service_center_id", "current_km"),
        Index("uq_vehicles_center_plate_active", "service_center_id",
              text(r"upper(regexp_replace(license_plate, '[\s-]', '', 'g'))"), unique=True,
              postgresql_where=text(r"is_active = true AND upper(regexp_replace(license_plate, '[\s-]', '', 'g')) <> ''")),
        Index("uq_vehicles_center_vin_active", "service_center_id",
              text(r"upper(regexp_replace(vin, '[\s-]', '', 'g'))"), unique=True,
              postgresql_where=text(r"is_active = true AND upper(regexp_replace(vin, '[\s-]', '', 'g')) <> ''")),
    )

    customer_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vehicle_model_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicle_models.id"),
        nullable=False,
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    license_plate: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vin: Mapped[str | None] = mapped_column(String(17), nullable=True)
    engine_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    transmission: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    current_km: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    customer = relationship("Customer", back_populates="vehicles")
    vehicle_model = relationship("VehicleModel", back_populates="vehicles")
    service_records = relationship("ServiceRecord", back_populates="vehicle", lazy="selectin",
                                   cascade="all, delete-orphan")
    service_center = relationship("ServiceCenter", back_populates="vehicles")
