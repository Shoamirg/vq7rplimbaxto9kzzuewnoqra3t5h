"""Parts and Inventory Management models.

Tracks spare parts, fluids, filters, accessories, unit costs, retail prices,
stock quantities, minimum threshold alerts, and inventory ledger movements (purchase, sale, return, adjustment, loss).
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin, ServiceCenterMixin


class PartCategory:
    OILS_FLUIDS = "oils_fluids"         # Motor moyi, antifriz, tormoz suyuqligi
    FILTERS = "filters"                 # Moy, havo, salon, yoqilg'i filtrlari
    BRAKES = "brakes"                   # Kolodkalar, disklar, barabanlar
    SUSPENSION = "suspension"           # Amortizator, richag, sharovoy, tyaga
    IGNITION_ELECTRICAL = "electrical"  # Shamlar (svecha), akkumulyator, lampalar
    ENGINE_PARTS = "engine"             # Remen, rolik, prokladkalar
    TIRES_WHEELS = "tires"              # Shinalar, disklar, gaykalar
    ACCESSORIES = "accessories"         # Oyna tozalagich (dvornik), ximiyalar
    OTHER = "other"


class MovementType:
    PURCHASE = "purchase"      # Kirim (partiya sotib olindi)
    SALE = "sale"              # Chiqim (invoys yoki buyurtma orqali sotildi)
    RETURN = "return"          # Qaytarish (mijoz qaytardi yoki do'konga qaytarildi)
    ADJUSTMENT = "adjustment"  # Tuzatish (inventarizatsiya sanog'i bo'yicha)
    LOSS = "loss"              # Zarar / Yaroqsiz (spisanie)


class PartItem(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "parts"

    __table_args__ = (
        Index("ix_parts_center_sku", "service_center_id", "sku"),
        Index("ix_parts_center_barcode", "service_center_id", "barcode"),
        Index("ix_parts_center_oem", "service_center_id", "oem_number"),
        Index("ix_parts_center_category", "service_center_id", "category"),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(64), nullable=False)  # Ichki artikul
    oem_number: Mapped[str | None] = mapped_column(String(64), nullable=True)  # Ishlab chiqaruvchi kodi
    barcode: Mapped[str | None] = mapped_column(String(64), nullable=True)  # EAN-13 shtrix-kod
    category: Mapped[str] = mapped_column(String(32), default=PartCategory.OTHER, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), default="dona", nullable=False)  # dona, litr, komplekt, m

    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"), nullable=False)  # Tannarx (so'm)
    retail_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"), nullable=False)  # Sotish narxi (so'm)
    quantity_in_stock: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)
    min_stock_level: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("5"), nullable=False)

    location: Mapped[str | None] = mapped_column(String(64), nullable=True)  # Polka: "A-12"
    supplier_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    supplier_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    service_center = relationship("ServiceCenter", foreign_keys="PartItem.service_center_id", lazy="selectin")
    movements: Mapped[list["InventoryMovement"]] = relationship(
        "InventoryMovement",
        back_populates="part",
        cascade="all, delete-orphan",
        order_by="InventoryMovement.created_at.desc()",
        lazy="selectin",
    )


class InventoryMovement(BaseModelMixin, ServiceCenterMixin, Base):
    __tablename__ = "inventory_movements"

    __table_args__ = (
        Index("ix_movements_center_part", "service_center_id", "part_id"),
        Index("ix_movements_center_type", "service_center_id", "movement_type"),
    )

    part_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    movement_type: Mapped[str] = mapped_column(String(32), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)  # +10 or -2
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"), nullable=False)

    reference_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
    )
    reference_appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    part: Mapped["PartItem"] = relationship(back_populates="movements")
