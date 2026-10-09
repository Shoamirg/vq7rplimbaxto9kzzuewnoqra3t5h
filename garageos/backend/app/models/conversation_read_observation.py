"""Short-lived server observations of the shared conversation generations."""
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class ConversationReadObservation(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "conversation_read_observations"
    __table_args__ = (
        CheckConstraint("message_generation >= 0 AND activity_generation >= 0",
                        name="ck_conversation_observation_generations"),
        Index("ix_conversation_observation_expiry", "service_center_id", "expires_at", "id"),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message_generation: Mapped[int] = mapped_column(BigInteger, nullable=False)
    activity_generation: Mapped[int] = mapped_column(BigInteger, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
