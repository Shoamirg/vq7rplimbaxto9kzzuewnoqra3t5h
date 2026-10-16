from sqlalchemy import ForeignKey, String, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class CustomerAccount(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = 'customer_accounts'
    customer_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('customers.id', ondelete='CASCADE'), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
