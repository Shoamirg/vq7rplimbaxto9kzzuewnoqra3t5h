"""Appointment-slot read endpoints (Sprint 3 Phase 1)."""
from __future__ import annotations

from datetime import date as date_type

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.services.appointment_service import AppointmentService

router = APIRouter()


@router.get("", summary="Available slots for a date")
async def available_slots(
    uow: UnitOfWork = Depends(get_tenant_uow),
    date: date_type = Query(..., description="Day to list available slots for (YYYY-MM-DD)"),
) -> dict:
    slots = await AppointmentService(uow).get_available_slots(uow.service_center_id, date)
    return {"date": date.isoformat(), "slots": slots}
