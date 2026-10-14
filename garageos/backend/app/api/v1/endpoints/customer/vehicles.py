"""Customer vehicles — cards, service records, health summaries, and timeline.

Every detail route is ownership-guarded in the service: a vehicle id belonging
to another customer returns 404, never leaking its existence.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import VehiclesResponse
from app.services.customer_portal_service import CustomerPortalService

router = APIRouter()


def _portal(customer: Customer, uow: UnitOfWork) -> CustomerPortalService:
    return CustomerPortalService(uow, customer)


@router.get("", response_model=VehiclesResponse, summary="My vehicles")
async def list_vehicles(
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> VehiclesResponse:
    return await _portal(customer, uow).vehicles()


@router.get("/{vehicle_id}/passport", summary="Vehicle service record")
async def passport(
    vehicle_id: uuid.UUID,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> dict:
    return await _portal(customer, uow).vehicle_passport(vehicle_id)


@router.get("/{vehicle_id}/health", summary="Vehicle health report")
async def health(
    vehicle_id: uuid.UUID,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> dict:
    return await _portal(customer, uow).vehicle_health(vehicle_id)


@router.get("/{vehicle_id}/timeline", summary="Service timeline")
async def timeline(
    vehicle_id: uuid.UUID,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> dict:
    return await _portal(customer, uow).vehicle_timeline(vehicle_id)
