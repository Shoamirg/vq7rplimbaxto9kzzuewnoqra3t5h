from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class InspectionItemBase(BaseModel):
    category: str = Field(default="engine_fluids", description="Subsystem category")
    title: str = Field(..., max_length=255, description="Item name / checklist item")
    rating: str = Field(default="green", description="green | yellow | red")
    notes: Optional[str] = Field(None, description="Mechanic observations & notes")
    photos: List[str] = Field(default_factory=list, description="Array of photo URLs/paths")
    estimated_labor_price: Decimal = Field(default=Decimal("0"), ge=0)
    estimated_parts_price: Decimal = Field(default=Decimal("0"), ge=0)
    sort_order: int = Field(default=0)


class InspectionItemCreate(InspectionItemBase):
    pass


class InspectionItemUpdate(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    rating: Optional[str] = None
    notes: Optional[str] = None
    photos: Optional[List[str]] = None
    estimated_labor_price: Optional[Decimal] = None
    estimated_parts_price: Optional[Decimal] = None
    customer_decision: Optional[str] = None
    customer_comment: Optional[str] = None
    sort_order: Optional[int] = None


class InspectionItemResponse(InspectionItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    inspection_id: uuid.UUID
    service_center_id: uuid.UUID
    customer_decision: str = "pending"
    customer_comment: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class InspectionCreate(BaseModel):
    vehicle_id: uuid.UUID
    customer_id: Optional[uuid.UUID] = None
    appointment_id: Optional[uuid.UUID] = None
    title: str = Field(default="Kompleks texnik ko'rik (DVI)", max_length=255)
    summary_notes: Optional[str] = None
    mileage_at_inspection: Optional[int] = Field(None, ge=0)
    items: Optional[List[InspectionItemCreate]] = None


class InspectionUpdate(BaseModel):
    title: Optional[str] = None
    summary_notes: Optional[str] = None
    mileage_at_inspection: Optional[int] = None
    status: Optional[str] = None


class InspectionSummary(BaseModel):
    total_items: int = 0
    green_count: int = 0
    yellow_count: int = 0
    red_count: int = 0
    total_estimated_amount: Decimal = Decimal("0")
    approved_amount: Decimal = Decimal("0")


class InspectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_center_id: uuid.UUID
    vehicle_id: uuid.UUID
    customer_id: Optional[uuid.UUID] = None
    appointment_id: Optional[uuid.UUID] = None
    inspector_id: Optional[uuid.UUID] = None
    status: str
    title: str
    summary_notes: Optional[str] = None
    mileage_at_inspection: Optional[int] = None
    overall_score: int
    public_token: str
    public_url: Optional[str] = None
    items: List[InspectionItemResponse] = Field(default_factory=list)
    summary: Optional[InspectionSummary] = None
    created_at: datetime
    updated_at: datetime


class CustomerItemDecision(BaseModel):
    item_id: uuid.UUID
    decision: str = Field(..., description="approved | declined")
    comment: Optional[str] = None


class CustomerInspectionDecisionRequest(BaseModel):
    decisions: List[CustomerItemDecision]
