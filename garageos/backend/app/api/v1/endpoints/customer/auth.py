"""Customer authentication for the mobile app.

Every customer session belongs to a password account (``CustomerAccount``).
Accounts are opened by the garage owner or by the customer through SMS-verified
sign-up; sign-in accepts the account email or the phone on the customer record.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.api.customer_deps import get_customer_auth_service
from app.api.logout_proof import logout_proof
from app.core.config import settings
from app.core.rate_limit import auth_rate_limit, rate_limit
from app.schemas.auth import LogoutRequest, LogoutResponse
from app.schemas.customer_account import (
    CodeSent, CustomerPasswordLogin, PasswordResetComplete, PasswordResetStart,
    SignupComplete, SignupStart,
)
from app.schemas.customer_portal import RefreshRequest, TokenResponse
from app.services.customer_account_lifecycle import CustomerAccountLifecycle
from app.services.customer_auth_service import CustomerAuthService
from app.services.sms import deliver_sms

router = APIRouter()
account_rate_limit = rate_limit(limit=30, window=60, scope="customer-account")


from app.schemas.customer_account import SignupVerify


@router.post('/signup/verify', dependencies=[Depends(account_rate_limit)],
             summary='Verify SMS ownership and return eligible garages')
async def signup_verify(body: SignupVerify,
                        auth: CustomerAuthService = Depends(get_customer_auth_service)):
    return await CustomerAccountLifecycle(auth.uow).verify_signup(str(body.email), body.phone, body.code)

# Per-IP ceiling sized for carrier NAT; per-phone/email limits live in the service.


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(auth_rate_limit)],
             summary="Sign in with email or phone and password")
async def password_login(body: CustomerPasswordLogin,
                         auth: CustomerAuthService = Depends(get_customer_auth_service)):
    return await auth.authenticate_password(body.password, email=body.email_str, phone=body.phone)


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(auth_rate_limit)],
             summary="Refresh a customer token pair")
async def refresh(body: RefreshRequest,
                  auth: CustomerAuthService = Depends(get_customer_auth_service)) -> TokenResponse:
    return TokenResponse(**await auth.refresh(body.refresh_token))


@router.post("/logout", response_model=LogoutResponse, summary="Revoke this customer session")
async def logout(request: Request, body: LogoutRequest | None = None,
                 auth: CustomerAuthService = Depends(get_customer_auth_service)) -> LogoutResponse:
    await auth.logout(logout_proof(request, body))
    return LogoutResponse()


# ── self-service: sign-up and password reset over SMS codes ────────────────
def _queue(background: BackgroundTasks, sms) -> None:
    # Delivered after the response so timing never reveals whether a record matched.
    if sms is not None:
        background.add_task(deliver_sms, sms)


def _code_sent() -> CodeSent:
    return CodeSent(expires_in=settings.VERIFICATION_CODE_TTL_SECONDS)


@router.post("/signup/start", status_code=202, response_model=CodeSent,
             dependencies=[Depends(account_rate_limit)],
             summary="Send an SMS code to the phone on the matching garage record")
async def signup_start(body: SignupStart, background: BackgroundTasks,
                       auth: CustomerAuthService = Depends(get_customer_auth_service)):
    _queue(background, await CustomerAccountLifecycle(auth.uow).start_signup(str(body.email), body.phone))
    return _code_sent()


@router.post("/signup/complete", status_code=201, response_model=TokenResponse,
             dependencies=[Depends(account_rate_limit)],
             summary="Confirm the SMS code, set a password and sign in")
async def signup_complete(body: SignupComplete,
                          auth: CustomerAuthService = Depends(get_customer_auth_service)):
    return await CustomerAccountLifecycle(auth.uow).complete_signup(
        str(body.email), body.phone, body.code, body.password, body.service_center_id, body.full_name)


@router.post("/password/reset/start", status_code=202, response_model=CodeSent,
             dependencies=[Depends(account_rate_limit)],
             summary="Send a reset code to the phone on the account")
async def password_reset_start(body: PasswordResetStart, background: BackgroundTasks,
                               auth: CustomerAuthService = Depends(get_customer_auth_service)):
    _queue(background, await CustomerAccountLifecycle(auth.uow).start_reset(email=body.email_str, phone=body.phone))
    return _code_sent()


@router.post("/password/reset/complete", response_model=LogoutResponse,
             dependencies=[Depends(account_rate_limit)],
             summary="Set a new password with the SMS code; signs out every device")
async def password_reset_complete(body: PasswordResetComplete,
                                  auth: CustomerAuthService = Depends(get_customer_auth_service)):
    await CustomerAccountLifecycle(auth.uow).complete_reset(
        body.code, body.new_password, email=body.email_str, phone=body.phone)
    return LogoutResponse()
