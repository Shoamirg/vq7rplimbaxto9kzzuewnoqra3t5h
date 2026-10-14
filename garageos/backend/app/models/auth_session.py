"""Server-owned token families. No bearer credentials are stored here."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        CheckConstraint("(principal_kind = 'staff' AND user_id IS NOT NULL AND customer_id IS NULL "
                        "AND customer_account_id IS NULL AND account_version IS NULL) OR "
                        "(principal_kind = 'customer' AND customer_id IS NOT NULL AND user_id IS NULL "
                        "AND ((customer_account_id IS NULL AND account_version IS NULL) OR "
                        "(customer_account_id IS NOT NULL AND account_version IS NOT NULL)))",
                        name="ck_auth_session_principal"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    principal_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    service_center_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("service_centers.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_accounts.id", ondelete="CASCADE"))
    account_version: Mapped[int | None] = mapped_column(Integer)
    demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    refresh_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
