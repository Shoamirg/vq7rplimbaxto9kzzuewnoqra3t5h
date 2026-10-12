"""FastAPI dependencies: authentication and the tenant-scoped Unit of Work.

The chain is: bearer token -> current User (global lookup) -> a UnitOfWork bound
to that user's service_center_id. Endpoints depend on ``get_tenant_uow`` and get
repositories/services that are automatically scoped to the caller's tenant.
"""
from __future__ import annotations

from typing import AsyncIterator

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.exceptions import UnauthorizedAction, UnauthorizedError
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.services.auth_service import AuthService

OFFICE_ROLES = frozenset({"admin", "manager", "receptionist"})

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


async def get_office_staff_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Allow staff modules to be used only by active office roles."""
    role = current_user.role
    if (
        not current_user.is_active
        or not role
        or not role.is_active
        or role.name not in OFFICE_ROLES
    ):
        raise UnauthorizedAction()
    return current_user


async def get_office_write_user(
    current_user: User = Depends(get_office_staff_user),
) -> User:
    """Explicit dependency for write actions limited to office staff."""
    return current_user


async def get_tenant_uow(
    current_user: User = Depends(get_current_user),
) -> AsyncIterator[UnitOfWork]:
    """A UnitOfWork scoped to the authenticated user's tenant.

    Repositories/services built from it are automatically constrained to this
    service center — cross-tenant reads/writes are impossible by construction.
    """
    async with UnitOfWork(service_center_id=current_user.service_center_id) as uow:
        yield uow
