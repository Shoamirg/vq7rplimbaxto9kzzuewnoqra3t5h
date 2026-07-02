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

    # White-label branding — every customer-facing surface (shell, login,
    # passport, PDF, emails, Mini App) derives its identity from these.
    brand_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tagline: Mapped[str | None] = mapped_column(String(160), nullable=True)
    monogram: Mapped[str | None] = mapped_column(String(4), nullable=True)
    primary_color: Mapped[str | None] = mapped_column(String(9), nullable=True)   # hex
    accent_color: Mapped[str | None] = mapped_column(String(9), nullable=True)    # hex
    slug: Mapped[str | None] = mapped_column(String(60), nullable=True)

    # Relationships
    users = relationship("User", back_populates="service_center", lazy="selectin")
    customers = relationship("Customer", back_populates="service_center", lazy="selectin")
    vehicles = relationship("Vehicle", back_populates="service_center", lazy="selectin")
    appointments = relationship("Appointment", back_populates="service_center", lazy="selectin")
    maintenance_rules = relationship("MaintenanceRule", back_populates="service_center", lazy="selectin")
