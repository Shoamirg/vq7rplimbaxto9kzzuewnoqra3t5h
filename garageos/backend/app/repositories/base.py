from __future__ import annotations
import uuid
from typing import Generic, Optional, Sequence, Type, TypeVar
from sqlalchemy import select, func, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.models.base import BaseModelMixin

ModelType = TypeVar("ModelType", bound=BaseModelMixin)


class BaseRepository(Generic[ModelType]):
    """Generic repository providing common CRUD operations."""

    def __init__(self, model: Type[ModelType], session: AsyncSession):
        self.model = model
        self.session = session

    async def get_by_id(self, id: uuid.UUID) -> Optional[ModelType]:
        stmt = select(self.model).where(
            self.model.id == id,
            self.model.is_active == True,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list(
        self,
        *,
        skip: int = 0,
        limit: int = 20,
        order_by: str | None = None,
        descending: bool = False,
        **filters,
    ) -> tuple[Sequence[ModelType], int]:
        query = select(self.model).where(self.model.is_active == True)

        for field, value in filters.items():
            if value is not None and hasattr(self.model, field):
                query = query.where(getattr(self.model, field) == value)

        # Count
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.session.scalar(count_query)

        # Ordering
        if order_by and hasattr(self.model, order_by):
            order_col = getattr(self.model, order_by)
            query = query.order_by(order_col.desc() if descending else order_col)
        else:
            query = query.order_by(self.model.created_at.desc())

        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        items = result.scalars().all()

        return items, total or 0

    async def create(self, **kwargs) -> ModelType:
        instance = self.model(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(self, id: uuid.UUID, **kwargs) -> Optional[ModelType]:
        instance = await self.get_by_id(id)
        if not instance:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(instance, key):
                setattr(instance, key, value)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete(self, id: uuid.UUID, hard: bool = False) -> bool:
        instance = await self.get_by_id(id)
        if not instance:
            return False
        if hard:
            await self.session.delete(instance)
        else:
            instance.is_active = False
        await self.session.flush()
        return True

    async def exists(self, **filters) -> bool:
        query = select(self.model).where(self.model.is_active == True)
        for field, value in filters.items():
            if hasattr(self.model, field):
                query = query.where(getattr(self.model, field) == value)
        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None

    async def count(self, **filters) -> int:
        query = select(func.count()).select_from(self.model).where(self.model.is_active == True)
        for field, value in filters.items():
            if hasattr(self.model, field):
                query = query.where(getattr(self.model, field) == value)
        result = await self.session.execute(query)
        return result.scalar() or 0
