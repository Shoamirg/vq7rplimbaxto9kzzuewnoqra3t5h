"""Appointment read endpoints (Sprint 3 Phase 1).

All routes are tenant-scoped via ``get_tenant_uow`` — a request for another
tenant's appointment id returns 404 (not 403), so resource existence never
leaks across tenants.
"""
from __future__ import annotations

import uuid
from math import ceil

from fastapi import APIRouter, Body, Depends, Header, Query, status

from app.api.deps import get_tenant_uow
from app.core.idempotency import idempotency_store
from app.exceptions import AppointmentStateError
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.appointment import (
    AppointmentBookRequest,
    AppointmentCancelRequest,
    AppointmentCompleteRequest,
    AppointmentStats,
    AssignMechanicRequest,
    MoveAppointmentRequest,
)
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


# --- Booking lifecycle (write) ------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED, summary="Book an appointment")
async def book_appointment(
    body: AppointmentBookRequest,
    uow: UnitOfWork = Depends(get_tenant_uow),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    service = AppointmentService(uow)

    async def _create() -> dict:
        return await service.create_appointment(
            customer_id=body.customer_id,
            vehicle_id=body.vehicle_id,
            slot_id=body.slot_id,
            maintenance_rule_id=body.maintenance_rule_id,
            customer_notes=body.customer_notes,
        )

    if not idempotency_key:
        return await _create()

    # Namespace the key by tenant so keys can't collide across service centers.
    key = f"idem:appt:{uow.service_center_id}:{idempotency_key}"
    state, existing = await idempotency_store.reserve(key)
    if state == "done":
        return await service.get_appointment(uuid.UUID(existing))
    if state == "in_progress":
        raise AppointmentStateError("A booking with this Idempotency-Key is already in progress")
    try:
        result = await _create()
    except Exception:
        await idempotency_store.release(key)
        raise
    await idempotency_store.store(key, result["id"])
    return result


@router.patch("/{appointment_id}/confirm", summary="Confirm a pending appointment")
async def confirm_appointment(
    appointment_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await AppointmentService(uow).confirm_appointment(appointment_id)


@router.patch("/{appointment_id}/cancel", summary="Cancel an appointment (frees its slot)")
async def cancel_appointment(
    appointment_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
    body: AppointmentCancelRequest | None = Body(default=None),
) -> dict:
    reason = body.reason if body else None
    return await AppointmentService(uow).cancel_appointment(appointment_id, reason=reason)


@router.patch("/{appointment_id}/complete", summary="Complete an appointment (value chain)")
async def complete_appointment(
    appointment_id: uuid.UUID,
    body: AppointmentCompleteRequest,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await AppointmentService(uow).complete_appointment(
        appointment_id,
        odometer_km=body.odometer_km,
        total_cost=body.total_cost,
        notes=body.notes,
    )


@router.patch("/{appointment_id}/move", summary="Move appointment to another slot (drag/drop)")
async def move_appointment(
    appointment_id: uuid.UUID,
    body: MoveAppointmentRequest,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await AppointmentService(uow).move_appointment(appointment_id, body.slot_id)


@router.patch("/{appointment_id}/assign-mechanic", summary="Assign a mechanic")
async def assign_mechanic(
    appointment_id: uuid.UUID,
    body: AssignMechanicRequest,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await AppointmentService(uow).assign_mechanic(appointment_id, body.mechanic_name)
