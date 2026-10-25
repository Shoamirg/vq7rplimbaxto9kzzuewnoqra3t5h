"""Persisted QA token families for seeded identities, never a production bypass.

Tests that focus on authorization can supply a synthetic signed demo claim while
still exercising the normal server session, identity and tenant checks. Invalid
proof tests continue using the low-level JWT encoder explicitly.

Every customer session belongs to a password account, so customer helpers open
one for the customer (or reuse it) before issuing the session.
"""
import uuid

from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.security import hash_password
from app.models import Customer, User
from app.models.customer_account import CustomerAccount
from app.repositories.unit_of_work import UnitOfWork
from app.services.auth_session_service import AuthSessionService

QA_CUSTOMER_PASSWORD = "Customer-qa-only-2026"


async def ensure_customer_account(session, customer) -> CustomerAccount:
    account = await session.scalar(select(CustomerAccount).where(CustomerAccount.customer_id == customer.id))
    if account is None:
        account = CustomerAccount(customer_id=customer.id, service_center_id=customer.service_center_id,
                                  email=f"qa-{uuid.uuid4().hex}@example.com",
                                  password_hash=hash_password(QA_CUSTOMER_PASSWORD))
        session.add(account)
        await session.flush()
    return account


async def customer_tokens(session, customer) -> dict:
    """A real customer session (through CustomerAuthService) on ``session``."""
    from app.services.customer_auth_service import CustomerAuthService
    account = await ensure_customer_account(session, customer)
    uow = UnitOfWork()
    uow.session = session
    return await CustomerAuthService(uow)._tokens(customer, account)


async def persisted_pair(claims):
    kind = "customer" if claims.get("type", "access").startswith("customer_") else "staff"
    model = Customer if kind == "customer" else User
    async with async_session_factory() as session:
        principal = await session.scalar(select(model).where(model.id == uuid.UUID(claims["sub"])))
        if principal is None:
            raise ValueError("Persisted QA credentials require a real seeded principal")
        data = {key: value for key, value in claims.items() if key not in {"type", "exp", "sid", "jti"}}
        if kind == "customer" and "account_id" not in data:
            account = await ensure_customer_account(session, principal)
            data.update(account_id=str(account.id), account_version=account.version)
        return await AuthSessionService(session).issue(kind=kind, principal_id=principal.id,
            center_id=principal.service_center_id, claims=data)


async def persisted_access(claims):
    return (await persisted_pair(claims))["access_token"]
