"""Digital Vehicle Inspection (DVI) models.

Allows technicians to conduct multi-point digital inspections with traffic-light
ratings (green, yellow, red), attach photos, describe issues, and propose
labor + part estimates. Customers can interactively approve or decline items
via a public, unguessable token or authenticated app/web view. Approved items
seamlessly roll into the active appointment's invoice.
"""
from __future__ import annotations

import secrets
import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


def generate_dvi_token() -> str:
    """Generate unguessable 24-character public URL token."""
    return f"dvi_{secrets.token_urlsafe(16)}"


class InspectionStatus:
    DRAFT = "draft"
    SENT = "sent_to_customer"
    PARTIALLY_APPROVED = "partially_approved"
    APPROVED = "approved"
    DECLINED = "declined"
    COMPLETED = "completed"


class InspectionRating:
    GREEN = "green"    # Good / Qoniqarli
    YELLOW = "yellow"  # Due soon / E'tibor talab
    RED = "red"        # Urgent / Xavfli, zudlik bilan ta'mirlash shart


class InspectionDecision:
    PENDING = "pending"
    APPROVED = "approved"
    DECLINED = "declined"


class InspectionCategory:
    ENGINE_FLUIDS = "engine_fluids"
    BRAKES = "brakes"
    TIRES_WHEELS = "tires_wheels"
    SUSPENSION_STEERING = "suspension_steering"
    BATTERY_ELECTRICAL = "battery_electrical"
    BODY_GLASS = "body_glass"


class VehicleInspection(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "vehicle_inspections"

    __table_args__ = (
        Index("ix_inspections_center_status", "service_center_id", "status"),
        Index("ix_inspections_center_vehicle", "service_center_id", "vehicle_id"),
        Index("ix_inspections_public_token", "public_token", unique=True),
    )

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    inspector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(32), default=InspectionStatus.DRAFT, nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(
        String(255), default="Kompleks texnik ko'rik (DVI)", nullable=False
    )
    summary_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    mileage_at_inspection: Mapped[int | None] = mapped_column(Integer, nullable=True)
    overall_score: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    public_token: Mapped[str] = mapped_column(
        String(64), default=generate_dvi_token, nullable=False, unique=True, index=True
    )

    # Relationships
    service_center = relationship("ServiceCenter", foreign_keys="VehicleInspection.service_center_id", lazy="selectin")
    vehicle = relationship("Vehicle", lazy="selectin")
    customer = relationship("Customer", lazy="selectin")
    appointment = relationship("Appointment", lazy="selectin")
    inspector = relationship("User", lazy="selectin")
    items: Mapped[list["InspectionItem"]] = relationship(
        "InspectionItem",
        back_populates="inspection",
        cascade="all, delete-orphan",
        order_by="InspectionItem.sort_order",
        lazy="selectin",
    )


class InspectionItem(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "inspection_items"

    __table_args__ = (
        Index("ix_inspection_items_inspection_id", "inspection_id"),
    )

    inspection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vehicle_inspections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category: Mapped[str] = mapped_column(
        String(64), default=InspectionCategory.ENGINE_FLUIDS, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    rating: Mapped[str] = mapped_column(
        String(16), default=InspectionRating.GREEN, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    photos: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )

    estimated_labor_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )
    estimated_parts_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), nullable=False
    )

    customer_decision: Mapped[str] = mapped_column(
        String(16), default=InspectionDecision.PENDING, nullable=False
    )
    customer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    inspection: Mapped["VehicleInspection"] = relationship(back_populates="items")
