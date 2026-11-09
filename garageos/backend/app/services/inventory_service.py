from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import List, Optional, Sequence, Tuple

from app.exceptions import NotFoundError, ConflictError, ValidationError
from app.models.part import PartItem, InventoryMovement, MovementType
from app.repositories.part_repository import PartRepository
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.part import (
    PartCreate,
    PartUpdate,
    PartResponse,
    StockAdjustmentRequest,
    InventorySummaryResponse,
    MovementResponse,
)

logger = logging.getLogger(__name__)


class PartNotFound(NotFoundError):
    def __init__(self, part_id: uuid.UUID):
        super().__init__()
        self.detail = f"Ehtiyot qism topilmadi: {part_id}"


class SkuAlreadyExists(ConflictError):
    def __init__(self, sku: str):
        super().__init__()
        self.detail = f"Bunday SKU artikulli tovar allaqachon mavjud: {sku}"


class InventoryService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.repo = PartRepository(uow.session, uow.service_center_id)

    async def create_part(
        self,
        payload: PartCreate,
        created_by_user_id: Optional[uuid.UUID] = None,
    ) -> PartItem:
        """Create a new spare part/inventory item with optional initial stock."""
        # 1. Validate SKU uniqueness within the service center
        existing = await self.repo.get_by_sku(payload.sku.strip())
        if existing:
            raise SkuAlreadyExists(payload.sku.strip())

        part = PartItem(
            service_center_id=self.uow.service_center_id,
            name=payload.name.strip(),
            sku=payload.sku.strip(),
            oem_number=payload.oem_number.strip() if payload.oem_number else None,
            barcode=payload.barcode.strip() if payload.barcode else None,
            category=payload.category,
            unit=payload.unit,
            cost_price=payload.cost_price,
            retail_price=payload.retail_price,
            quantity_in_stock=payload.quantity_in_stock,
            min_stock_level=payload.min_stock_level,
            location=payload.location.strip() if payload.location else None,
            supplier_name=payload.supplier_name.strip() if payload.supplier_name else None,
            supplier_phone=payload.supplier_phone.strip() if payload.supplier_phone else None,
            notes=payload.notes,
        )
        self.uow.session.add(part)
        await self.uow.session.flush()

        # 2. If initial stock > 0, log an initial purchase movement
        if payload.quantity_in_stock > 0:
            movement = InventoryMovement(
                service_center_id=self.uow.service_center_id,
                part_id=part.id,
                movement_type=MovementType.PURCHASE,
                quantity=payload.quantity_in_stock,
                unit_cost=payload.cost_price,
                created_by_user_id=created_by_user_id,
                notes="Boshlang'ich qoldiq kiritildi",
            )
            self.uow.session.add(movement)
            await self.uow.session.flush()

        return part

    async def update_part(self, part_id: uuid.UUID, payload: PartUpdate) -> PartItem:
        """Update part details, prices, or locations."""
        part = await self.repo.get_by_id(part_id)
        if not part:
            raise PartNotFound(part_id)

        if payload.sku is not None and payload.sku.strip() != part.sku:
            existing = await self.repo.get_by_sku(payload.sku.strip())
            if existing and existing.id != part.id:
                raise SkuAlreadyExists(payload.sku.strip())
            part.sku = payload.sku.strip()

        if payload.name is not None:
            part.name = payload.name.strip()
        if payload.oem_number is not None:
            part.oem_number = payload.oem_number.strip() if payload.oem_number else None
        if payload.barcode is not None:
            part.barcode = payload.barcode.strip() if payload.barcode else None
        if payload.category is not None:
            part.category = payload.category
        if payload.unit is not None:
            part.unit = payload.unit
        if payload.cost_price is not None:
            part.cost_price = payload.cost_price
        if payload.retail_price is not None:
            part.retail_price = payload.retail_price
        if payload.quantity_in_stock is not None:
            part.quantity_in_stock = payload.quantity_in_stock
        if payload.min_stock_level is not None:
            part.min_stock_level = payload.min_stock_level
        if payload.location is not None:
            part.location = payload.location.strip() if payload.location else None
        if payload.supplier_name is not None:
            part.supplier_name = payload.supplier_name.strip() if payload.supplier_name else None
        if payload.supplier_phone is not None:
            part.supplier_phone = payload.supplier_phone.strip() if payload.supplier_phone else None
        if payload.notes is not None:
            part.notes = payload.notes
        if payload.is_active is not None:
            part.is_active = payload.is_active

        await self.uow.session.flush()
        return part

    async def delete_part(self, part_id: uuid.UUID) -> bool:
        """Soft-delete an inventory item."""
        part = await self.repo.get_by_id(part_id)
        if not part:
            raise PartNotFound(part_id)
        part.is_active = False
        await self.uow.session.flush()
        return True

    async def get_part(self, part_id: uuid.UUID) -> PartItem:
        """Fetch single part by id."""
        part = await self.repo.get_by_id(part_id)
        if not part:
            raise PartNotFound(part_id)
        return part

    async def get_by_barcode(self, barcode: str) -> Optional[PartItem]:
        """Lookup by barcode for instant camera/scanner discovery."""
        return await self.repo.get_by_barcode(barcode.strip())

    async def adjust_stock(
        self,
        part_id: uuid.UUID,
        payload: StockAdjustmentRequest,
        created_by_user_id: Optional[uuid.UUID] = None,
    ) -> PartItem:
        """Adjust stock quantity via purchase, return, adjustment, or loss."""
        part = await self.get_part(part_id)

        # Quantity change logic:
        # purchase, return: increases stock
        # sale, loss: decreases stock
        # adjustment: can be positive or negative
        delta = payload.quantity
        if payload.movement_type in (MovementType.SALE, MovementType.LOSS) and delta > 0:
            delta = -delta

        new_stock = part.quantity_in_stock + delta
        if new_stock < 0:
            raise ValidationError(
                detail=f"Omborda yetarli qoldiq yo'q. Mavjud: {part.quantity_in_stock}, talab qilingan: {abs(delta)}"
            )

        part.quantity_in_stock = new_stock

        unit_cost = payload.unit_cost if payload.unit_cost is not None else part.cost_price
        if payload.movement_type == MovementType.PURCHASE and payload.unit_cost is not None:
            part.cost_price = payload.unit_cost

        movement = InventoryMovement(
            service_center_id=self.uow.service_center_id,
            part_id=part.id,
            movement_type=payload.movement_type,
            quantity=delta,
            unit_cost=unit_cost,
            reference_invoice_id=payload.reference_invoice_id,
            reference_appointment_id=payload.reference_appointment_id,
            created_by_user_id=created_by_user_id,
            notes=payload.notes,
        )
        self.uow.session.add(movement)
        await self.uow.session.flush()
        return part

    async def deduct_for_invoice_items(
        self,
        invoice_id: uuid.UUID,
        line_items: list,
        created_by_user_id: Optional[uuid.UUID] = None,
    ) -> None:
        """Automatically deduct stock when invoice items reference catalog parts."""
        for item in line_items:
            part_id = getattr(item, "part_id", None)
            if not part_id:
                continue

            part = await self.repo.get_by_id(part_id)
            if not part:
                continue

            qty = Decimal(str(getattr(item, "quantity", 1)))
            part.quantity_in_stock = max(Decimal("0"), part.quantity_in_stock - qty)

            movement = InventoryMovement(
                service_center_id=self.uow.service_center_id,
                part_id=part.id,
                movement_type=MovementType.SALE,
                quantity=-qty,
                unit_cost=part.cost_price,
                reference_invoice_id=invoice_id,
                created_by_user_id=created_by_user_id,
                notes=f"Invoys #{invoice_id} bo'yicha hisobdan chiqarildi",
            )
            self.uow.session.add(movement)

        await self.uow.session.flush()

    async def search_parts(
        self,
        *,
        search: Optional[str] = None,
        category: Optional[str] = None,
        low_stock_only: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> Tuple[List[PartResponse], int]:
        """Search parts with pagination and serialized DTOs."""
        parts, total = await self.repo.search_parts(
            search=search,
            category=category,
            low_stock_only=low_stock_only,
            offset=offset,
            limit=limit,
        )
        return [self.to_response_dto(p) for p in parts], total

    async def list_movements(
        self,
        *,
        part_id: Optional[uuid.UUID] = None,
        limit: int = 50,
    ) -> List[MovementResponse]:
        """List movements for audit trail."""
        movements = await self.repo.list_movements(part_id=part_id, limit=limit)
        return [MovementResponse.model_validate(m) for m in movements]

    async def get_summary(self) -> InventorySummaryResponse:
        """Get inventory KPI metrics."""
        summary_dict = await self.repo.get_inventory_summary()
        return InventorySummaryResponse(**summary_dict)

    @staticmethod
    def to_response_dto(part: PartItem) -> PartResponse:
        """Convert ORM model to serialized DTO with margin and low-stock computation."""
        margin = part.retail_price - part.cost_price
        margin_pct = 0.0
        if part.cost_price > 0:
            margin_pct = float(round((margin / part.cost_price) * 100, 1))

        return PartResponse(
            id=part.id,
            service_center_id=part.service_center_id,
            name=part.name,
            sku=part.sku,
            oem_number=part.oem_number,
            barcode=part.barcode,
            category=part.category,
            unit=part.unit,
            cost_price=part.cost_price,
            retail_price=part.retail_price,
            quantity_in_stock=part.quantity_in_stock,
            min_stock_level=part.min_stock_level,
            location=part.location,
            supplier_name=part.supplier_name,
            supplier_phone=part.supplier_phone,
            notes=part.notes,
            is_active=part.is_active,
            created_at=part.created_at,
            updated_at=part.updated_at,
            is_low_stock=bool(part.quantity_in_stock <= part.min_stock_level),
            profit_margin=margin,
            profit_margin_percent=margin_pct,
        )
