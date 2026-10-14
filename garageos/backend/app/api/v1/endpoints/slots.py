"""Appointment-slot endpoints (Sprint 3 Phases 1-2)."""
from __future__ import annotations

from datetime import date as date_type

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.appointment import SlotGenerateRequest
from app.services.appointment_service import AppointmentService

router = APIRouter()


@router.get("", summary="Available slots for a date")
async def available_slots(
    uow: UnitOfWork = Depends(get_tenant_uow),
    date: date_type = Query(..., description="Day to list available slots for (YYYY-MM-DD)"),
) -> dict:
    slots = await AppointmentService(uow).get_available_slots(uow.service_center_id, date)
    return {"date": date.isoformat(), "slots": slots}


@router.post("/generate", status_code=status.HTTP_201_CREATED, summary="Generate slots ahead")
async def generate_slots(
    body: SlotGenerateRequest,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    return await AppointmentService(uow).generate_slots_range(
        start_date=body.start_date,
        days=body.days,
        start_hour=body.start_hour,
        end_hour=body.end_hour,
        slot_minutes=body.slot_minutes,
        mechanic_names=body.mechanic_names,
    )
