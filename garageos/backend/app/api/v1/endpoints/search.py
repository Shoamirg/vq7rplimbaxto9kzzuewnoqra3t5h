"""Global search endpoint — powers the Cmd/Ctrl+K command menu."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_tenant_uow
from app.repositories.unit_of_work import UnitOfWork
from app.services.search_service import SearchService

router = APIRouter()


@router.get("", summary="Unified global search (customers, vehicles, staff)")
async def search(
    uow: UnitOfWork = Depends(get_tenant_uow),
    q: str = Query(default=""),
) -> dict:
    return await SearchService(uow).search(q)
