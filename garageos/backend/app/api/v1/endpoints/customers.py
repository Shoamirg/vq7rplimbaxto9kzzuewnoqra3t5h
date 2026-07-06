"""Customer 360 endpoints — the command center for a single customer.

Tenant-scoped: a customer id from another tenant returns 404 (CustomerNotFound),
never leaking existence.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.deps import get_tenant_uow
from app.core.rate_limit import write_rate_limit
from app.exceptions import CustomerNotFound
from app.repositories.unit_of_work import UnitOfWork
from app.services.customer_service import CustomerService
from app.services.vehicle_service import VehicleService

router = APIRouter()


class CustomerCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=500)


class VehicleCreate(BaseModel):
    vehicle_model_id: uuid.UUID
    year: int = Field(ge=1950, le=2100)
    license_plate: str | None = Field(default=None, max_length=32)
    vin: str | None = Field(default=None, max_length=64)
    current_km: int = Field(default=0, ge=0, le=5_000_000)
    color: str | None = Field(default=None, max_length=40)
    transmission: str | None = Field(default=None, max_length=40)
    engine_type: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=500)


@router.get("", summary="List customers (value-sorted, searchable)")
async def list_customers(
    uow: UnitOfWork = Depends(get_tenant_uow),
    query: str = Query(default="", alias="q"),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    return await CustomerService(uow).list_360(query=query, limit=limit)


@router.post("", summary="Create a customer", dependencies=[Depends(write_rate_limit)])
async def create_customer(
    payload: CustomerCreate,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await CustomerService(uow).create_customer(
        service_center_id=uow.service_center_id,
        full_name=payload.full_name.strip(),
        phone=(payload.phone or "").strip() or None,
        email=(payload.email or "").strip() or None,
        address=(payload.address or "").strip() or None,
    )


@router.post(
    "/{customer_id}/vehicles",
    summary="Add a vehicle to a customer",
    dependencies=[Depends(write_rate_limit)],
)
async def add_vehicle(
    customer_id: uuid.UUID,
    payload: VehicleCreate,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    # Ownership guard: the customer must belong to this tenant (else 404).
    if await CustomerService(uow).get_customer(customer_id) is None:
        raise CustomerNotFound()
    data = {
        "service_center_id": uow.service_center_id,
        "vehicle_model_id": str(payload.vehicle_model_id),
        "year": payload.year,
        "license_plate": (payload.license_plate or "").strip() or None,
        "vin": (payload.vin or "").strip() or None,
        "current_km": payload.current_km,
        "color": (payload.color or "").strip() or None,
        "transmission": (payload.transmission or "").strip() or None,
        "engine_type": (payload.engine_type or "").strip() or None,
        "notes": (payload.notes or "").strip() or None,
    }
    return await VehicleService(uow).add_vehicle(customer_id, data)


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
