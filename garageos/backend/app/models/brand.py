from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import BaseModelMixin


class Brand(BaseModelMixin, Base):
    __tablename__ = "brands"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationships
    vehicle_models = relationship("VehicleModel", back_populates="brand", lazy="selectin")
    maintenance_rules = relationship("MaintenanceRule", back_populates="brand", lazy="selectin")
