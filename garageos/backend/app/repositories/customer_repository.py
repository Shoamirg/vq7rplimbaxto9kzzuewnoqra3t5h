from __future__ import annotations
import uuid
from typing import Optional, Sequence
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.customer import Customer
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.base import TenantScopedRepository


class CustomerRepository(TenantScopedRepository[Customer]):
    def __init__(self, session, service_center_id: uuid.UUID):
        super().__init__(Customer, session, service_center_id)

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
                or_(
                    Customer.full_name.ilike(f"%{query}%"),
                    Customer.phone.ilike(f"%{query}%"),
                ),
            )
        ).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_with_vehicles(self, customer_id: uuid.UUID) -> Optional[Customer]:
        stmt = self._scope(
            select(Customer).where(
                Customer.id == customer_id,
                Customer.is_active == True,
            )
        ).options(
            # Eager-load the full chain the serializer walks
            # (customer -> vehicles -> vehicle_model -> brand); otherwise
            # accessing v.vehicle_model.brand.name triggers a lazy load in the
            # async context and raises MissingGreenlet.
            selectinload(Customer.vehicles)
            .selectinload(Vehicle.vehicle_model)
            .selectinload(VehicleModel.brand)
        )
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
