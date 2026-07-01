"""Fleet-level health aggregate (dashboard Fleet Health widget)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.services.vehicle_health_service import VehicleHealthService

router = APIRouter()


@router.get("/health", summary="Fleet health aggregate")
async def fleet_health(
    uow: UnitOfWork = Depends(get_tenant_uow),
    limit: int = Query(default=150, ge=1, le=500),
) -> dict:
    return await VehicleHealthService(uow).fleet_health(limit=limit)
