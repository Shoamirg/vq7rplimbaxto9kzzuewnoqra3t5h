from pydantic import BaseModel, ConfigDict, Field, model_validator
from datetime import datetime, date
from typing import Optional
from uuid import UUID


class AppointmentCreate(BaseModel):
    customer_id: str
    vehicle_id: str
    maintenance_rule_id: str | None = None
    appointment_date: datetime
    appointment_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")  # HH:MM format
    estimated_duration_minutes: int = Field(default=60, ge=15, le=480)
    customer_notes: str | None = None
    service_type: str | None = None


class AppointmentUpdate(BaseModel):
    appointment_date: datetime | None = None
    appointment_time: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    estimated_duration_minutes: int | None = Field(None, ge=15, le=480)
    mechanic_name: str | None = None
    status: str | None = None
    notes: str | None = None
    total_cost: float | None = Field(None, ge=0)


class AppointmentStatusUpdate(BaseModel):
    status: str = Field(pattern=r"^(pending|confirmed|in_progress|completed|cancelled|rescheduled)$")
    notes: str | None = None


class AppointmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    customer_id: str
    customer_name: str = ""
    vehicle_id: str
    vehicle_summary: str = ""
    maintenance_rule_id: str | None
    service_type: str | None
    appointment_date: datetime
    appointment_time: str
    estimated_duration_minutes: int
    mechanic_name: str | None
    status: str
    notes: str | None
    customer_notes: str | None
    total_cost: float | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def _extract_relations(cls, data) -> dict:
        if hasattr(data, "customer"):
            data.customer_name = data.customer.full_name if data.customer else getattr(data, "customer_name", "")
        if hasattr(data, "vehicle"):
            vm = getattr(data.vehicle, "vehicle_model", None)
            if vm:
                brand_name = vm.brand.name if hasattr(vm, "brand") and vm.brand else ""
                data.vehicle_summary = f"{brand_name} {vm.name} ({data.vehicle.license_plate or 'no plate'})"
        return data


class AppointmentListResponse(BaseModel):
    items: list[AppointmentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class TimeSlot(BaseModel):
    time: str  # HH:MM
    available: bool
    mechanic: str | None = None


class AvailableSlotsResponse(BaseModel):
    date: date
    slots: list[TimeSlot]


class AppointmentStats(BaseModel):
    today_count: int
    pending_count: int
    confirmed_count: int
    completed_count: int
    cancelled_count: int


# --- Booking lifecycle request bodies (Sprint 3 Phase 2) --------------------

class AppointmentBookRequest(BaseModel):
    """Book an appointment against a pre-generated available slot."""
    customer_id: UUID
    vehicle_id: UUID
    slot_id: UUID
    maintenance_rule_id: UUID | None = None
    customer_notes: str | None = None


class AppointmentDirectCreateRequest(BaseModel):
    """Create an appointment directly at a date/time (no pre-generated slot).

    This is the practical path for staff manually booking from the calendar: pick
    a customer, vehicle, date/time, duration, and (optionally) a mechanic.
    """
    customer_id: UUID
    vehicle_id: UUID
    appointment_date: date
    appointment_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    estimated_duration_minutes: int = Field(default=60, ge=15, le=480)
    mechanic_name: str | None = None
    maintenance_rule_id: UUID | None = None
    customer_notes: str | None = None


class AppointmentCancelRequest(BaseModel):
    reason: str | None = None


class AppointmentCompleteRequest(BaseModel):
    odometer_km: int | None = Field(default=None, ge=0)
    total_cost: float | None = Field(default=None, ge=0)
    notes: str | None = None


class SlotGenerateRequest(BaseModel):
    start_date: date
    days: int = Field(default=30, ge=1, le=120)
    start_hour: int = Field(default=9, ge=0, le=23)
    end_hour: int = Field(default=18, ge=1, le=24)
    slot_minutes: int = Field(default=30, ge=15, le=240)
    mechanic_names: list[str] | None = None


class MoveAppointmentRequest(BaseModel):
    slot_id: UUID


class AssignMechanicRequest(BaseModel):
    mechanic_name: str = Field(min_length=1, max_length=255)
