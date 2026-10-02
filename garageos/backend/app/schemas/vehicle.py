import re
import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from datetime import datetime
from typing import Optional


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


class StaffVehicleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    customer_id: uuid.UUID
    vehicle_model_id: uuid.UUID
    year: int = Field(ge=1900)
    license_plate: str | None = Field(None, max_length=20)
    vin: str | None = Field(None, min_length=11, max_length=17)
    current_km: int = Field(default=0, ge=0)

    @field_validator("year")
    @classmethod
    def validate_year(cls, value: int) -> int:
        if value > date.today().year + 1:
            raise ValueError("Vehicle year cannot be more than one year in the future")
        return value

    @field_validator("license_plate", "vin")
    @classmethod
    def normalize_identifiers(cls, value: str | None) -> str | None:
        return re.sub(r"[\s-]", "", value).upper() if value else None

    @field_validator("vin")
    @classmethod
    def validate_vin(cls, value: str | None) -> str | None:
        if value and not re.fullmatch(r"[A-HJ-NPR-Z0-9]{11,17}", value):
            raise ValueError("VIN must contain 11 to 17 valid letters and digits")
        return value

    @field_validator("license_plate")
    @classmethod
    def validate_plate(cls, value: str | None) -> str | None:
        if value and (len(value) < 2 or not value.isalnum()):
            raise ValueError("License plate must contain letters and digits")
        return value

    @model_validator(mode="after")
    def require_identifier(self):
        if not self.license_plate and not self.vin:
            raise ValueError("Provide a license plate or VIN")
        return self


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
