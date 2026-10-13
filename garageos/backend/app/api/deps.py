"""FastAPI dependencies: authentication and the tenant-scoped Unit of Work.

The chain is: bearer token -> current User (global lookup) -> a UnitOfWork bound
to that user's service_center_id. Endpoints depend on ``get_tenant_uow`` and get
repositories/services that are automatically scoped to the caller's tenant.
"""
from __future__ import annotations

from typing import AsyncIterator

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.core.staff_access import staff_permissions
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


async def get_staff_permissions(
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> list[str]:
    permissions = staff_permissions(current_user)
    payload = decode_token(credentials.credentials) if credentials else None
    if payload is None:
        raise UnauthorizedError()
    if payload.get("demo"):
        permissions = [p for p in permissions if p == "staff.read"]
    return permissions


async def get_tenant_uow(
    request: Request,
    current_user: User = Depends(get_current_user),
    permissions: list[str] = Depends(get_staff_permissions),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AsyncIterator[UnitOfWork]:
    """A UnitOfWork scoped to the authenticated user's tenant.

    Repositories/services built from it are automatically constrained to this
    service center — cross-tenant reads/writes are impossible by construction.
    """
    required = "staff.read" if request.method in {"GET", "HEAD", "OPTIONS"} else "staff.write"
    if required not in permissions:
        raise UnauthorizedAction()
    async with UnitOfWork(service_center_id=current_user.service_center_id) as uow:
        path = request.url.path.rstrip("/")
        if required == "staff.write" and (path == "/api/v1/conversations" or path.startswith("/api/v1/conversations/")):
            from app.services.conversation_read_service import ConversationReadService
            if credentials is None:
                raise UnauthorizedError()
            async def current_inbox_policy():
                await ConversationReadService(uow).guard_write_session(current_user.id, credentials.credentials)
            uow.before_commit(current_inbox_policy)
        yield uow


async def get_mechanic_uow(
    request: Request,
    current_user: User = Depends(get_current_user),
    permissions: list[str] = Depends(get_staff_permissions),
) -> AsyncIterator[UnitOfWork]:
    required = "work.read.assigned" if request.method in {"GET", "HEAD", "OPTIONS"} else "work.write.assigned"
    if required not in permissions:
        raise UnauthorizedAction()
    async with UnitOfWork(service_center_id=current_user.service_center_id) as uow:
        yield uow
