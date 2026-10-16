"""A mechanic's assigned jobs; financial and administrative data stay private."""
import uuid
from math import ceil

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user, get_mechanic_uow
from app.exceptions import AppointmentNotFound
from app.models import User
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.unit_of_work import UnitOfWork
from app.services.appointment_service import AppointmentService, serialize_appointment
from app.schemas.appointment import MechanicCompleteRequest

router = APIRouter()


def work_summary(appointment, timezone_name="UTC"):
    result = serialize_appointment(appointment, timezone_name)
    result.pop("total_cost", None)
    return result


@router.get("")
async def list_work(
    page: int = Query(default=1, ge=1, le=2147483647),
    page_size: int = Query(default=30, ge=1, le=100),
    q: str | None = Query(default=None, max_length=100),
    status: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    uow: UnitOfWork = Depends(get_mechanic_uow),
) -> dict:
    rows, total = await AppointmentRepository(uow.session, uow.service_center_id).list_detailed(
        mechanic_user_id=user.id, status=status, q=q,
        skip=(page - 1) * page_size, limit=page_size,
    )
    zone_name = await AppointmentService(uow).timezone_name()
    return {"items": [work_summary(row, zone_name) for row in rows], "total": total,
            "page": page, "page_size": page_size, "total_pages": ceil(total / page_size)}


@router.get("/{appointment_id}")
async def get_work(appointment_id: uuid.UUID, user: User = Depends(get_current_user),
                   uow: UnitOfWork = Depends(get_mechanic_uow)) -> dict:
    row = await AppointmentRepository(uow.session, uow.service_center_id).get_detailed(appointment_id)
    if not row or row.mechanic_user_id != user.id:
        raise AppointmentNotFound()
    return work_summary(row, await AppointmentService(uow).timezone_name())


@router.patch("/{appointment_id}/start")
async def start_work(appointment_id: uuid.UUID, user: User = Depends(get_current_user),
                     uow: UnitOfWork = Depends(get_mechanic_uow, scope="function")) -> dict:
    result = await AppointmentService(uow).start_appointment(appointment_id, mechanic_user_id=user.id)
    result.pop("total_cost", None)
    return result


@router.patch("/{appointment_id}/complete")
async def complete_work(appointment_id: uuid.UUID, body: MechanicCompleteRequest,
                        user: User = Depends(get_current_user),
                        uow: UnitOfWork = Depends(get_mechanic_uow, scope="function")) -> dict:
    result = await AppointmentService(uow).complete_appointment(
        appointment_id, mechanic_user_id=user.id, **body.model_dump(),
    )
    result.pop("total_cost", None)
    return result
