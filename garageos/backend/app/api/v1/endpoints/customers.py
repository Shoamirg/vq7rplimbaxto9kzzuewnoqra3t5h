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
from app.schemas.customer import StaffCustomerCreate

router = APIRouter()


@router.get("", summary="Search and paginate customers")
async def list_customers(
    uow: UnitOfWork = Depends(get_tenant_uow),
    query: str = Query(default="", alias="q"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return await CustomerService(uow).list_360(query=query, limit=limit, offset=offset)


@router.post("", status_code=201, summary="Register a customer in the current service center")
async def create_customer(data: StaffCustomerCreate, uow: UnitOfWork = Depends(get_tenant_uow, scope="function")) -> dict:
    return await CustomerService(uow).register_customer(data)


@router.get("/{customer_id}", summary="Customer 360 (profile, vehicles, timeline, AI summary)")
async def customer_360(
    customer_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await CustomerService(uow).get_360(customer_id)


@router.delete("/{customer_id}", summary="Delete (archive) a customer")
async def delete_customer(
    customer_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    await CustomerService(uow).delete_customer(customer_id)
    return {"ok": True}

from app.api.v1.endpoints.staff import owner_uow
from app.api.deps import get_current_user
from app.schemas.customer_account import CustomerAccountCreate, CustomerAccountUpdate
from app.services.customer_account_service import CustomerAccountService

@router.get('/{customer_id}/account')
async def customer_account(customer_id: uuid.UUID, uow=Depends(owner_uow), actor=Depends(get_current_user)):
    return CustomerAccountService.summary(await CustomerAccountService(uow, actor).account(customer_id))

@router.post('/{customer_id}/account', status_code=201)
async def open_customer_account(customer_id: uuid.UUID, data: CustomerAccountCreate, uow=Depends(owner_uow, scope="function"), actor=Depends(get_current_user)):
    return await CustomerAccountService(uow, actor).create(customer_id, data)

@router.patch('/{customer_id}/account')
async def customer_account_access(customer_id: uuid.UUID, data: CustomerAccountUpdate, uow=Depends(owner_uow, scope="function"), actor=Depends(get_current_user)):
    return await CustomerAccountService(uow, actor).update(customer_id, data)
