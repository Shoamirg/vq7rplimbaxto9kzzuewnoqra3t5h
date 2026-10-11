"""Operations Center — case endpoints (Milestone 1)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from app.api.deps import get_current_user, get_staff_permissions, get_tenant_uow
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.services.case_service import CaseService
from app.services.conversation_service import ConversationService

router = APIRouter()


class CaseCreate(BaseModel):
    customer_id: uuid.UUID
    title: str
    case_type: str = "emergency"
    severity: str = "medium"
    description: str | None = None
    channel: str | None = None
    vehicle_id: uuid.UUID | None = None
    location_text: str | None = None
    location_lat: float | None = None
    location_lng: float | None = None


class CaseUpdate(BaseModel):
    status: str | None = None
    assigned_user_id: uuid.UUID | None = None


@router.get("", summary="List operational cases")
async def list_cases(
    uow: UnitOfWork = Depends(get_tenant_uow),
    status_group: str = Query(default="active", alias="status"),
    case_type: str | None = Query(default=None, alias="type"),
    customer_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=60, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=2147483647),
) -> dict:
    return await CaseService(uow).list_cases(
        status_group=status_group, case_type=case_type, customer_id=customer_id, q=q, limit=limit, offset=offset,
    )


@router.get("/mechanics", summary="Assignable mechanics (for dispatch)")
async def list_mechanics(uow: UnitOfWork = Depends(get_tenant_uow)) -> list:
    return await CaseService(uow).list_mechanics()


@router.get("/{case_id}", summary="Case detail (customer, vehicle, timeline)")
async def get_case(case_id: uuid.UUID, uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    return await CaseService(uow).get_case(case_id)


@router.get("/{case_id}/conversation", summary="The case's live conversation (shared UCP model)")
async def case_conversation(
    case_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
    permissions: list[str] = Depends(get_staff_permissions),
    me: User = Depends(get_current_user),
) -> dict:
    # Operations reuses the SAME conversation model as the Inbox — created on demand.
    return await ConversationService(uow).get_or_create_for_case(
        case_id, allow_create="staff.write" in permissions, user_id=me.id, observe_read=True,
    )


@router.post("", status_code=status.HTTP_201_CREATED, summary="Open a case")
async def create_case(body: CaseCreate, uow: UnitOfWork = Depends(get_tenant_uow, scope="function")) -> dict:
    return await CaseService(uow).create_case(**body.model_dump())


@router.patch("/{case_id}", summary="Update a case (assign / change status)")
async def update_case(
    case_id: uuid.UUID, body: CaseUpdate, uow: UnitOfWork = Depends(get_tenant_uow, scope="function")
) -> dict:
    svc = CaseService(uow)
    result = None
    if body.assigned_user_id is not None:
        result = await svc.assign(case_id, body.assigned_user_id)
    if body.status is not None:
        result = await svc.set_status(case_id, body.status)
    return result or await svc.get_case(case_id)
