"""FastAPI dependencies: authentication and the tenant-scoped Unit of Work.

The chain is: bearer token -> current User (global lookup) -> a UnitOfWork bound
to that user's service_center_id. Endpoints depend on ``get_tenant_uow`` and get
repositories/services that are automatically scoped to the caller's tenant.
"""
from __future__ import annotations

from typing import Any, AsyncIterator, Callable, Coroutine

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.roles import SUPER_ADMIN
from app.exceptions import UnauthorizedAction, UnauthorizedError
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.services.auth_service import AuthService

# auto_error=False so a missing/invalid header yields our own 401 shape.
_bearer = HTTPBearer(auto_error=False)


def _auth_service(session: AsyncSession) -> AuthService:
    uow = UnitOfWork()          # global (no tenant) — auth lookups are cross-tenant
    uow.session = session
    return AuthService(uow)


async def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    """Auth service for pre-tenant flows (login, refresh)."""
    return _auth_service(db)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError()
    return await _auth_service(db).get_current_user(credentials.credentials)


def require_roles(
    *allowed: str,
) -> Callable[[User], Coroutine[Any, Any, User]]:
    """Build a dependency that admits only the given roles.

    ``super_admin`` always passes (platform override), so it never needs to be
    listed. Any other authenticated user whose role is not in ``allowed`` gets a
    403 (``UnauthorizedAction``). Returns the ``User`` so an endpoint can both
    guard and read the caller in one dependency::

        @router.post(..., )
        async def handler(user: User = Depends(require_roles(ADMIN))): ...

    Or purely as a gate via ``dependencies=[Depends(require_roles(ADMIN))]``.
    """
    permitted: frozenset[str] = frozenset(allowed)

    async def _guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.is_super_admin:
            return current_user
        role_name = current_user.role.name if current_user.role else None
        if role_name == SUPER_ADMIN or role_name in permitted:
            return current_user
        raise UnauthorizedAction()

    return _guard


async def get_tenant_uow(
    current_user: User = Depends(get_current_user),
) -> AsyncIterator[UnitOfWork]:
    """A UnitOfWork scoped to the authenticated user's tenant.

    Repositories/services built from it are automatically constrained to this
    service center — cross-tenant reads/writes are impossible by construction.
    """
    async with UnitOfWork(service_center_id=current_user.service_center_id) as uow:
        yield uow
