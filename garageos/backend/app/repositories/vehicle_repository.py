from __future__ import annotations
import uuid
from typing import Optional, Sequence
from sqlalchemy import select, or_
from app.models.vehicle import Vehicle
from app.repositories.base import BaseRepository


class VehicleRepository(BaseRepository[Vehicle]):
    def __init__(self, session):
        super().__init__(Vehicle, session)

    async def find_by_vin(self, vin: str) -> Optional[Vehicle]:
        stmt = select(Vehicle).where(
            Vehicle.vin == vin,
            Vehicle.is_active == True,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_customer(self, customer_id: uuid.UUID) -> Sequence[Vehicle]:
        stmt = select(Vehicle).where(
            Vehicle.customer_id == customer_id,
            Vehicle.is_active == True,
        ).order_by(Vehicle.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def update_mileage(self, vehicle_id: uuid.UUID, new_km: int) -> Optional[Vehicle]:
        vehicle = await self.get_by_id(vehicle_id)
        if not vehicle:
            return None
        vehicle.current_km = new_km
        await self.session.flush()
        await self.session.refresh(vehicle)
        return vehicle

    async def find_vehicles_due_for_service(
        self,
        service_center_id: uuid.UUID,
        rules: list,
        limit: int = 50,
    ) -> Sequence[Vehicle]:
        """Find vehicles where current_km is near or past maintenance intervals."""
        stmt = select(Vehicle).where(
            Vehicle.service_center_id == service_center_id,
            Vehicle.is_active == True,
        ).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def search(self, query: str, service_center_id: uuid.UUID) -> Sequence[Vehicle]:
        """Search vehicles by license plate, VIN, or customer name."""
        from app.models.customer import Customer as CustomerModel

        stmt = select(Vehicle).join(
            CustomerModel, Vehicle.customer_id == CustomerModel.id
        ).where(
            Vehicle.service_center_id == service_center_id,
            Vehicle.is_active == True,
            or_(
                Vehicle.license_plate.ilike(f"%{query}%"),
                Vehicle.vin.ilike(f"%{query}%"),
                CustomerModel.full_name.ilike(f"%{query}%"),
            ),
        ).limit(20)
        result = await self.session.execute(stmt)
        return result.scalars().all()
