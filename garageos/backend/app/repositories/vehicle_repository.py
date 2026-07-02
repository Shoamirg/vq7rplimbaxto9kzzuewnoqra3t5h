from __future__ import annotations
import uuid
from typing import Optional, Sequence
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.base import TenantScopedRepository


class VehicleRepository(TenantScopedRepository[Vehicle]):
    def __init__(self, session, service_center_id: uuid.UUID):
        super().__init__(Vehicle, session, service_center_id)

    async def get_with_model(self, vehicle_id: uuid.UUID) -> Optional[Vehicle]:
        """Tenant-scoped fetch with model+brand and customer eagerly loaded."""
        stmt = self._scope(
            select(Vehicle).where(
                Vehicle.id == vehicle_id,
                Vehicle.is_active == True,
            )
        ).options(
            selectinload(Vehicle.vehicle_model).selectinload(VehicleModel.brand),
            selectinload(Vehicle.customer),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_active(self, limit: int = 500) -> Sequence[Vehicle]:
        """Active vehicles for this tenant, model+brand+customer loaded (fleet views)."""
        stmt = self._scope(
            select(Vehicle).where(Vehicle.is_active == True)
        ).options(
            selectinload(Vehicle.vehicle_model).selectinload(VehicleModel.brand),
            selectinload(Vehicle.customer),
        ).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_by_vin(self, vin: str) -> Optional[Vehicle]:
        stmt = self._scope(
            select(Vehicle).where(
                Vehicle.vin == vin,
                Vehicle.is_active == True,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_customer(self, customer_id: uuid.UUID) -> Sequence[Vehicle]:
        stmt = self._scope(
            select(Vehicle).where(
                Vehicle.customer_id == customer_id,
                Vehicle.is_active == True,
            )
        ).order_by(Vehicle.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def update_mileage(self, vehicle_id: uuid.UUID, new_km: int) -> Optional[Vehicle]:
        vehicle = await self.get_by_id(vehicle_id)  # tenant-scoped
        if not vehicle:
            return None
        vehicle.current_km = new_km
        await self.session.flush()
        await self.session.refresh(vehicle)
        return vehicle

    async def find_vehicles_due_for_service(
        self,
        rules: list,
        limit: int = 50,
    ) -> Sequence[Vehicle]:
        """Find vehicles where current_km is near or past maintenance intervals."""
        stmt = self._scope(
            select(Vehicle).where(Vehicle.is_active == True)
        ).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def search(self, query: str, limit: int = 20) -> Sequence[Vehicle]:
        """Search vehicles by license plate, VIN, or customer name."""
        from app.models.customer import Customer as CustomerModel

        stmt = self._scope(
            select(Vehicle).join(
                CustomerModel, Vehicle.customer_id == CustomerModel.id
            ).where(
                Vehicle.is_active == True,
                or_(
                    Vehicle.license_plate.ilike(f"%{query}%"),
                    Vehicle.vin.ilike(f"%{query}%"),
                    CustomerModel.full_name.ilike(f"%{query}%"),
                ),
            )
        ).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()
