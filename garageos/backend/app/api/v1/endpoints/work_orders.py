"""Staff work-order endpoints."""
from __future__ import annotations

from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, Header, Query, status

from app.api.deps import get_current_user, get_tenant_uow
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.work_order import (
    WorkOrderCreateRequest,
    WorkOrderListResponse,
    WorkOrderResponse,
    WorkOrderStatusValue,
)
from app.services.work_order_service import WorkOrderService


router = APIRouter()


@router.get("", response_model=WorkOrderListResponse, summary="List work orders")
async def list_work_orders(
    uow: UnitOfWork = Depends(get_tenant_uow),
    actor: User = Depends(get_current_user),
    status_filter: WorkOrderStatusValue | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    return await WorkOrderService(uow, actor).list_work_orders(
        page=page, page_size=page_size, status=status_filter,
    )


@router.get("/{work_order_id}", response_model=WorkOrderResponse, summary="Get one work order")
async def get_work_order(
    work_order_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
    actor: User = Depends(get_current_user),
) -> dict:
    return await WorkOrderService(uow, actor).get_work_order(work_order_id)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a work order")
async def create_work_order(
    body: WorkOrderCreateRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=255)],
    uow: UnitOfWork = Depends(get_tenant_uow),
    actor: User = Depends(get_current_user),
) -> dict:
    return await WorkOrderService(uow, actor).create_work_order(body, idempotency_key)
