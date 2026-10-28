"""Which workshops a customer may see.

The rule is decided by *who registered the customer*, never by where they later
service their car:

  * registered by staff of a workshop in an **exclusive** network → only that
    network's workshops (a brand dealer keeps its clients inside the brand);
  * anyone else (self-registered, or registered by an independent / non-exclusive
    workshop) → every active workshop on the platform.

The lock is derived live from the home workshop's network, so moving a workshop
into or out of an exclusive network re-scopes its customers without a data
migration.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Customer, ServiceCenter


def locked_network_id(customer: Customer, home: ServiceCenter | None) -> uuid.UUID | None:
    """The network a customer is confined to, or ``None`` when they may see everything."""
    if customer.registered_via != "workshop" or home is None or home.network is None:
        return None
    return home.network_id if home.network.is_exclusive else None


@dataclass(frozen=True)
class WorkshopScope:
    network_id: uuid.UUID | None   # None = unrestricted
    workshops: tuple[ServiceCenter, ...]


async def visible_workshops(session: AsyncSession, customer: Customer) -> WorkshopScope:
    home = await session.scalar(select(ServiceCenter).options(selectinload(ServiceCenter.network))
                                .where(ServiceCenter.id == customer.service_center_id))
    query = (select(ServiceCenter).options(selectinload(ServiceCenter.network))
             .where(ServiceCenter.is_active.is_(True)))
    network_id = locked_network_id(customer, home)
    if network_id is not None:
        query = query.where(ServiceCenter.network_id == network_id)
    rows = (await session.scalars(query.order_by(ServiceCenter.name, ServiceCenter.id))).unique().all()
    return WorkshopScope(network_id=network_id, workshops=tuple(rows))
