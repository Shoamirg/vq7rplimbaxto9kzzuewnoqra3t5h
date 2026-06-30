from sqlalchemy import Integer, String, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class MaintenanceRule(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "maintenance_rules"

    brand_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("brands.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vehicle_model_id: Mapped[UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicle_models.id", ondelete="SET NULL"),
        nullable=True,
    )
    service_type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    interval_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interval_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_cost: Mapped[float | None] = mapped_column(nullable=True)
    is_required: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(default=0)

    # Relationships
    brand = relationship("Brand", back_populates="maintenance_rules")
    vehicle_model = relationship("VehicleModel", back_populates="maintenance_rules")
    service_center = relationship("ServiceCenter", back_populates="maintenance_rules")
