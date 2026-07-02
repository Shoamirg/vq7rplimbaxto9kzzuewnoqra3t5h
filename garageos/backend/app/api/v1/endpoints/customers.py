"""Customer 360 endpoints — the command center for a single customer.

Tenant-scoped: a customer id from another tenant returns 404 (CustomerNotFound),
never leaking existence.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.services.customer_service import CustomerService

router = APIRouter()


@router.get("", summary="List customers (value-sorted, searchable)")
async def list_customers(
    uow: UnitOfWork = Depends(get_tenant_uow),
    query: str = Query(default="", alias="q"),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    return await CustomerService(uow).list_360(query=query, limit=limit)


@router.get("/{customer_id}", summary="Customer 360 (profile, vehicles, timeline, AI summary)")
async def customer_360(
    customer_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await CustomerService(uow).get_360(customer_id)
