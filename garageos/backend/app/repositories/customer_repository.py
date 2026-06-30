from __future__ import annotations
import uuid
from typing import Optional, Sequence
from sqlalchemy import select, or_
from app.models.customer import Customer
from app.repositories.base import BaseRepository


class CustomerRepository(BaseRepository[Customer]):
    def __init__(self, session):
        super().__init__(Customer, session)

    async def find_by_telegram_id(self, telegram_id: int) -> Optional[Customer]:
        stmt = select(Customer).where(
            Customer.telegram_id == telegram_id,
            Customer.is_active == True,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_phone(self, phone: str) -> Optional[Customer]:
        stmt = select(Customer).where(
            Customer.phone == phone,
            Customer.is_active == True,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def search(
        self,
        service_center_id: uuid.UUID,
        query: str,
        limit: int = 20,
    ) -> Sequence[Customer]:
        stmt = select(Customer).where(
            Customer.service_center_id == service_center_id,
            Customer.is_active == True,
            or_(
                Customer.full_name.ilike(f"%{query}%"),
                Customer.phone.ilike(f"%{query}%"),
            ),
        ).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_with_vehicles(self, customer_id: uuid.UUID) -> Optional[Customer]:
        from sqlalchemy.orm import selectinload
        stmt = select(Customer).where(
            Customer.id == customer_id,
            Customer.is_active == True,
        ).options(selectinload(Customer.vehicles))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def add_loyalty_points(self, customer_id: uuid.UUID, points: int) -> Optional[Customer]:
        customer = await self.get_by_id(customer_id)
        if not customer:
            return None
        customer.loyalty_points = (customer.loyalty_points or 0) + points
        await self.session.flush()
        await self.session.refresh(customer)
        return customer
