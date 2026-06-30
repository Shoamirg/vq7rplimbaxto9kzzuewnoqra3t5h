from __future__ import annotations
import uuid
from typing import Sequence
from sqlalchemy import select
from app.models.vehicle_model import VehicleModel
from app.repositories.base import BaseRepository


class VehicleModelRepository(BaseRepository[VehicleModel]):
    def __init__(self, session):
        super().__init__(VehicleModel, session)

    async def find_by_brand(self, brand_id: uuid.UUID) -> Sequence[VehicleModel]:
        stmt = select(VehicleModel).where(
            VehicleModel.brand_id == brand_id,
            VehicleModel.is_active == True,
        ).order_by(VehicleModel.name)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def search(self, brand_id: uuid.UUID, query: str) -> Sequence[VehicleModel]:
        stmt = select(VehicleModel).where(
            VehicleModel.brand_id == brand_id,
            VehicleModel.is_active == True,
            VehicleModel.name.ilike(f"%{query}%"),
        ).order_by(VehicleModel.name)
        result = await self.session.execute(stmt)
        return result.scalars().all()
