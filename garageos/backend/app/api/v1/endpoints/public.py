"""Public, unauthenticated endpoints.

The Certified Vehicle Passport is designed to be shared — scanned from a QR on
a printed document, forwarded to a buyer, etc. So this endpoint is deliberately
public: it looks the vehicle up globally (cross-tenant) by its unguessable UUID,
then composes the passport within that vehicle's own tenant scope.

Nothing here mutates data, and only presentation-safe fields are returned.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.vehicle import Vehicle
from app.repositories.unit_of_work import UnitOfWork
from app.services.vehicle_health_service import VehicleHealthService

router = APIRouter()


@router.get("/passport/{vehicle_id}", summary="Certified Vehicle Passport (public, no auth)")
async def public_passport(
    vehicle_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Global lookup by UUID (unguessable) to resolve the owning tenant.
    result = await db.execute(
        select(Vehicle.service_center_id).where(
            Vehicle.id == vehicle_id, Vehicle.is_active.is_(True)
        )
    )
    service_center_id = result.scalar_one_or_none()
    if service_center_id is None:
        raise HTTPException(status_code=404, detail="Passport not found")

    async with UnitOfWork(service_center_id=service_center_id) as uow:
        return await VehicleHealthService(uow).get_passport(vehicle_id)
