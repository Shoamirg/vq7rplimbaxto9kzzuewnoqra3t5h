"""Calendar aggregation endpoint (Sprint 3 Phase A).

Purpose-built for the Calendar UI: one request returns mechanics (lanes), slots,
appointments, and blocked slots for a date range — no client-side stitching.
"""
from __future__ import annotations

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.services.appointment_service import AppointmentService

router = APIRouter()

_MAX_RANGE_DAYS = 90


@router.get("", summary="Aggregated calendar payload for a date range")
async def calendar(
    uow: UnitOfWork = Depends(get_tenant_uow),
    start: date_type = Query(..., description="Range start (inclusive, YYYY-MM-DD)"),
    end: date_type = Query(..., description="Range end (exclusive, YYYY-MM-DD)"),
    include_cancelled: bool = Query(False, description="Include active cancelled appointments for inspection"),
) -> dict:
    if end <= start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "end must be after start")
    if (end - start).days > _MAX_RANGE_DAYS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"range may not exceed {_MAX_RANGE_DAYS} days"
        )
    return await AppointmentService(uow).get_calendar(start, end, include_cancelled=include_cancelled)
