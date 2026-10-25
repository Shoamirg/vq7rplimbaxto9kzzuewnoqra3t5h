"""Reference data for forms — brands and their models.

Global, read-only lookup used by the Add-Vehicle form's brand→model picker.
Tenant-scoped dep only for auth; the data itself is shared across tenants.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import get_tenant_uow
from app.models import Brand
from app.repositories.unit_of_work import UnitOfWork

router = APIRouter()


@router.get("/vehicle-models", summary="Brands and their models (for vehicle forms)")
async def vehicle_models(uow: UnitOfWork = Depends(get_tenant_uow)) -> list:
    brands = (
        await uow.session.execute(
            select(Brand).where(Brand.is_active.is_(True)).order_by(Brand.name)
        )
    ).scalars().all()
    out: list[dict] = []
    for b in brands:
        models = sorted((m for m in b.vehicle_models if m.is_active), key=lambda m: m.name)
        if models:
            out.append(
                {
                    "id": str(b.id),
                    "name": b.name,
                    "models": [{"id": str(m.id), "name": m.name} for m in models],
                }
            )
    return out
