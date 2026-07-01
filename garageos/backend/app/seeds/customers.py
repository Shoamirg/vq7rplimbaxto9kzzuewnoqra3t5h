"""Generate demo customers for a service center."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, ServiceCenter
from app.seeds.base import email_for, full_name, phone, rng

# Base offset for synthetic, collision-free telegram ids.
_TELEGRAM_BASE = 100_000_000


async def generate_customers(
    session: AsyncSession,
    service_center: ServiceCenter,
    count: int,
    *,
    telegram_id_start: int = _TELEGRAM_BASE,
) -> list[Customer]:
    customers: list[Customer] = []
    for i in range(count):
        name = full_name()
        # ~60% of customers are linked to Telegram (the bot channel).
        has_telegram = rng.random() < 0.6
        customer = Customer(
            service_center_id=service_center.id,
            full_name=name,
            phone=phone(),
            email=email_for(name) if rng.random() < 0.7 else None,
            telegram_id=(telegram_id_start + i) if has_telegram else None,
            telegram_username=(
                name.lower().replace(" ", "_") if has_telegram else None
            ),
            loyalty_points=rng.choice([0, 0, 50, 100, 150, 250, 500]),
            notes=None,
        )
        customers.append(customer)
    session.add_all(customers)
    await session.flush()
    return customers
