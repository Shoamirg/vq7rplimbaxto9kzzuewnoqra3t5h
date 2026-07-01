"""Vehicle Health endpoints (signature feature).

Tenant-scoped: a vehicle id from another tenant returns 404 (VehicleNotFound),
never leaking existence.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.services.vehicle_health_service import VehicleHealthService

router = APIRouter()


@router.get("", summary="List vehicles")
async def list_vehicles(
    uow: UnitOfWork = Depends(get_tenant_uow),
    limit: int = Query(default=150, ge=1, le=500),
) -> dict:
    return await VehicleHealthService(uow).list_vehicles(limit)


@router.get("/{vehicle_id}/health", summary="Full vehicle health report")
async def vehicle_health(
    vehicle_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await VehicleHealthService(uow).get_health(vehicle_id)


@router.get("/{vehicle_id}/due-services", summary="Due / overdue services")
async def vehicle_due_services(
    vehicle_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await VehicleHealthService(uow).get_due_services(vehicle_id)


@router.get("/{vehicle_id}/timeline", summary="Service + appointment timeline")
async def vehicle_timeline(
    vehicle_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await VehicleHealthService(uow).get_timeline(vehicle_id)
