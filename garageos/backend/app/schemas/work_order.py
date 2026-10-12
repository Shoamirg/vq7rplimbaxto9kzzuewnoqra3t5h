"""Request and response models for the staff work-order API."""
from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


WorkOrderStatusValue = Literal["received", "in_progress", "ready", "completed", "cancelled"]


class WorkOrderCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_id: UUID
    vehicle_id: UUID
    service_type: str = Field(min_length=1, max_length=100)
    appointment_id: UUID | None = None
    assigned_mechanic_user_id: UUID | None = None
    customer_concern: str | None = Field(default=None, max_length=5000)
    intake_odometer_km: int | None = Field(default=None, ge=0)

    @field_validator("service_type")
    @classmethod
    def strip_service_type(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Service type cannot be blank")
        return value


class WorkOrderUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assigned_mechanic_user_id: UUID | None = None
    customer_concern: str | None = Field(default=None, max_length=5000)
    work_performed: str | None = Field(default=None, max_length=10000)
    completion_odometer_km: int | None = Field(default=None, ge=0)
    actual_cost: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    status: WorkOrderStatusValue | None = None

    @model_validator(mode="after")
    def require_at_least_one_change(self) -> "WorkOrderUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("At least one work-order field must be supplied")
        return self


class WorkOrderResponse(BaseModel):
    """PII-minimal response shared by staff; customer phone/address are omitted."""
    id: UUID
    customer_id: UUID
    customer_name: str
    vehicle_id: UUID
    vehicle_summary: str
    appointment_id: UUID | None
    assigned_mechanic_user_id: UUID | None
    assigned_mechanic_name: str | None
    created_by_user_id: UUID
    service_type: str
    customer_concern: str | None
    work_performed: str | None
    status: WorkOrderStatusValue
    intake_odometer_km: int | None
    completion_odometer_km: int | None
    actual_cost: Decimal | None
    service_record_id: UUID | None
    received_at: datetime
    started_at: datetime | None
    ready_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime


class WorkOrderListResponse(BaseModel):
    items: list[WorkOrderResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
