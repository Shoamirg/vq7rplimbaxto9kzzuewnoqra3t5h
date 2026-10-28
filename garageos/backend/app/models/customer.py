from sqlalchemy import BigInteger, CheckConstraint, Index, String, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class Customer(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (
        Index("uq_customers_center_phone_active", "service_center_id",
              text(r"regexp_replace(phone, '\D', '', 'g')"), unique=True,
              postgresql_where=text(r"is_active = true AND regexp_replace(phone, '\D', '', 'g') <> ''")),
        CheckConstraint("registered_via IN ('workshop', 'self')", name="ck_customers_registered_via"),
    )

    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True, index=True)
    telegram_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    loyalty_points: Mapped[int] = mapped_column(default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Who registered this customer: 'workshop' (staff added them) or 'self'
    # (signed up on their own). Drives which workshops they may see.
    registered_via: Mapped[str] = mapped_column(String(16), default="workshop", server_default="workshop",
                                                nullable=False)

    # Relationships
    vehicles = relationship("Vehicle", back_populates="customer", lazy="selectin",
                            cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="customer", lazy="selectin")
    service_center = relationship("ServiceCenter", back_populates="customers")
