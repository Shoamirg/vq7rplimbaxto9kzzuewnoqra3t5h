"""Mechanic Workspace API — a mechanic's own jobs.

Every route is implicitly scoped to the authenticated user: you only ever see
and act on jobs assigned to *you* (Appointment.mechanic_user_id). Advisors/admins
hitting these see an empty queue, which is correct — this is the mechanic's app.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, get_mechanic_uow
from app.core.rate_limit import write_rate_limit
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.services.workshop_service import WorkshopService

router = APIRouter()


class FinishJob(BaseModel):
    odometer_km: int | None = Field(default=None, ge=0, le=5_000_000)


def _svc(user: User, uow: UnitOfWork) -> WorkshopService:
    return WorkshopService(uow, user.id)


@router.get("/jobs", summary="My jobs (today + upcoming)")
async def my_jobs(
    user: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_mechanic_uow),
) -> dict:
    return await _svc(user, uow).my_jobs()


@router.get("/jobs/{job_id}", summary="One of my jobs, in detail")
async def job_detail(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_mechanic_uow),
) -> dict:
    return await _svc(user, uow).job_detail(job_id)


@router.post(
    "/jobs/{job_id}/start",
    summary="Start work (→ in progress)",
    dependencies=[Depends(write_rate_limit)],
)
async def start_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_mechanic_uow, scope="function"),
) -> dict:
    return await _svc(user, uow).start(job_id)


@router.post(
    "/jobs/{job_id}/finish",
    summary="Finish the job (→ completed; creates the service record)",
    dependencies=[Depends(write_rate_limit)],
)
async def finish_job(
    job_id: uuid.UUID,
    payload: FinishJob | None = None,
    user: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_mechanic_uow, scope="function"),
) -> dict:
    return await _svc(user, uow).finish(
        job_id, odometer_km=payload.odometer_km if payload else None
    )
