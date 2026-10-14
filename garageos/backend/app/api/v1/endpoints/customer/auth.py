"""Customer sign-in for the Telegram Mini App.

``/telegram`` verifies the launch initData and returns a token pair when the
Telegram user is already linked; otherwise it 404s with ``TELEGRAM_NOT_LINKED``
so the client shows the phone-linking screen, which posts to ``/link``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.api.customer_deps import get_customer_auth_service
from app.api.logout_proof import logout_proof
from app.schemas.auth import LogoutRequest, LogoutResponse
from app.core.config import settings
from app.core.rate_limit import auth_rate_limit
from app.exceptions import NotFoundError
from app.schemas.customer_portal import (
    DevSignInRequest,
    LinkRequest,
    RefreshRequest,
    TelegramSignInRequest,
    TokenResponse,
)
from app.services.customer_auth_service import CustomerAuthService

router = APIRouter()


@router.post("/logout", response_model=LogoutResponse, summary="Revoke this customer session")
async def logout(request: Request, body: LogoutRequest | None = None,
                 auth: CustomerAuthService = Depends(get_customer_auth_service)) -> LogoutResponse:
    await auth.logout(logout_proof(request, body))
    return LogoutResponse()


@router.post(
    "/telegram",
    response_model=TokenResponse,
    summary="Sign in with Telegram initData",
    dependencies=[Depends(auth_rate_limit)],
)
async def sign_in_telegram(
    body: TelegramSignInRequest,
    auth: CustomerAuthService = Depends(get_customer_auth_service),
) -> TokenResponse:
    return TokenResponse(**await auth.authenticate_telegram(body.init_data))


@router.post(
    "/link",
    response_model=TokenResponse,
    summary="Link Telegram to a customer by phone",
    dependencies=[Depends(auth_rate_limit)],
)
async def link_account(
    body: LinkRequest,
    auth: CustomerAuthService = Depends(get_customer_auth_service),
) -> TokenResponse:
    return TokenResponse(**await auth.link_by_phone(body.init_data, body.phone))


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh a customer token pair",
    dependencies=[Depends(auth_rate_limit)],
)
async def refresh(
    body: RefreshRequest,
    auth: CustomerAuthService = Depends(get_customer_auth_service),
) -> TokenResponse:
    return TokenResponse(**await auth.refresh(body.refresh_token))


@router.post("/dev", response_model=TokenResponse, summary="DEBUG-only sign-in (no Telegram)")
async def dev_sign_in(
    body: DevSignInRequest | None = None,
    auth: CustomerAuthService = Depends(get_customer_auth_service),
) -> TokenResponse:
    # Never expose this outside development — 404 so it's indistinguishable
    # from a route that doesn't exist.
    if not settings.DEBUG:
        raise NotFoundError("Not found")
    return TokenResponse(**await auth.dev_authenticate(body.telegram_id if body else None))

from app.schemas.customer_account import CustomerPasswordLogin

@router.post('/login', response_model=TokenResponse, dependencies=[Depends(auth_rate_limit)])
async def password_login(body: CustomerPasswordLogin, auth: CustomerAuthService = Depends(get_customer_auth_service)):
    return await auth.authenticate_password(str(body.email), body.password)
