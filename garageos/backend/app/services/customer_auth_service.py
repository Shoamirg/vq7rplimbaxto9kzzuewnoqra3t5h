"""Customer (mobile app) authentication.

Deliberately separate from :class:`AuthService` (staff auth): a customer token
carries ``type=customer_access`` and its ``sub`` is a *customer* id, so a staff
token can never satisfy a customer endpoint, and vice versa.

Every customer session belongs to a ``CustomerAccount`` (email + password,
opened by the garage owner or by SMS-verified sign-up). The token pins the
account id and version: suspending the account, deleting it or changing its
password ends every session. The customer's ``service_center_id`` is the tenant
the app operates within.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select

from app.core.phone import phone_matches
from app.core.security import burn_password_check, decode_token, verify_password
from app.exceptions import InvalidCredentials, InvalidToken, UnauthorizedError
from app.models.customer import Customer
from app.models.customer_account import CustomerAccount
from app.models.service_center import ServiceCenter
from app.repositories.unit_of_work import UnitOfWork
from app.services.auth_session_service import AuthSessionService

_ACCESS = "customer_access"
_REFRESH = "customer_refresh"
# One person may hold logins at a few garages under the same phone.
_MAX_PHONE_CANDIDATES = 5


class CustomerAuthService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.sessions = AuthSessionService(uow.session)

    # --- Sign-in ------------------------------------------------------------

    async def authenticate_password(self, password: str, *, email: Optional[str] = None,
                                    phone: Optional[str] = None) -> dict:
        if len(password.encode("utf-8")) > 72:
            burn_password_check(password[:72])
            raise InvalidCredentials()
        candidates = await self._login_candidates(email=email, phone=phone)
        account = next((a for a in candidates if verify_password(password, a.password_hash)), None)
        if account is None:
            if not candidates:
                burn_password_check(password)  # same cost as a real miss
            raise InvalidCredentials()
        try:
            customer = await self._load(str(account.customer_id), lock=True)
        except UnauthorizedError:
            raise InvalidCredentials() from None
        checked_hash = account.password_hash
        account = await self.uow.session.scalar(select(CustomerAccount).where(CustomerAccount.id == account.id)
            .with_for_update().execution_options(populate_existing=True))
        # Re-read under lock: a concurrent suspension or password change wins.
        if (account is None or not account.is_active or account.password_hash != checked_hash
                or account.service_center_id != customer.service_center_id):
            raise InvalidCredentials()
        return await self._tokens(customer, account)

    async def _login_candidates(self, *, email: Optional[str], phone: Optional[str]) -> list[CustomerAccount]:
        statement = (select(CustomerAccount)
                     .join(Customer, Customer.id == CustomerAccount.customer_id)
                     .where(CustomerAccount.is_active.is_(True), Customer.is_active.is_(True)))
        if email is not None:
            statement = statement.where(CustomerAccount.email == email.lower())
        elif phone:
            statement = statement.where(phone_matches(Customer.phone, phone))
        else:
            return []
        rows = await self.uow.session.scalars(statement.order_by(CustomerAccount.created_at)
                                              .limit(_MAX_PHONE_CANDIDATES))
        return list(rows)

    async def _password_account(self, payload, customer, *, lock=False) -> CustomerAccount:
        try:
            account_id = uuid.UUID(payload["account_id"])
        except (KeyError, ValueError, TypeError, AttributeError):
            # Sessions without a password account (retired Telegram sign-in) are over.
            raise InvalidToken() from None
        statement = select(CustomerAccount).where(CustomerAccount.id == account_id)
        if lock:
            statement = statement.with_for_update()
        account = await self.uow.session.scalar(statement.execution_options(populate_existing=True))
        if (account is None or not account.is_active or account.customer_id != customer.id
                or account.service_center_id != customer.service_center_id
                or account.version != payload.get("account_version")):
            raise InvalidToken()
        return account

    async def refresh(self, refresh_token: str) -> dict:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != _REFRESH:
            raise InvalidToken()
        proof = self.sessions.proof(refresh_token, "customer")
        customer = await self._load(payload.get("sub"), lock=True)
        account = await self._password_account(payload, customer, lock=True)
        row = await self.sessions.load(proof, "customer")
        if row.service_center_id != customer.service_center_id:
            raise InvalidToken()
        tokens = await self.sessions.rotate(refresh_token, proof, "customer", self._claims(customer, account))
        return self._response(tokens, customer)

    # --- Resolution (used by deps) -----------------------------------------

    async def get_current_customer(self, token: str) -> Customer:
        payload = decode_token(token)
        if not payload or payload.get("type") != _ACCESS:
            raise InvalidToken()
        customer = await self._load(payload.get("sub"))
        await self._password_account(payload, customer)
        row = await self.sessions.load(self.sessions.proof(token, "customer"), "customer")
        if row.service_center_id != customer.service_center_id:
            raise InvalidToken()
        return customer

    # --- Internals ----------------------------------------------------------

    async def logout(self, token: str) -> None:
        await self.sessions.logout(token, "customer")

    async def _load(self, customer_id: Optional[str], *, lock=False) -> Customer:
        if not customer_id:
            raise InvalidToken()
        try:
            cid = uuid.UUID(customer_id)
        except (ValueError, TypeError, AttributeError):
            raise InvalidToken()
        statement = select(Customer).where(Customer.id == cid)
        if lock:
            statement = statement.with_for_update(of=Customer)
        customer = await self.uow.session.scalar(statement.execution_options(populate_existing=True))
        if customer is None or not customer.is_active:
            raise UnauthorizedError()
        centers = select(ServiceCenter.id).where(ServiceCenter.id == customer.service_center_id,
                                                 ServiceCenter.is_active.is_(True))
        if lock:
            centers = centers.with_for_update(read=True)
        if await self.uow.session.scalar(centers) is None:
            raise UnauthorizedError()
        return customer

    @staticmethod
    def _claims(customer: Customer, account: CustomerAccount) -> dict:
        return {
            "sub": str(customer.id),
            "scid": str(customer.service_center_id),
            "account_id": str(account.id),
            "account_version": account.version,
        }

    async def _tokens(self, customer: Customer, account: CustomerAccount) -> dict:
        customer = await self._load(str(customer.id), lock=True)
        tokens = await self.sessions.issue(kind="customer", principal_id=customer.id,
            center_id=customer.service_center_id, claims=self._claims(customer, account))
        return self._response(tokens, customer)

    @staticmethod
    def _response(tokens: dict, customer: Customer) -> dict:
        return {
            **tokens,
            "customer": {
                "id": str(customer.id),
                "full_name": customer.full_name,
                "service_center_id": str(customer.service_center_id),
            },
        }
