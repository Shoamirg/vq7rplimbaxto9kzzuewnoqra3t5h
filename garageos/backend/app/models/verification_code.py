"""One-time SMS codes for customer sign-up and password reset.

Only an HMAC of the code is stored. A row is single-use (``consumed_at``),
short-lived (``expires_at``) and locks after a few wrong guesses (``attempts``).
"""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class VerificationCode(Base):
    __tablename__ = "verification_codes"
    __table_args__ = (
        Index("ix_verification_codes_lookup", "purpose", "email", "created_at"),
        CheckConstraint("purpose IN ('signup', 'reset')", name="ck_verification_codes_purpose"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purpose: Mapped[str] = mapped_column(String(16), nullable=False)  # signup | reset
    phone: Mapped[str] = mapped_column(String(20), nullable=False)    # normalized digits
    email: Mapped[str] = mapped_column(String(255), nullable=False)   # lower-cased
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
