"""Customer-facing authentication for the Telegram Mini App (and future clients).

This is deliberately separate from :class:`AuthService` (staff auth): customers
are a different principal type with their own token flavour. A customer token
carries ``type=customer_access`` and its ``sub`` is a *customer* id — an admin
token can never satisfy a customer endpoint, and vice versa, because the deps
check the ``type`` claim.

Identity is established from a verified Telegram ``initData`` (see
:mod:`app.services.telegram_auth`). The bot token only signs/verifies that data;
it is never the identity. A Telegram user maps to exactly one customer row (in
some tenant), and that customer's ``service_center_id`` becomes the tenant the
Mini App operates within — the same multi-tenant boundary the staff app uses.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import func, select

from app.core.config import settings
from app.core.security import (
    decode_token,
    verify_password,
)
from app.exceptions import InvalidToken, NotFoundError, UnauthorizedError, InvalidCredentials
from app.models.customer_account import CustomerAccount
from app.models.service_center import ServiceCenter
from app.models.customer import Customer
from app.repositories.customer_repository import CustomerRepository
from app.repositories.unit_of_work import UnitOfWork
from app.services.telegram_auth import TelegramUser, verify_init_data
from app.services.auth_session_service import AuthSessionService

_ACCESS = "customer_access"
_REFRESH = "customer_refresh"


class TelegramNotLinked(NotFoundError):
    """Verified Telegram user, but no customer is linked to it yet."""

    detail = "This Telegram account is not linked to a customer profile"
    code = "TELEGRAM_NOT_LINKED"


class CustomerAuthService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.sessions = AuthSessionService(uow.session)

    async def authenticate_password(self, email: str, password: str) -> dict:
        account = await self.uow.session.scalar(select(CustomerAccount).where(CustomerAccount.email == email.lower()))
        if account is None or not account.is_active or len(password.encode('utf-8')) > 72 or not verify_password(password, account.password_hash):
            raise InvalidCredentials()
        try:
            customer = await self._load(str(account.customer_id), lock=True)
        except UnauthorizedError:
            raise InvalidCredentials() from None
        if account.service_center_id != customer.service_center_id:
            raise InvalidCredentials()
        account = await self.uow.session.scalar(select(CustomerAccount).where(CustomerAccount.id == account.id)
            .with_for_update().execution_options(populate_existing=True))
        if not account.is_active or not verify_password(password, account.password_hash):
            raise InvalidCredentials()
        return await self._tokens(customer, account)

    async def _password_account(self, payload, customer, *, lock=False):
        if 'account_id' not in payload:
            return None
        try:
            account_id = uuid.UUID(payload['account_id'])
        except (ValueError, TypeError, AttributeError):
            raise InvalidToken() from None
        statement = select(CustomerAccount).where(CustomerAccount.id == account_id)
        if lock:
            statement = statement.with_for_update()
        account = await self.uow.session.scalar(statement.execution_options(populate_existing=True))
        if account is None or not account.is_active or account.customer_id != customer.id or account.service_center_id != customer.service_center_id or account.version != payload.get('account_version'):
            raise InvalidToken()
        return account

    # --- Sign-in ------------------------------------------------------------

    async def authenticate_telegram(self, init_data: str) -> dict:
        """Verify Telegram initData and mint a customer token pair.

        Raises :class:`TelegramNotLinked` when the Telegram user has no linked
        customer, so the client can route into the linking flow.
        """
        tg = verify_init_data(init_data, settings.TELEGRAM_BOT_TOKEN or "")
        customer = await CustomerRepository.find_by_telegram_id(
            self.uow.session, tg.telegram_id
        )
        if customer is None:
            raise TelegramNotLinked()
        customer = await self._load(str(customer.id), lock=True)

        # Keep the stored username fresh (cheap, and handy for staff search).
        if tg.username and customer.telegram_username != tg.username:
            customer.telegram_username = tg.username
            await self.uow.session.flush()

        return await self._tokens(customer)

    async def link_by_phone(self, init_data: str, phone: str) -> dict:
        """Link a verified Telegram user to a customer found by phone.

        Used the first time a customer opens the Mini App: they prove their
        Telegram identity (initData) and their customer identity (a phone the
        garage already has on file). We only auto-link when the phone maps to a
        single, currently-unlinked customer to avoid hijacking an account.
        """
        tg = verify_init_data(init_data, settings.TELEGRAM_BOT_TOKEN or "")

        # Global phone lookup (crosses tenants like the telegram-id lookup does).
        stmt = select(Customer).where(
            Customer.phone == phone,
            Customer.is_active == True,  # noqa: E712
        ).with_for_update(of=Customer).execution_options(populate_existing=True)
        matches = (await self.uow.session.execute(stmt)).scalars().all()
        linkable = [c for c in matches if c.telegram_id is None]
        if len(linkable) != 1:
            # Zero, or ambiguous, or already linked — refuse to guess.
            raise TelegramNotLinked(
                "We couldn't match that phone to a single unlinked profile"
            )

        customer = linkable[0]
        customer = await self._load(str(customer.id), lock=True)
        customer.telegram_id = tg.telegram_id
        customer.telegram_username = tg.username
        await self.uow.session.flush()
        return await self._tokens(customer)

    async def dev_authenticate(self, telegram_id: int | None = None) -> dict:
        """DEBUG-only: mint a token for a seeded customer without Telegram.

        Lets the Mini App be developed and end-to-end tested in a plain browser
        (and Playwright) where no Telegram ``initData`` exists. The calling
        endpoint gates this on ``settings.DEBUG`` so it can never run in prod.
        """
        if telegram_id is not None:
            customer = (await self.uow.session.execute(
                select(Customer).where(
                    Customer.is_active == True,  # noqa: E712
                    Customer.telegram_id == telegram_id,
                ).limit(1)
            )).scalar_one_or_none()
            if customer is None:
                raise TelegramNotLinked("No seeded customer available for dev sign-in")
            return await self._tokens(customer)

        # No target: pick the telegram-linked customer with the MOST vehicles, so
        # the dev/demo session lands on the richest experience (and stays
        # consistent with the same account when opened via real Telegram).
        from app.models.vehicle import Vehicle

        rich = (await self.uow.session.execute(
            select(Customer)
            .join(Vehicle, Vehicle.customer_id == Customer.id)
            .where(
                Customer.is_active == True,  # noqa: E712
                Customer.telegram_id.isnot(None),
                Vehicle.is_active == True,  # noqa: E712
            )
            .group_by(Customer.id)
            .order_by(func.count(Vehicle.id).desc())
            .limit(1)
        )).scalar_one_or_none()
        if rich is not None:
            return await self._tokens(rich)

        customer = (await self.uow.session.execute(
            select(Customer).where(
                Customer.is_active == True,  # noqa: E712
                Customer.telegram_id.isnot(None),
            ).limit(1)
        )).scalar_one_or_none()
        if customer is None:
            raise TelegramNotLinked("No seeded customer available for dev sign-in")
        return await self._tokens(customer)

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
        centers = select(ServiceCenter.id).where(ServiceCenter.id == customer.service_center_id, ServiceCenter.is_active.is_(True))
        if lock:
            centers = centers.with_for_update(read=True)
        center = await self.uow.session.scalar(centers)
        if center is None:
            raise UnauthorizedError()
        return customer

    @staticmethod
    def _claims(customer: Customer, account: CustomerAccount | None = None) -> dict:
        claims = {
            "sub": str(customer.id),
            "scid": str(customer.service_center_id),
        }
        if account is not None:
            claims.update(account_id=str(account.id), account_version=account.version)
        return claims

    async def _tokens(self, customer: Customer, account: CustomerAccount | None = None) -> dict:
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
