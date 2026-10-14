"""Appointment read endpoints (Sprint 3 Phase 1).

All routes are tenant-scoped via ``get_tenant_uow`` — a request for another
tenant's appointment id returns 404 (not 403), so resource existence never
leaks across tenants.
"""
from __future__ import annotations

import uuid
from datetime import date
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
    AppointmentDirectCreateRequest,
    AppointmentStats,
    AppointmentUpdate,
    AssignMechanicRequest,
    MoveAppointmentRequest,
)
from app.services.appointment_service import AppointmentService
from app.services.invoice_service import InvoiceService

router = APIRouter()

# NB: static paths (/today, /stats) are declared before /{appointment_id} so
# they are not swallowed by the UUID path parameter.


@router.get("", summary="List appointments (paginated; status / date / overdue filters)")
async def list_appointments(
    uow: UnitOfWork = Depends(get_tenant_uow),
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    overdue: bool = Query(default=False),
    awaiting_invoice: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    service = AppointmentService(uow)
    result = await service.list_appointments(
        status=status, date_from=date_from, date_to=date_to, overdue=overdue,
        awaiting_invoice=awaiting_invoice,
        q=q,
        skip=(page - 1) * page_size, limit=page_size,
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


@router.get("/{appointment_id}/invoice", summary="Get the final invoice linked to an appointment")
async def get_appointment_invoice(
    appointment_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await InvoiceService(uow).get_for_appointment(appointment_id)


# --- Booking lifecycle (write) ------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED, summary="Book an appointment")
async def book_appointment(
    body: AppointmentBookRequest,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
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
        # Publish a replayable ID only after the whole booking is durable.
        # A commit failure must release the pending key just like creation
        # failure, so retry cannot point at a rolled-back appointment.
        await uow.commit()
    except Exception:
        await idempotency_store.release(key)
        raise
    await idempotency_store.store(key, result["id"])
    return result


@router.post("/direct", status_code=status.HTTP_201_CREATED, summary="Create an appointment at a date/time (no slot)")
async def create_appointment_direct(
    body: AppointmentDirectCreateRequest,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    return await AppointmentService(uow).create_appointment_direct(
        customer_id=body.customer_id,
        vehicle_id=body.vehicle_id,
        appointment_date=body.appointment_date,
        appointment_time=body.appointment_time,
        estimated_duration_minutes=body.estimated_duration_minutes,
        mechanic_name=body.mechanic_name,
        mechanic_user_id=body.mechanic_user_id,
        maintenance_rule_id=body.maintenance_rule_id,
        customer_notes=body.customer_notes,
    )


@router.patch("/{appointment_id}/confirm", summary="Confirm a pending appointment")
async def confirm_appointment(
    appointment_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    return await AppointmentService(uow).confirm_appointment(appointment_id)


@router.patch("/{appointment_id}/start", summary="Start assigned service work")
async def start_appointment(
    appointment_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    return await AppointmentService(uow).start_appointment(appointment_id)


@router.patch("/{appointment_id}/cancel", summary="Cancel an appointment (frees its slot)")
async def cancel_appointment(
    appointment_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    body: AppointmentCancelRequest | None = Body(default=None),
) -> dict:
    reason = body.reason if body else None
    return await AppointmentService(uow).cancel_appointment(appointment_id, reason=reason)


@router.patch("/{appointment_id}/complete", summary="Complete an appointment (value chain)")
async def complete_appointment(
    appointment_id: uuid.UUID,
    body: AppointmentCompleteRequest,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    return await AppointmentService(uow).complete_appointment(
        appointment_id,
        odometer_km=body.odometer_km,
        total_cost=body.total_cost,
        notes=body.notes,
        service_type=body.service_type,
    )


@router.patch("/{appointment_id}", summary="Update an appointment (drag-move / resize)")
async def update_appointment(
    appointment_id: uuid.UUID,
    body: AppointmentUpdate,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    return await AppointmentService(uow).update_appointment(
        appointment_id,
        appointment_date=body.appointment_date,
        appointment_time=body.appointment_time,
        mechanic_name=body.mechanic_name,
        mechanic_user_id=body.mechanic_user_id,
        estimated_duration_minutes=body.estimated_duration_minutes,
        notes=body.notes,
    )


@router.patch("/{appointment_id}/move", summary="Move appointment to another slot (drag/drop)")
async def move_appointment(
    appointment_id: uuid.UUID,
    body: MoveAppointmentRequest,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    return await AppointmentService(uow).move_appointment(appointment_id, body.slot_id)


@router.patch("/{appointment_id}/assign-mechanic", summary="Assign a mechanic")
async def assign_mechanic(
    appointment_id: uuid.UUID,
    body: AssignMechanicRequest,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    return await AppointmentService(uow).assign_mechanic(
        appointment_id, body.mechanic_name, mechanic_user_id=body.mechanic_user_id,
    )
