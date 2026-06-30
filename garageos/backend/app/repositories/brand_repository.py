from __future__ import annotations
from typing import Sequence
from sqlalchemy import select
from app.models.brand import Brand
from app.repositories.base import BaseRepository


class BrandRepository(BaseRepository[Brand]):
    def __init__(self, session):
        super().__init__(Brand, session)

    async def list_active(self) -> Sequence[Brand]:
        stmt = select(Brand).where(Brand.is_active == True).order_by(Brand.name)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def search(self, query: str) -> Sequence[Brand]:
        stmt = select(Brand).where(
            Brand.is_active == True,
            Brand.name.ilike(f"%{query}%"),
        ).order_by(Brand.name)
        result = await self.session.execute(stmt)
        return result.scalars().all()
