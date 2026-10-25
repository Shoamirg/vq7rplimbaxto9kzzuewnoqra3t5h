from sqlalchemy import Boolean, String, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class User(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    role_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roles.id"),
        nullable=False,
    )
    is_super_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # For masters/mechanics: the service types (from the maintenance-rule catalog)
    # this person performs. Null/absent = none assigned yet.
    service_types: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    role = relationship("Role", lazy="joined")
    service_center = relationship("ServiceCenter", back_populates="users")
