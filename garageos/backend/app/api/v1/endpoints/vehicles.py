"""Vehicle Health endpoints (signature feature).

Tenant-scoped: a vehicle id from another tenant returns 404 (VehicleNotFound),
never leaking existence.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_office_write_user, get_tenant_uow
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.vehicle import StaffVehicleCreate
from app.services.vehicle_service import VehicleService
from app.services.vehicle_health_service import VehicleHealthService
from app.services.vehicle_intelligence_service import VehicleIntelligenceService

router = APIRouter()


@router.get("/catalog", summary="Active vehicle makes and models for staff intake")
async def vehicle_catalog(
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> list[dict]:
    return await VehicleService(uow).list_catalog()


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a vehicle from staff intake")
async def create_vehicle(
    body: StaffVehicleCreate,
    uow: UnitOfWork = Depends(get_tenant_uow),
    actor: User = Depends(get_office_write_user),
) -> dict:
    del actor  # authorization is enforced by the dependency
    return await VehicleService(uow).add_vehicle(
        body.customer_id,
        {
            **body.model_dump(exclude={"customer_id", "brand_id"}),
            "brand_id": body.brand_id,
            "service_center_id": uow.service_center_id,
        },
    )


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


@router.get("/{vehicle_id}/intelligence", summary="Vehicle Intelligence Center (composed)")
async def vehicle_intelligence(
    vehicle_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    return await VehicleIntelligenceService(uow).get(vehicle_id)


@router.delete("/{vehicle_id}", summary="Delete (archive) a vehicle")
async def delete_vehicle(
    vehicle_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_tenant_uow),
) -> dict:
    await VehicleHealthService(uow).delete_vehicle(vehicle_id)
    return {"ok": True}
