from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional, Sequence, Tuple
from sqlalchemy import select, func, or_, and_, desc
from sqlalchemy.orm import selectinload

from app.models.part import PartItem, InventoryMovement
from app.repositories.base import TenantScopedRepository


class PartRepository(TenantScopedRepository[PartItem]):
    def __init__(self, session, service_center_id: uuid.UUID):
        super().__init__(PartItem, session, service_center_id)

    async def get_by_sku(self, sku: str) -> Optional[PartItem]:
        """Tenant-scoped fetch by internal SKU."""
        stmt = self._scope(
            select(PartItem).where(
                PartItem.sku == sku,
                PartItem.is_active == True,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_barcode(self, barcode: str) -> Optional[PartItem]:
        """Tenant-scoped fetch by EAN-13 barcode."""
        stmt = self._scope(
            select(PartItem).where(
                PartItem.barcode == barcode,
                PartItem.is_active == True,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def search_parts(
        self,
        *,
        search: Optional[str] = None,
        category: Optional[str] = None,
        low_stock_only: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> Tuple[Sequence[PartItem], int]:
        """Search parts with filtering, pagination and total count."""
        base_filters = [PartItem.is_active == True]

        if category:
            base_filters.append(PartItem.category == category)

        if low_stock_only:
            base_filters.append(PartItem.quantity_in_stock <= PartItem.min_stock_level)

        if search:
            s = f"%{search.strip()}%"
            base_filters.append(
                or_(
                    PartItem.name.ilike(s),
                    PartItem.sku.ilike(s),
                    PartItem.oem_number.ilike(s),
                    PartItem.barcode.ilike(s),
                )
            )

        # Count total
        count_stmt = self._scope(
            select(func.count(PartItem.id)).where(and_(*base_filters))
        )
        total_res = await self.session.execute(count_stmt)
        total = total_res.scalar_one() or 0

        # Query items
        stmt = self._scope(
            select(PartItem)
            .where(and_(*base_filters))
            .order_by(PartItem.name.asc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all(), total

    async def list_movements(
        self,
        *,
        part_id: Optional[uuid.UUID] = None,
        limit: int = 50,
    ) -> Sequence[InventoryMovement]:
        """List inventory ledger movements."""
        stmt = select(InventoryMovement).where(
            InventoryMovement.service_center_id == self.service_center_id,
            InventoryMovement.is_active == True,
        )
        if part_id:
            stmt = stmt.where(InventoryMovement.part_id == part_id)

        stmt = stmt.order_by(InventoryMovement.created_at.desc()).limit(limit)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def get_inventory_summary(self) -> dict:
        """Compute aggregate stock metrics and category breakdown."""
        # Aggregate totals
        agg_stmt = self._scope(
            select(
                func.count(PartItem.id).label("total_parts"),
                func.coalesce(func.sum(PartItem.quantity_in_stock), 0).label("total_stock"),
                func.coalesce(func.sum(PartItem.quantity_in_stock * PartItem.cost_price), 0).label("total_cost"),
                func.coalesce(func.sum(PartItem.quantity_in_stock * PartItem.retail_price), 0).label("total_retail"),
            ).where(PartItem.is_active == True)
        )
        agg_res = await self.session.execute(agg_stmt)
        agg_row = agg_res.one()

        # Low stock count
        low_stock_stmt = self._scope(
            select(func.count(PartItem.id)).where(
                PartItem.is_active == True,
                PartItem.quantity_in_stock <= PartItem.min_stock_level,
            )
        )
        low_res = await self.session.execute(low_stock_stmt)
        low_count = low_res.scalar_one() or 0

        # Category breakdown
        cat_stmt = self._scope(
            select(
                PartItem.category,
                func.count(PartItem.id).label("count"),
                func.coalesce(func.sum(PartItem.quantity_in_stock * PartItem.retail_price), 0).label("total_value"),
            )
            .where(PartItem.is_active == True)
            .group_by(PartItem.category)
        )
        cat_res = await self.session.execute(cat_stmt)
        cat_rows = cat_res.all()

        return {
            "total_parts": agg_row.total_parts,
            "total_stock_count": Decimal(str(agg_row.total_stock)),
            "total_cost_value": Decimal(str(agg_row.total_cost)),
            "total_retail_value": Decimal(str(agg_row.total_retail)),
            "low_stock_count": low_count,
            "categories": [
                {
                    "category": r.category,
                    "count": r.count,
                    "total_value": Decimal(str(r.total_value)),
                }
                for r in cat_rows
            ],
        }
