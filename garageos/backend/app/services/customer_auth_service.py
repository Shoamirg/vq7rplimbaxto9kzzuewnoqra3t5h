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
from datetime import timedelta
from typing import Optional

from sqlalchemy import func, select

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.exceptions import InvalidToken, NotFoundError, UnauthorizedError
from app.models.customer import Customer
from app.repositories.customer_repository import CustomerRepository
from app.repositories.unit_of_work import UnitOfWork
from app.services.telegram_auth import TelegramUser, verify_init_data
from app.services.refresh_token_service import (
    consume_refresh_token,
    register_refresh_token,
    revoke_refresh_token,
)

_ACCESS = "customer_access"
_REFRESH = "customer_refresh"


class TelegramNotLinked(NotFoundError):
    """Verified Telegram user, but no customer is linked to it yet."""

    detail = "This Telegram account is not linked to a customer profile"
    code = "TELEGRAM_NOT_LINKED"


class CustomerAuthService:
    def __init__(self, uow: UnitOfWork):
        self.uow = uow

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
        )
        matches = (await self.uow.session.execute(stmt)).scalars().all()
        linkable = [c for c in matches if c.telegram_id is None]
        if len(linkable) != 1:
            # Zero, or ambiguous, or already linked — refuse to guess.
            raise TelegramNotLinked(
                "We couldn't match that phone to a single unlinked profile"
            )

        customer = linkable[0]
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
        customer = await self._load(payload.get("sub"))
        family_id = await consume_refresh_token(
            self.uow.session,
            refresh_token,
            payload,
            customer_id=customer.id,
        )
        return await self._tokens(customer, family_id=family_id)

    async def logout(self, refresh_token: str) -> None:
        """Revoke the refresh-token family; malformed tokens are ignored."""
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != _REFRESH:
            return
        try:
            customer_id = uuid.UUID(payload.get("sub", ""))
        except (ValueError, TypeError, AttributeError):
            return
        customer = await self.uow.session.get(Customer, customer_id)
        if customer is None:
            return
        await revoke_refresh_token(
            self.uow.session,
            refresh_token,
            payload,
            customer_id=customer.id,
        )

    # --- Resolution (used by deps) -----------------------------------------

    async def get_current_customer(self, token: str) -> Customer:
        payload = decode_token(token)
        if not payload or payload.get("type") != _ACCESS:
            raise InvalidToken()
        return await self._load(payload.get("sub"))

    # --- Internals ----------------------------------------------------------

    async def _load(self, customer_id: Optional[str]) -> Customer:
        if not customer_id:
            raise InvalidToken()
        try:
            cid = uuid.UUID(customer_id)
        except (ValueError, TypeError):
            raise InvalidToken()
        customer = await self.uow.session.get(Customer, cid)
        if customer is None or not customer.is_active:
            raise UnauthorizedError()
        return customer

    async def _tokens(
        self, customer: Customer, *, family_id: uuid.UUID | None = None
    ) -> dict:
        claims = {
            "sub": str(customer.id),
            "scid": str(customer.service_center_id),
        }
        access = create_access_token(
            data={**claims, "type": _ACCESS},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        refresh = create_refresh_token(data={"sub": str(customer.id), "type": _REFRESH})
        family_id = family_id or uuid.uuid4()
        await register_refresh_token(
            self.uow.session,
            refresh,
            family_id,
            customer_id=customer.id,
        )
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "customer": {
                "id": str(customer.id),
                "full_name": customer.full_name,
                "service_center_id": str(customer.service_center_id),
            },
        }
