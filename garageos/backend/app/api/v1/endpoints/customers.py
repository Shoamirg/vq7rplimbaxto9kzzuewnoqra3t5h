"""Customer 360 endpoints — the command center for a single customer.

Tenant-scoped: a customer id from another tenant returns 404 (CustomerNotFound),
never leaking existence.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_office_write_user, get_tenant_uow
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer import StaffCustomerCreate
from app.services.customer_service import CustomerService

router = APIRouter()


@router.post("", status_code=201, summary="Create a customer from staff intake")
async def create_customer(
    body: StaffCustomerCreate,
    uow: UnitOfWork = Depends(get_tenant_uow),
    actor: User = Depends(get_office_write_user),
) -> dict:
    del actor  # authorization is enforced by the dependency
    return await CustomerService(uow).create_customer(
        service_center_id=uow.service_center_id,
        **body.model_dump(),
    )


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


@router.delete("/{customer_id}", summary="Delete (archive) a customer")
async def delete_customer(
    customer_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    await CustomerService(uow).delete_customer(customer_id)
    return {"ok": True}
