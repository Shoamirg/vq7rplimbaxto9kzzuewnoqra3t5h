from __future__ import annotations
import uuid
from typing import Generic, Optional, Sequence, Type, TypeVar
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.models.base import BaseModelMixin

ModelType = TypeVar("ModelType", bound=BaseModelMixin)


class BaseRepository(Generic[ModelType]):
    """Generic CRUD operations.

    NOT tenant-scoped — use only for globally-shared/reference tables (roles,
    brands, vehicle models, service centers) or the authentication boundary.
    For tenant-owned data use :class:`TenantScopedRepository`, which makes the
    insecure "fetch any row by id" path impossible.
    """

    def __init__(self, model: Type[ModelType], session: AsyncSession):
        self.model = model
        self.session = session

    # --- Extension hooks (overridden by TenantScopedRepository) -------------
    def _scope(self, query: Select) -> Select:
        """Apply row-visibility constraints to a query. No-op in the base."""
        return query

    def _creation_values(self, values: dict) -> dict:
        """Inject/override ownership columns on create. No-op in the base."""
        return values

    # --- CRUD ---------------------------------------------------------------
    async def get_by_id(self, id: uuid.UUID) -> Optional[ModelType]:
        stmt = self._scope(
            select(self.model).where(
                self.model.id == id,
                self.model.is_active == True,
            )
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
        query = self._scope(select(self.model).where(self.model.is_active == True))

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
        instance = self.model(**self._creation_values(kwargs))
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(self, id: uuid.UUID, **kwargs) -> Optional[ModelType]:
        instance = await self.get_by_id(id)  # tenant-scoped via get_by_id
        if not instance:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(instance, key):
                setattr(instance, key, value)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete(self, id: uuid.UUID, hard: bool = False) -> bool:
        instance = await self.get_by_id(id)  # tenant-scoped via get_by_id
        if not instance:
            return False
        if hard:
            await self.session.delete(instance)
        else:
            instance.is_active = False
        await self.session.flush()
        return True

    async def exists(self, **filters) -> bool:
        query = self._scope(select(self.model).where(self.model.is_active == True))
        for field, value in filters.items():
            if hasattr(self.model, field):
                query = query.where(getattr(self.model, field) == value)
        result = await self.session.execute(query.limit(1))
        return result.scalars().first() is not None

    async def count(self, **filters) -> int:
        query = self._scope(
            select(func.count()).select_from(self.model).where(self.model.is_active == True)
        )
        for field, value in filters.items():
            if hasattr(self.model, field):
                query = query.where(getattr(self.model, field) == value)
        result = await self.session.execute(query)
        return result.scalar() or 0


class TenantScopedRepository(BaseRepository[ModelType]):
    """Repository whose every query is constrained to a single service center.

    Requires a ``service_center_id`` at construction, so there is no way to read
    or mutate another tenant's rows through it — the insecure "get any row by id"
    path simply does not exist. Custom finder methods on subclasses should wrap
    their statements in ``self._scope(...)`` for the same guarantee.
    """

    def __init__(self, model: Type[ModelType], session: AsyncSession, service_center_id: uuid.UUID):
        super().__init__(model, session)
        if service_center_id is None:
            raise ValueError(f"{type(self).__name__} requires a service_center_id")
        self.service_center_id = service_center_id

    def _scope(self, query: Select) -> Select:
        return query.where(self.model.service_center_id == self.service_center_id)

    def _creation_values(self, values: dict) -> dict:
        # Never trust a caller-supplied tenant on writes; force our own.
        return {**values, "service_center_id": self.service_center_id}
