from __future__ import annotations
import logging
import uuid
from typing import Awaitable, Callable, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.events import DomainEvent, event_bus

logger = logging.getLogger(__name__)


class UnitOfWork:
    """
    Unit of Work pattern providing atomic transactions.

    Carries the authenticated tenant (``service_center_id``) so services can
    build tenant-scoped repositories from a single trusted source rather than
    threading the id through every call.

    Usage:
        async with UnitOfWork(service_center_id=current_user.service_center_id) as uow:
            svc = AppointmentService(uow)   # repos auto-scoped to the tenant
            uow.add_event(VehicleAdded(...))
            # Auto-commits on success, rolls back on exception
    """

    def __init__(self, service_center_id: Optional[uuid.UUID] = None):
        self.session: AsyncSession | None = None
        self.service_center_id = service_center_id
        self._events: List[DomainEvent] = []
        self._before_commit: list[Callable[[], Awaitable[None]]] = []
        # Repositories will be lazy-initialized once session is available
        self._repos = {}

    async def __aenter__(self) -> UnitOfWork:
        self.session = async_session_factory()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        try:
            if exc_type is not None:
                await self.rollback()
            elif self.session and self.session.in_transaction():
                # A completed booking can commit before publishing its cache
                # result. Avoid another empty commit on exit; a later query or
                # write starts a new transaction and is still finalized here.
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
            for guard in self._before_commit:
                await guard()
            await self.session.commit()
            self._before_commit.clear()
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
        self._before_commit.clear()

    def before_commit(self, guard: Callable[[], Awaitable[None]]) -> None:
        """Pin current policy in this transaction before any success/event."""
        self._before_commit.append(guard)

    def add_event(self, event: DomainEvent) -> None:
        """Register a domain event to be published after commit."""
        self._events.append(event)

    def repository(self, repo_cls, model_cls):
        """Get or create a repository instance tied to this UoW session."""
        key = (repo_cls, model_cls)
        if key not in self._repos:
            self._repos[key] = repo_cls(model=model_cls, session=self.session)
        return self._repos[key]
