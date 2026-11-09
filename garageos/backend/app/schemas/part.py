from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PartBase(BaseModel):
    name: str = Field(..., max_length=255, description="Ehtiyot qism yoki moy nomi")
    sku: str = Field(..., max_length=64, description="Ichki artikul / kod")
    oem_number: Optional[str] = Field(None, max_length=64, description="Original zavod kodi (OEM)")
    barcode: Optional[str] = Field(None, max_length=64, description="EAN-13 shtrix-kod")
    category: str = Field("other", max_length=32, description="Kategoriya")
    unit: str = Field("dona", max_length=20, description="O'lchov birligi (dona, litr, komplekt)")
    cost_price: Decimal = Field(default=Decimal("0"), ge=0, description="Tannarx / sotib olingan narx (so'm)")
    retail_price: Decimal = Field(default=Decimal("0"), ge=0, description="Sotish narxi (so'm)")
    quantity_in_stock: Decimal = Field(default=Decimal("0"), description="Hozirgi mavjud qoldiq")
    min_stock_level: Decimal = Field(default=Decimal("5"), ge=0, description="Minimal xavfsiz qoldiq")
    location: Optional[str] = Field(None, max_length=64, description="Ombordagi joyi / polka")
    supplier_name: Optional[str] = Field(None, max_length=128, description="Yetkazib beruvchi do'kon/diler")
    supplier_phone: Optional[str] = Field(None, max_length=32, description="Yetkazib beruvchi telefoni")
    notes: Optional[str] = Field(None, description="Qo'shimcha izoh")


class PartCreate(PartBase):
    pass


class PartUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    sku: Optional[str] = Field(None, max_length=64)
    oem_number: Optional[str] = Field(None, max_length=64)
    barcode: Optional[str] = Field(None, max_length=64)
    category: Optional[str] = Field(None, max_length=32)
    unit: Optional[str] = Field(None, max_length=20)
    cost_price: Optional[Decimal] = Field(None, ge=0)
    retail_price: Optional[Decimal] = Field(None, ge=0)
    quantity_in_stock: Optional[Decimal] = None
    min_stock_level: Optional[Decimal] = Field(None, ge=0)
    location: Optional[str] = Field(None, max_length=64)
    supplier_name: Optional[str] = Field(None, max_length=128)
    supplier_phone: Optional[str] = Field(None, max_length=32)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class MovementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_center_id: uuid.UUID
    part_id: uuid.UUID
    movement_type: str
    quantity: Decimal
    unit_cost: Decimal
    reference_invoice_id: Optional[uuid.UUID] = None
    reference_appointment_id: Optional[uuid.UUID] = None
    created_by_user_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    created_at: datetime


class PartResponse(PartBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_center_id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    is_low_stock: bool = False
    profit_margin: Decimal = Decimal("0")
    profit_margin_percent: float = 0.0


class StockAdjustmentRequest(BaseModel):
    movement_type: str = Field(..., description="purchase | sale | return | adjustment | loss")
    quantity: Decimal = Field(..., description="O'zgarish miqdori (masalan +10 yoki -2)")
    unit_cost: Optional[Decimal] = Field(None, ge=0, description="Yangi partiya tannarxi")
    reference_invoice_id: Optional[uuid.UUID] = None
    reference_appointment_id: Optional[uuid.UUID] = None
    notes: Optional[str] = Field(None, description="Harakat sababi yoki izohi")


class CategoryCount(BaseModel):
    category: str
    count: int
    total_value: Decimal


class InventorySummaryResponse(BaseModel):
    total_parts: int
    total_stock_count: Decimal
    total_cost_value: Decimal
    total_retail_value: Decimal
    low_stock_count: int
    categories: List[CategoryCount] = Field(default_factory=list)
