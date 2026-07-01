from __future__ import annotations
import uuid
from typing import Optional, Sequence
from sqlalchemy import select, and_
from app.models.maintenance_rule import MaintenanceRule
from app.models.brand import Brand
from app.models.vehicle_model import VehicleModel
from app.repositories.base import TenantScopedRepository


class MaintenanceRepository(TenantScopedRepository[MaintenanceRule]):
    def __init__(self, session, service_center_id: uuid.UUID):
        super().__init__(MaintenanceRule, session, service_center_id)

    async def rules_for_brand(self, brand_id: uuid.UUID, service_center_id: uuid.UUID) -> Sequence[MaintenanceRule]:
        stmt = select(MaintenanceRule).where(
            MaintenanceRule.brand_id == brand_id,
            MaintenanceRule.service_center_id == service_center_id,
            MaintenanceRule.is_active == True,
        ).order_by(MaintenanceRule.sort_order, MaintenanceRule.interval_km)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def rules_for_model(
        self,
        brand_id: uuid.UUID,
        vehicle_model_id: uuid.UUID,
        service_center_id: uuid.UUID,
    ) -> Sequence[MaintenanceRule]:
        """Get rules for a specific model, falling back to brand-level rules."""
        stmt = select(MaintenanceRule).where(
            MaintenanceRule.brand_id == brand_id,
            MaintenanceRule.service_center_id == service_center_id,
            MaintenanceRule.is_active == True,
            and_(
                (MaintenanceRule.vehicle_model_id == vehicle_model_id) |
                (MaintenanceRule.vehicle_model_id.is_(None)),
            ),
        ).order_by(MaintenanceRule.sort_order, MaintenanceRule.interval_km)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_by_service_type(
        self,
        service_type: str,
        service_center_id: uuid.UUID,
    ) -> Optional[MaintenanceRule]:
        stmt = select(MaintenanceRule).where(
            MaintenanceRule.service_type == service_type,
            MaintenanceRule.service_center_id == service_center_id,
            MaintenanceRule.is_active == True,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_brands_with_rules(self, service_center_id: uuid.UUID) -> Sequence[Brand]:
        """Get brands that have maintenance rules configured."""
        stmt = select(Brand).join(
            MaintenanceRule,
            MaintenanceRule.brand_id == Brand.id,
        ).where(
            MaintenanceRule.service_center_id == service_center_id,
            MaintenanceRule.is_active == True,
            Brand.is_active == True,
        ).distinct().order_by(Brand.name)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_models_with_rules(
        self,
        brand_id: uuid.UUID,
        service_center_id: uuid.UUID,
    ) -> Sequence[VehicleModel]:
        stmt = select(VehicleModel).join(
            MaintenanceRule,
            MaintenanceRule.vehicle_model_id == VehicleModel.id,
        ).where(
            MaintenanceRule.brand_id == brand_id,
            MaintenanceRule.service_center_id == service_center_id,
            MaintenanceRule.is_active == True,
            VehicleModel.is_active == True,
        ).distinct().order_by(VehicleModel.name)
        result = await self.session.execute(stmt)
        return result.scalars().all()
