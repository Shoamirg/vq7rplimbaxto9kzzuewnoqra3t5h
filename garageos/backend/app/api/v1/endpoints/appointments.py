"""Appointment read endpoints (Sprint 3 Phase 1).

All routes are tenant-scoped via ``get_tenant_uow`` — a request for another
tenant's appointment id returns 404 (not 403), so resource existence never
leaks across tenants.
"""
from __future__ import annotations

import uuid
from math import ceil

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.appointment import AppointmentStats
from app.services.appointment_service import AppointmentService

router = APIRouter()

# NB: static paths (/today, /stats) are declared before /{appointment_id} so
# they are not swallowed by the UUID path parameter.


@router.get("", summary="List appointments (paginated, optional status filter)")
async def list_appointments(
    uow: UnitOfWork = Depends(get_tenant_uow),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    service = AppointmentService(uow)
    result = await service.list_appointments(
        status=status, skip=(page - 1) * page_size, limit=page_size
    )
    total = result["total"]
    return {
        "items": result["items"],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": ceil(total / page_size) if page_size else 0,
    }


@router.get("/today", summary="Appointments scheduled for today")
async def appointments_today(uow: UnitOfWork = Depends(get_tenant_uow)) -> list[dict]:
    return await AppointmentService(uow).get_today()


@router.get("/stats", response_model=AppointmentStats, summary="Appointment counts by status")
async def appointment_stats(uow: UnitOfWork = Depends(get_tenant_uow)) -> AppointmentStats:
    stats = await AppointmentService(uow).get_stats(uow.service_center_id)
    return AppointmentStats(
        today_count=stats.get("today", 0),
        pending_count=stats.get("pending", 0),
        confirmed_count=stats.get("confirmed", 0),
        completed_count=stats.get("completed", 0),
        cancelled_count=stats.get("cancelled", 0),
    )


@router.get("/{appointment_id}", summary="Get one appointment by id")
async def get_appointment(
    appointment_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await AppointmentService(uow).get_appointment(appointment_id)
