"""Reports — analytics projections over the ledger + event stream + domain data."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.services.analytics import AnalyticsService

router = APIRouter()


@router.get("/{report}", summary="A report projection (executive, commercial, …) for a period")
async def get_report(
    report: str,
    uow: UnitOfWork = Depends(get_tenant_uow),
    period: str = Query(default="30d"),
    currency: str = Query(default="UZS", pattern="^[A-Z]{3}$"),
) -> dict:
    return await AnalyticsService(uow).report(report, period_key=period, currency=currency)
