"""Staff work-order endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, status

from app.api.deps import get_current_user, get_tenant_uow
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.work_order import WorkOrderCreateRequest
from app.services.work_order_service import WorkOrderService


router = APIRouter()


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a work order")
async def create_work_order(
    body: WorkOrderCreateRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=255)],
    uow: UnitOfWork = Depends(get_tenant_uow),
    actor: User = Depends(get_current_user),
) -> dict:
    return await WorkOrderService(uow, actor).create_work_order(body, idempotency_key)
