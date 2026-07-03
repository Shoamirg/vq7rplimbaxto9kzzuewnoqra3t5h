"""Read/aggregation service behind the customer Mini App API.

Every method is bound to a single authenticated :class:`Customer` and only ever
returns that customer's own data. This is the strict boundary the design calls
for: the Mini App composes existing platform capabilities (vehicles, billing,
messages, cases) but can never reach another customer's — or the staff's — data.
"""
from __future__ import annotations

from sqlalchemy import func, select

from app.models.customer import Customer
from app.models.service_center import ServiceCenter
from app.models.vehicle import Vehicle
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.customer_portal import GarageIdentity, MeResponse


class CustomerPortalService:
    def __init__(self, uow: UnitOfWork, customer: Customer):
        self.uow = uow
        self.customer = customer

    async def me(self) -> MeResponse:
        session = self.uow.session
        vehicle_count = await session.scalar(
            select(func.count())
            .select_from(Vehicle)
            .where(
                Vehicle.customer_id == self.customer.id,
                Vehicle.is_active == True,  # noqa: E712
            )
        )
        center = await session.get(ServiceCenter, self.customer.service_center_id)

        return MeResponse(
            id=str(self.customer.id),
            full_name=self.customer.full_name,
            phone=self.customer.phone,
            email=self.customer.email,
            loyalty_points=self.customer.loyalty_points or 0,
            member_since=self.customer.created_at,
            vehicle_count=int(vehicle_count or 0),
            garage=self._garage(center),
        )

    @staticmethod
    def _garage(center: ServiceCenter | None) -> GarageIdentity:
        if center is None:  # defensive; a live customer always has a center
            return GarageIdentity(id="", name="GarageOS")
        return GarageIdentity(
            id=str(center.id),
            name=center.brand_name or center.name,
            tagline=center.tagline,
            phone=center.phone,
        )
