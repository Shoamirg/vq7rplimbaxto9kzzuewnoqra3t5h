from __future__ import annotations
import uuid
import re
from typing import Optional, Sequence
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.customer import Customer
from app.repositories.base import TenantScopedRepository


class CustomerRepository(TenantScopedRepository[Customer]):
    def __init__(self, session, service_center_id: uuid.UUID):
        super().__init__(Customer, session, service_center_id)

    @staticmethod
    def _search_filter(query: str):
        matches = [Customer.full_name.ilike(f"%{query}%"), Customer.phone.ilike(f"%{query}%"),
                   Customer.email.ilike(f"%{query}%")]
        if re.fullmatch(r"[+0-9\s()-]+", query):
            digits = re.sub(r"\D", "", query)
            if len(digits) >= 3:
                matches.append(func.regexp_replace(Customer.phone, r"\D", "", "g").ilike(f"%{digits}%"))
        return or_(*matches)

    @staticmethod
    async def find_by_telegram_id(session: AsyncSession, telegram_id: int) -> Optional[Customer]:
        """GLOBAL identity lookup (crosses tenants by design).

        A Telegram user maps to a customer in *some* tenant; this is the bot's
        entry point that establishes which tenant to operate in. Deliberately
        not tenant-scoped — callers must treat the result as the tenant boundary.
        """
        stmt = select(Customer).where(
            Customer.telegram_id == telegram_id,
            Customer.is_active == True,
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_phone(self, phone: str) -> Optional[Customer]:
        stmt = self._scope(
            select(Customer).where(
                Customer.phone == phone,
                Customer.is_active == True,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def search(
        self,
        query: str,
        limit: int = 20,
    ) -> Sequence[Customer]:
        stmt = self._scope(
            select(Customer).where(
                Customer.is_active == True,
                self._search_filter(query),
            )
        ).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_by_normalized_phone(self, digits: str) -> Optional[Customer]:
        stmt = self._scope(select(Customer).where(
            Customer.is_active.is_(True),
            func.regexp_replace(Customer.phone, r"\D", "", "g") == digits,
        )).limit(1)
        return (await self.session.execute(stmt)).scalars().first()

    async def search_page(self, query: str, limit: int, offset: int):
        """Search the whole tenant before pagination with stable alphabetical order."""
        filters = [Customer.is_active.is_(True), Customer.service_center_id == self.service_center_id]
        if query:
            filters.append(self._search_filter(query))
        total = await self.session.scalar(select(func.count()).select_from(Customer).where(*filters))
        stmt = (select(Customer).where(*filters).order_by(Customer.full_name, Customer.id)
                .offset(offset).limit(limit))
        return (await self.session.execute(stmt)).scalars().all(), total or 0

    async def find_with_vehicles(self, customer_id: uuid.UUID) -> Optional[Customer]:
        stmt = self._scope(
            select(Customer).where(
                Customer.id == customer_id,
                Customer.is_active == True,
            )
        ).options(selectinload(Customer.vehicles))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def add_loyalty_points(self, customer_id: uuid.UUID, points: int) -> Optional[Customer]:
        customer = await self.get_by_id(customer_id)  # tenant-scoped
        if not customer:
            return None
        customer.loyalty_points = (customer.loyalty_points or 0) + points
        await self.session.flush()
        await self.session.refresh(customer)
        return customer
