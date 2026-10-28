"""Authentication endpoints: login, token refresh, current user."""
from __future__ import annotations

from app.api.platform_deps import get_platform_permissions

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_auth_service, get_current_user, get_staff_permissions
from app.api.logout_proof import logout_proof
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import auth_rate_limit
from app.exceptions import GarageException, NotFoundError
from app.models.service_center import ServiceCenter
from app.models.user import User
from app.schemas.auth import (
    CurrentUserResponse,
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    LogoutRequest,
    LogoutResponse,
)
from app.schemas.branding import Branding, branding_dict
from app.services.audit_service import record_audit
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/logout", response_model=LogoutResponse, summary="Revoke this staff session")
async def logout(request: Request, body: LogoutRequest | None = None,
                 auth: AuthService = Depends(get_auth_service)) -> LogoutResponse:
    await auth.logout(logout_proof(request, body))
    return LogoutResponse()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and get tokens",
    dependencies=[Depends(auth_rate_limit)],
)
async def login(
    body: LoginRequest,
    request: Request,
    auth: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    try:
        tokens = await auth.login(body.email, body.password)
    except GarageException:
        # Record the failed attempt (no tenant/actor — the email may be unknown)
        # before re-raising, so brute-force attempts leave a trail.
        await record_audit(
            action="auth.login.failure",
            status="failure",
            actor_email=body.email,
            request=request,
        )
        raise
    await record_audit(
        action="auth.login.success",
        actor_email=body.email,
        request=request,
    )
    return TokenResponse(**tokens)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange a refresh token",
    dependencies=[Depends(auth_rate_limit)],
)
async def refresh(
    body: RefreshTokenRequest,
    request: Request,
    auth: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    # A stolen/replayed refresh token being cycled leaves a trail too, not just
    # login. The token itself is never recorded — only the outcome + provenance.
    try:
        tokens = await auth.refresh(body.refresh_token)
    except GarageException:
        await record_audit(action="auth.refresh.failure", status="failure", request=request)
        raise
    await record_audit(action="auth.refresh.success", request=request)
    return TokenResponse(**tokens)


@router.post(
    "/demo",
    response_model=TokenResponse,
    summary="Enter the read-only public demo",
    dependencies=[Depends(auth_rate_limit)],
)
async def demo(auth: AuthService = Depends(get_auth_service)) -> TokenResponse:
    # 404 (not 403) when disabled, so the route is indistinguishable from missing.
    if not settings.DEMO_MODE_ENABLED:
        raise NotFoundError("Not found")
    return TokenResponse(**await auth.demo_login())


@router.get("/me", response_model=CurrentUserResponse, summary="Current authenticated user")
async def me(
    current_user: User = Depends(get_current_user),
    permissions: list[str] = Depends(get_staff_permissions),
    platform_permissions: list[str] = Depends(get_platform_permissions),
    db: AsyncSession = Depends(get_db),
) -> CurrentUserResponse:
    result = await db.execute(
        select(ServiceCenter).where(ServiceCenter.id == current_user.service_center_id)
    )
    center = result.scalar_one_or_none()
    return CurrentUserResponse(
        timezone=center.timezone if center else 'UTC',
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.name if current_user.role else None,
        service_center_id=str(current_user.service_center_id),
        is_super_admin=current_user.is_super_admin,
        permissions=permissions,
        platform_permissions=platform_permissions,
        branding=Branding(**branding_dict(center)) if center else None,
    )
