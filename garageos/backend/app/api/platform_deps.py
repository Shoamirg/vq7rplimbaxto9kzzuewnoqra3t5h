"""Explicit platform access; tenant repositories never bypass their center.

``platform.read`` powers the cross-tenant record browser; ``platform.write`` powers the
control center (networks, workshops, staff access). Both are granted only to a
verified super admin on a non-demo token and are re-derived on every request.
"""
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import _bearer, get_current_user
from app.core.database import get_db
from app.core.security import decode_token
from app.exceptions import UnauthorizedAction, UnauthorizedError
from app.models.user import User


async def get_platform_permissions(
    user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> list[str]:
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise UnauthorizedError()
    if not payload.get('demo') and user.is_super_admin and user.role.name == 'super_admin':
        return ['platform.read', 'platform.write']
    return []


async def get_platform_db(
    request: Request,
    permissions: list[str] = Depends(get_platform_permissions),
    db: AsyncSession = Depends(get_db),
) -> AsyncSession:
    if 'platform.read' not in permissions or request.method not in {'GET', 'HEAD', 'OPTIONS'}:
        raise UnauthorizedAction()
    return db


async def get_platform_operator(
    user: User = Depends(get_current_user),
    permissions: list[str] = Depends(get_platform_permissions),
) -> User:
    """The super admin driving a control-center write (or read of the tree/logs)."""
    if 'platform.write' not in permissions:
        raise UnauthorizedAction()
    return user
