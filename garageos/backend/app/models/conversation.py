"""Unified Communications Platform — the conversation aggregate.

One ``Conversation`` type for every interaction, whatever the channel or the
reason. Channel is metadata on each ``Message`` (telegram / web / phone / email
/ sms / internal), so a single thread interleaves them. Linked-entity columns
(customer, vehicle, appointment, case, invoice) mirror the ``Notification``
pattern — every module points at the same thread instead of spawning its own
messaging system. ``Participant`` captures who is in the thread and their role;
``Attachment`` treats photos / location / voice / documents as first-class,
meaningfully-labelled objects (not opaque filenames).

Deliberately NOT an "operations conversation": Operations, warranty, VIP, a
billing question — all the same model. The Inbox is the home of work.
"""
import uuid

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class ConvType:
    EMERGENCY = "emergency"
    SUPPORT = "support"
    WARRANTY = "warranty"
    VIP = "vip"
    GENERAL = "general"


class ConvStatus:
    """A conversation's status answers one question: *why is this still open?*"""
    OPEN = "open"                       # needs a first/next human reply
    WAITING_CUSTOMER = "waiting_customer"
    WAITING_TECHNICIAN = "waiting_technician"
    WAITING_APPROVAL = "waiting_approval"
    SNOOZED = "snoozed"
    RESOLVED = "resolved"


_OPEN_STATUSES = {
    ConvStatus.OPEN, ConvStatus.WAITING_CUSTOMER,
    ConvStatus.WAITING_TECHNICIAN, ConvStatus.WAITING_APPROVAL,
}


class Channel:
    TELEGRAM = "telegram"
    WEB = "web"
    PHONE = "phone"
    EMAIL = "email"
    SMS = "sms"
    INTERNAL = "internal"


class ParticipantRole:
    CUSTOMER = "customer"
    DISPATCHER = "dispatcher"
    MECHANIC = "mechanic"
    MANAGER = "manager"
    WATCHER = "watcher"
    SYSTEM = "system"


class MessageKind:
    TEXT = "text"
    NOTE = "note"              # internal note — never shown to the customer
    ANNOUNCEMENT = "announcement"


class AttachmentKind:
    PHOTO = "photo"
    LOCATION = "location"
    VOICE = "voice"
    DOCUMENT = "document"
    ESTIMATE = "estimate"


class Conversation(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("message_generation >= acknowledged_message_generation AND acknowledged_message_generation >= 0 "
                        "AND unread_messages = message_generation - acknowledged_message_generation",
                        name="ck_conversation_message_generation"),
        CheckConstraint("activity_generation >= acknowledged_activity_generation AND acknowledged_activity_generation >= 0 "
                        "AND unread_activity = activity_generation - acknowledged_activity_generation",
                        name="ck_conversation_activity_generation"),
    )

    subject: Mapped[str | None] = mapped_column(String(200), nullable=True)
    conv_type: Mapped[str] = mapped_column(String(24), nullable=False, default=ConvType.GENERAL, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default=ConvStatus.OPEN, index=True)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")  # high|medium|low

    # Denormalised "inbox row" fields — kept current on every new message so the
    # list renders without loading each thread's messages.
    last_channel: Mapped[str | None] = mapped_column(String(24), nullable=True)
    last_message_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)
    # last_activity_at moves on ANY activity (message OR event: assignment,
    # passport issued, appointment confirmed…) so threads with live work — not
    # just new chat — float to the top. This is the inbox sort key.
    last_activity_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_message_preview: Mapped[str | None] = mapped_column(String(300), nullable=True)
    last_sender_role: Mapped[str | None] = mapped_column(String(24), nullable=True)
    # Unread messages and unread activity feel different — a customer reply vs a
    # mechanic being assigned — so they're counted separately.
    unread_messages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unread_activity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Shared observed-read boundaries; these are not individual read receipts.
    message_generation: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default=text("0"))
    activity_generation: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default=text("0"))
    acknowledged_message_generation: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default=text("0"))
    acknowledged_activity_generation: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default=text("0"))

    # AI summary chip. Stored with version + timestamp so it can be regenerated
    # when the thread materially changes rather than lingering stale forever.
    ai_summary: Mapped[str | None] = mapped_column(String(200), nullable=True)
    summary_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary_updated_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)

    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # ── Linked entities — the whole point of a *universal* conversation. ──
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True)
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True)
    case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operational_cases.id", ondelete="SET NULL"), nullable=True, index=True)
    # No invoices table yet — reserved as a plain id so the link survives when it lands.
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Pinned operational facts shown above the thread (gate code, access notes…).
    pinned_notes: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", lazy="selectin",
        order_by="Message.created_at")
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", lazy="selectin")

    def is_open(self) -> bool:
        return self.status in _OPEN_STATUSES


class Participant(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "conversation_participants"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(24), nullable=False, default=ParticipantRole.CUSTOMER)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    # A watcher is someone Following the thread without being assigned — they get
    # updates anyway. Managers live in this role.
    is_following: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Presence — reserved now so shared-drafts / live indicators need no schema churn.
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_typing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    active_channel: Mapped[str | None] = mapped_column(String(24), nullable=True)
    last_seen_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)

    conversation: Mapped["Conversation"] = relationship(back_populates="participants")


class Message(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "conversation_messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)

    kind: Mapped[str] = mapped_column(String(24), nullable=False, default=MessageKind.TEXT)
    channel: Mapped[str] = mapped_column(String(24), nullable=False, default=Channel.WEB)  # metadata!
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Denormalised author snapshot so a message renders without joins.
    author_role: Mapped[str] = mapped_column(String(24), nullable=False, default=ParticipantRole.DISPATCHER)
    author_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_status: Mapped[str] = mapped_column(String(16), nullable=False, default="sent")  # sent|delivered|read
    mentions: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # ["@Carlos","@TowTeam",…]

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="message", cascade="all, delete-orphan", lazy="selectin")


class Attachment(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "conversation_attachments"

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversation_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)

    kind: Mapped[str] = mapped_column(String(24), nullable=False, default=AttachmentKind.PHOTO)
    label: Mapped[str] = mapped_column(String(200), nullable=False)  # "Dashboard warning lights"
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # lat/lng, duration, mime, size…

    message: Mapped["Message"] = relationship(back_populates="attachments")
