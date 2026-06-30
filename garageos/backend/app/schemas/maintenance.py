from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional


class MaintenanceRuleCreate(BaseModel):
    brand_id: str
    vehicle_model_id: str | None = None
    service_type: str = Field(min_length=1, max_length=100)
    description: str | None = None
    interval_km: int | None = Field(None, ge=0)
    interval_months: int | None = Field(None, ge=0)
    estimated_duration_minutes: int | None = Field(None, ge=1)
    estimated_cost: float | None = Field(None, ge=0)
    is_required: bool = True
    sort_order: int = 0


class MaintenanceRuleUpdate(BaseModel):
    service_type: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    interval_km: int | None = Field(None, ge=0)
    interval_months: int | None = Field(None, ge=0)
    estimated_duration_minutes: int | None = Field(None, ge=1)
    estimated_cost: float | None = Field(None, ge=0)
    is_required: bool | None = None
    sort_order: int | None = None


class MaintenanceRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    brand: str
    vehicle_model: str | None
    service_type: str
    description: str | None
    interval_km: int | None
    interval_months: int | None
    estimated_duration_minutes: int | None
    estimated_cost: float | None
    is_required: bool
    sort_order: int
    is_active: bool


class DueServiceItem(BaseModel):
    service_type: str
    description: str | None
    interval_km: int | None
    interval_months: int | None
    current_km: int
    km_remaining: int | None = None
    days_remaining: int | None = None
    is_due: bool
    estimated_cost: float | None = None


class VehicleHealthScore(BaseModel):
    vehicle_id: str
    overall_score: float
    items: list[DueServiceItem]


class MaintenanceRuleListResponse(BaseModel):
    items: list[MaintenanceRuleResponse]
    total: int
