"""The authenticated customer's own profile + garage identity."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.customer_deps import get_current_customer, get_customer_uow
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import MeResponse
from app.services.customer_portal_service import CustomerPortalService

router = APIRouter()


@router.get("", response_model=MeResponse, summary="Current customer profile")
async def me(
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
) -> MeResponse:
    return await CustomerPortalService(uow, customer).me()


# ── account self-service ───────────────────────────────────────────────────
from fastapi.security import HTTPAuthorizationCredentials

from app.api.customer_deps import _bearer
from app.core.security import decode_token
from app.schemas.auth import LogoutResponse
from app.schemas.customer_account import AccountDelete, PasswordChange
from app.schemas.customer_portal import TokenResponse
from app.services.customer_account_lifecycle import CustomerAccountLifecycle


def _payload(credentials: HTTPAuthorizationCredentials) -> dict:
    # get_current_customer already validated this token and its session.
    return decode_token(credentials.credentials) or {}


@router.post("/password", response_model=TokenResponse,
             summary="Change password; other devices are signed out")
async def change_password(
    body: PasswordChange,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    return await CustomerAccountLifecycle(uow).change_password(
        customer, _payload(credentials), body.current_password, body.new_password)


@router.delete("", response_model=LogoutResponse,
               summary="Delete my account (store requirement): login removed, profile anonymized")
async def delete_account(
    body: AccountDelete | None = None,
    customer: Customer = Depends(get_current_customer),
    uow: UnitOfWork = Depends(get_customer_uow),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    await CustomerAccountLifecycle(uow).delete_account(
        customer, _payload(credentials), body.password if body else None)
    return LogoutResponse()
