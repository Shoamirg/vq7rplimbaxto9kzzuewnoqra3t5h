from __future__ import annotations
import logging
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.events import DomainEvent, event_bus

logger = logging.getLogger(__name__)


class UnitOfWork:
    """
    Unit of Work pattern providing atomic transactions.

    Usage:
        async with UnitOfWork() as uow:
            customer = await uow.customers.get_by_id(id)
            await uow.vehicles.create(...)
            uow.add_event(VehicleAdded(...))
            # Auto-commits on success, rolls back on exception
    """

    def __init__(self):
        self.session: AsyncSession | None = None
        self._events: List[DomainEvent] = []
        # Repositories will be lazy-initialized once session is available
        self._repos = {}

    async def __aenter__(self) -> UnitOfWork:
        self.session = async_session_factory()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type is not None:
            await self.rollback()
            return
        try:
            await self.commit()
        except Exception:
            await self.rollback()
            raise
        finally:
            if self.session:
                await self.session.close()

    async def flush(self) -> None:
        """Flush pending changes to the database without committing."""
        if self.session:
            await self.session.flush()

    async def commit(self) -> None:
        if self.session:
            await self.session.commit()
            # Publish all collected events after successful commit
            for event in self._events:
                try:
                    event_bus.dispatch(event)
                except Exception:
                    logger.exception("Failed to publish event %s", type(event).__name__)
            self._events.clear()

    async def rollback(self) -> None:
        if self.session:
            await self.session.rollback()
        self._events.clear()

    def add_event(self, event: DomainEvent) -> None:
        """Register a domain event to be published after commit."""
        self._events.append(event)

    def repository(self, repo_cls, model_cls):
        """Get or create a repository instance tied to this UoW session."""
        key = (repo_cls, model_cls)
        if key not in self._repos:
            self._repos[key] = repo_cls(model=model_cls, session=self.session)
        return self._repos[key]
