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

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.exceptions import UnauthorizedError
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


async def get_customer_uow(
    current_customer: Customer = Depends(get_current_customer),
) -> AsyncIterator[UnitOfWork]:
    """Tenant-bound access for every verified customer principal.

    Every customer session belongs to a password account; per-row
    ownership is enforced by the customer portal services, not by route lists.
    """
    async with UnitOfWork(service_center_id=current_customer.service_center_id) as uow:
        uow.actor_customer_id = current_customer.id
        yield uow
