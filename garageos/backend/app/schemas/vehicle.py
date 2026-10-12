from pydantic import BaseModel, ConfigDict, Field, model_validator
from datetime import datetime
from typing import Optional
from uuid import UUID


class StaffVehicleCreate(BaseModel):
    """Vehicle intake linked to a tenant-owned customer and catalog model."""

    model_config = ConfigDict(extra="forbid")

    customer_id: UUID
    brand_id: UUID
    vehicle_model_id: UUID
    year: int = Field(ge=1900, le=2030)
    license_plate: str | None = Field(None, max_length=20)
    vin: str | None = Field(None, min_length=11, max_length=17)
    engine_type: str | None = None
    transmission: str | None = None
    color: str | None = None
    current_km: int = Field(default=0, ge=0)
    notes: str | None = None


class VehicleCreate(BaseModel):
    customer_id: str
    brand_id: str
    vehicle_model_id: str
    year: int = Field(ge=1900, le=2030)
    license_plate: str | None = Field(None, max_length=20)
    vin: str | None = Field(None, min_length=11, max_length=17)
    engine_type: str | None = None
    transmission: str | None = None
    color: str | None = None
    current_km: int = Field(default=0, ge=0)
    notes: str | None = None


class VehicleUpdate(BaseModel):
    year: int | None = Field(None, ge=1900, le=2030)
    license_plate: str | None = Field(None, max_length=20)
    vin: str | None = Field(None, min_length=11, max_length=17)
    engine_type: str | None = None
    transmission: str | None = None
    color: str | None = None
    current_km: int | None = Field(None, ge=0)
    notes: str | None = None


class MileageUpdate(BaseModel):
    current_km: int = Field(ge=0)


class VehicleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    customer_id: str
    brand: str = ""
    model_name: str = ""
    year: int
    license_plate: str | None
    vin: str | None
    engine_type: str | None
    transmission: str | None
    color: str | None
    current_km: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def _extract_relations(cls, data) -> dict:
        if hasattr(data, "vehicle_model"):
            vm = data.vehicle_model
            data.brand = vm.brand.name if vm and hasattr(vm, "brand") else getattr(data, "brand", "")
            data.model_name = vm.name if vm else getattr(data, "model_name", "")
        return data


class VehicleListResponse(BaseModel):
    items: list[VehicleResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
