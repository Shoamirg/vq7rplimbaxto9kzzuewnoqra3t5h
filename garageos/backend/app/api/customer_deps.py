"""FastAPI dependencies for customer-facing API principals.

Parallel to :mod:`app.api.deps` but for the *customer* principal. The chain is:
bearer customer-token -> current Customer (global lookup) -> a UnitOfWork bound to
that customer's tenant. Customer endpoints get a UoW already scoped to the right
service center, and the authenticated Customer for per-row ownership checks.

A staff access token cannot satisfy these deps: ``CustomerAuthService`` only
accepts tokens whose ``type`` claim is ``customer_access``.
"""
from __future__ import annotations

from typing import AsyncIterator

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.exceptions import UnauthorizedAction, UnauthorizedError
from app.models.customer import Customer
from app.repositories.unit_of_work import UnitOfWork
from app.services.customer_auth_service import CustomerAuthService

_bearer = HTTPBearer(auto_error=False)


def _customer_auth(session: AsyncSession) -> CustomerAuthService:
    uow = UnitOfWork()  # global (no tenant) — identity lookups cross tenants
    uow.session = session
    return CustomerAuthService(uow)


async def get_customer_auth_service(
    db: AsyncSession = Depends(get_db, scope="function"),
) -> CustomerAuthService:
    """Auth service for pre-token flows (telegram sign-in, link, refresh)."""
    return _customer_auth(db)


async def get_current_customer(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Customer:
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError()
    return await _customer_auth(db).get_current_customer(credentials.credentials)


def password_customer_route_allowed(method: str, path: str) -> bool:
    """Keep password customers on read-only portal routes plus self-booking."""
    normalized_path = path.rstrip("/")
    if method in {"GET", "HEAD", "OPTIONS"}:
        return (
            normalized_path == "/api/v1/customer/me"
            or normalized_path.startswith("/api/v1/customer/history/")
            or normalized_path == "/api/v1/customer/vehicles"
            or normalized_path == "/api/v1/customer/appointments/today"
        )
    return method == "POST" and normalized_path == "/api/v1/customer/appointments"


async def get_customer_uow(
    request: Request,
    current_customer: Customer = Depends(get_current_customer),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> AsyncIterator[UnitOfWork]:
    """Tenant-bound access; password customers get reads and owned-vehicle booking only."""
    # Identity/credential validity is checked by get_current_customer first.
    # The signed claim distinguishes owner-created credentials from Telegram.
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise UnauthorizedError()
    if "account_id" in payload and not password_customer_route_allowed(
        request.method, request.url.path
    ):
        raise UnauthorizedAction()
    async with UnitOfWork(service_center_id=current_customer.service_center_id) as uow:
        yield uow
