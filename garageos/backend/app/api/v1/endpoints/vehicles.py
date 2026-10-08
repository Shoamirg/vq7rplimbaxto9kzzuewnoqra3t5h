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
from app.services.vehicle_intelligence_service import VehicleIntelligenceService
from app.services.vehicle_service import VehicleService
from app.schemas.vehicle import StaffVehicleCreate

router = APIRouter()


@router.get("", summary="List vehicles")
async def list_vehicles(
    uow: UnitOfWork = Depends(get_tenant_uow),
    limit: int = Query(default=150, ge=1, le=500),
    query: str = Query(default="", alias="q"),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return await VehicleHealthService(uow).list_vehicles(limit, query=query, offset=offset)


@router.post("", status_code=201, summary="Register an owned vehicle in the current service center")
async def create_vehicle(data: StaffVehicleCreate, uow: UnitOfWork = Depends(get_tenant_uow, scope="function")) -> dict:
    return await VehicleService(uow).register_vehicle(data)


@router.get("/catalog", summary="Active brands and models for vehicle intake")
async def vehicle_catalog(uow: UnitOfWork = Depends(get_tenant_uow)) -> dict:
    return await VehicleService(uow).catalog()


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


@router.get("/{vehicle_id}/intelligence", summary="Vehicle Intelligence Center (composed)")
async def vehicle_intelligence(
    vehicle_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await VehicleIntelligenceService(uow).get(vehicle_id)


@router.delete("/{vehicle_id}", summary="Delete (archive) a vehicle")
async def delete_vehicle(
    vehicle_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow, scope="function"),
) -> dict:
    await VehicleHealthService(uow).delete_vehicle(vehicle_id)
    return {"ok": True}
