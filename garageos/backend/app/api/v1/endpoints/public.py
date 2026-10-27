"""Public, unauthenticated endpoints.

The vehicle service record is designed to be shared — scanned from a QR on
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
from app.models.invoice import Invoice
from app.models.vehicle import Vehicle
from app.repositories.unit_of_work import UnitOfWork
from app.services.invoice_service import InvoiceService
from app.services.vehicle_health_service import VehicleHealthService

router = APIRouter()


@router.get("/passport/{vehicle_id}", summary="Vehicle service record (public, no auth)")
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


@router.get("/invoice/{invoice_id}", summary="Invoice / estimate (public, no auth — shareable)")
async def public_invoice(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Global lookup by unguessable UUID resolves the owning tenant. Share links
    # get forwarded, so only the printable document leaves this route — never
    # customer contact details, staff notes or payment references.
    result = await db.execute(
        select(Invoice.service_center_id).where(
            Invoice.id == invoice_id, Invoice.is_active.is_(True)
        )
    )
    service_center_id = result.scalar_one_or_none()
    if service_center_id is None:
        raise HTTPException(status_code=404, detail="Invoice not found")

    async with UnitOfWork(service_center_id=service_center_id) as uow:
        return await InvoiceService(uow).get_public_document(invoice_id)
