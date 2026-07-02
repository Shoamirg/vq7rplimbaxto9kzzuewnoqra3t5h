"""Authentication endpoints: login, token refresh, current user."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_auth_service, get_current_user
from app.core.database import get_db
from app.models.service_center import ServiceCenter
from app.models.user import User
from app.schemas.auth import (
    CurrentUserResponse,
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
)
from app.schemas.branding import Branding, branding_dict
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/login", response_model=TokenResponse, summary="Authenticate and get tokens")
async def login(
    body: LoginRequest,
    auth: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    tokens = await auth.login(body.email, body.password)
    return TokenResponse(**tokens)


@router.post("/refresh", response_model=TokenResponse, summary="Exchange a refresh token")
async def refresh(
    body: RefreshTokenRequest,
    auth: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    tokens = await auth.refresh(body.refresh_token)
    return TokenResponse(**tokens)


@router.get("/me", response_model=CurrentUserResponse, summary="Current authenticated user")
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUserResponse:
    result = await db.execute(
        select(ServiceCenter).where(ServiceCenter.id == current_user.service_center_id)
    )
    center = result.scalar_one_or_none()
    return CurrentUserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.name if current_user.role else None,
        service_center_id=str(current_user.service_center_id),
        is_super_admin=current_user.is_super_admin,
        branding=Branding(**branding_dict(center)) if center else None,
    )
