from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_inventory_uow
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.part import (
    InventorySummaryResponse,
    MovementResponse,
    PartCreate,
    PartResponse,
    PartUpdate,
    StockAdjustmentRequest,
)
from app.services.inventory_service import InventoryService, PartNotFound

router = APIRouter()


@router.get("/summary", response_model=InventorySummaryResponse)
async def get_inventory_summary(
    uow: UnitOfWork = Depends(get_inventory_uow),
) -> InventorySummaryResponse:
    """Get high-level inventory metrics: total stock, cost value, retail value, low stock alert."""
    service = InventoryService(uow)
    return await service.get_summary()


@router.get("/barcode/{barcode}", response_model=PartResponse)
async def get_part_by_barcode(
    barcode: str,
    uow: UnitOfWork = Depends(get_inventory_uow),
) -> PartResponse:
    """Instant lookup of a part by EAN-13/UPC barcode (camera/scanner integration)."""
    service = InventoryService(uow)
    part = await service.get_by_barcode(barcode)
    if not part:
        raise PartNotFound(part_id=uuid.uuid4())
    return service.to_response_dto(part)


@router.get("/movements", response_model=List[MovementResponse])
async def list_recent_movements(
    limit: int = Query(50, ge=1, le=100),
    uow: UnitOfWork = Depends(get_inventory_uow),
) -> List[MovementResponse]:
    """Audit log of recent stock movements (purchases, sales, adjustments, losses)."""
    service = InventoryService(uow)
    return await service.list_movements(limit=limit)


@router.get("/parts")
async def list_parts(
    search: Optional[str] = Query(None, description="Search by name, SKU, OEM number, or barcode"),
    category: Optional[str] = Query(None, description="Filter by category"),
    low_stock_only: bool = Query(False, description="Filter items at or below minimum stock level"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    uow: UnitOfWork = Depends(get_inventory_uow),
):
    """Search and paginate spare parts in warehouse."""
    service = InventoryService(uow)
    items, total = await service.search_parts(
        search=search,
        category=category,
        low_stock_only=low_stock_only,
        offset=offset,
        limit=limit,
    )
    return {
        "items": items,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.post("/parts", response_model=PartResponse, status_code=status.HTTP_201_CREATED)
async def create_part(
    payload: PartCreate,
    uow: UnitOfWork = Depends(get_inventory_uow),
) -> PartResponse:
    """Add a new spare part to warehouse inventory."""
    service = InventoryService(uow)
    part = await service.create_part(payload, created_by_user_id=uow.actor_user_id)
    return service.to_response_dto(part)


@router.get("/parts/{part_id}", response_model=PartResponse)
async def get_part(
    part_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_inventory_uow),
) -> PartResponse:
    """Get single part details."""
    service = InventoryService(uow)
    part = await service.get_part(part_id)
    return service.to_response_dto(part)


@router.patch("/parts/{part_id}", response_model=PartResponse)
async def update_part(
    part_id: uuid.UUID,
    payload: PartUpdate,
    uow: UnitOfWork = Depends(get_inventory_uow),
) -> PartResponse:
    """Update part specifications, prices, or storage location."""
    service = InventoryService(uow)
    part = await service.update_part(part_id, payload)
    return service.to_response_dto(part)


@router.delete("/parts/{part_id}", status_code=status.HTTP_200_OK)
async def delete_part(
    part_id: uuid.UUID,
    uow: UnitOfWork = Depends(get_inventory_uow),
):
    """Soft-delete a part from inventory."""
    service = InventoryService(uow)
    await service.delete_part(part_id)
    return {"success": True, "detail": "Tovar ombordan o'chirildi"}


@router.post("/parts/{part_id}/adjust", response_model=PartResponse)
async def adjust_stock(
    part_id: uuid.UUID,
    payload: StockAdjustmentRequest,
    uow: UnitOfWork = Depends(get_inventory_uow),
) -> PartResponse:
    """Adjust stock: receive new shipment, write off loss, or perform audit correction."""
    service = InventoryService(uow)
    part = await service.adjust_stock(part_id, payload, created_by_user_id=uow.actor_user_id)
    return service.to_response_dto(part)


@router.get("/parts/{part_id}/movements", response_model=List[MovementResponse])
async def get_part_movements(
    part_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    uow: UnitOfWork = Depends(get_inventory_uow),
) -> List[MovementResponse]:
    """Get stock movement history for a specific part."""
    service = InventoryService(uow)
    return await service.list_movements(part_id=part_id, limit=limit)
