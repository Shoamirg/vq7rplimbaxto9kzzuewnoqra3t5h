from sqlalchemy import Integer, String, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import BaseModelMixin


class VehicleModel(BaseModelMixin, Base):
    __tablename__ = "vehicle_models"

    brand_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("brands.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    engine_options: Mapped[str | None] = mapped_column(Text, nullable=True)
    year_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    year_end: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    brand = relationship("Brand", back_populates="vehicle_models")
    maintenance_rules = relationship("MaintenanceRule", back_populates="vehicle_model", lazy="selectin")
    vehicles = relationship("Vehicle", back_populates="vehicle_model", lazy="selectin")
