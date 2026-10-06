"""Explicit platform reads; tenant repositories never bypass their center."""
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
        return ['platform.read']
    return []


async def get_platform_db(
    request: Request,
    permissions: list[str] = Depends(get_platform_permissions),
    db: AsyncSession = Depends(get_db),
) -> AsyncSession:
    if 'platform.read' not in permissions or request.method not in {'GET', 'HEAD', 'OPTIONS'}:
        raise UnauthorizedAction()
    return db
