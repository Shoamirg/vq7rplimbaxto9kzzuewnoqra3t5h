from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import BaseModelMixin


class ServiceCenter(BaseModelMixin, Base):
    __tablename__ = "service_centers"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")

    # Relationships
    users = relationship("User", back_populates="service_center", lazy="selectin")
    customers = relationship("Customer", back_populates="service_center", lazy="selectin")
    vehicles = relationship("Vehicle", back_populates="service_center", lazy="selectin")
    appointments = relationship("Appointment", back_populates="service_center", lazy="selectin")
    maintenance_rules = relationship("MaintenanceRule", back_populates="service_center", lazy="selectin")
