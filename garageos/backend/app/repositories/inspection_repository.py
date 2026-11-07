from __future__ import annotations

import uuid
from typing import Optional, Sequence
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.models.inspection import (
    VehicleInspection,
    InspectionItem,
    InspectionStatus,
    InspectionRating,
    InspectionDecision,
)
from app.models.brand import Brand
from app.models.vehicle_model import VehicleModel
from app.models.vehicle import Vehicle
from app.models.customer import Customer
from app.models.appointment import Appointment
from app.repositories.base import TenantScopedRepository


class InspectionRepository(TenantScopedRepository[VehicleInspection]):
    def __init__(self, session, service_center_id: uuid.UUID):
        super().__init__(VehicleInspection, session, service_center_id)

    async def get_with_items(self, inspection_id: uuid.UUID) -> Optional[VehicleInspection]:
        """Tenant-scoped fetch with items, vehicle, and customer eagerly loaded."""
        stmt = self._scope(
            select(VehicleInspection).where(
                VehicleInspection.id == inspection_id,
                VehicleInspection.is_active == True,
            )
        ).options(
            selectinload(VehicleInspection.items),
            selectinload(VehicleInspection.vehicle)
            .selectinload(Vehicle.vehicle_model)
            .selectinload(VehicleModel.brand),
            selectinload(VehicleInspection.customer),
            selectinload(VehicleInspection.appointment),
            selectinload(VehicleInspection.inspector),
            selectinload(VehicleInspection.service_center),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_appointment(self, appointment_id: uuid.UUID) -> Optional[VehicleInspection]:
        """Tenant-scoped fetch by appointment ID."""
        stmt = self._scope(
            select(VehicleInspection).where(
                VehicleInspection.appointment_id == appointment_id,
                VehicleInspection.is_active == True,
            )
        ).options(
            selectinload(VehicleInspection.items),
            selectinload(VehicleInspection.vehicle),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_vehicle(self, vehicle_id: uuid.UUID) -> Sequence[VehicleInspection]:
        """Tenant-scoped list of inspections for a specific vehicle."""
        stmt = self._scope(
            select(VehicleInspection).where(
                VehicleInspection.vehicle_id == vehicle_id,
                VehicleInspection.is_active == True,
            )
        ).options(
            selectinload(VehicleInspection.items),
        ).order_by(VehicleInspection.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_recent(self, limit: int = 50) -> Sequence[VehicleInspection]:
        """Tenant-scoped list of recent inspections."""
        stmt = self._scope(
            select(VehicleInspection).where(VehicleInspection.is_active == True)
        ).options(
            selectinload(VehicleInspection.items),
            selectinload(VehicleInspection.vehicle),
            selectinload(VehicleInspection.customer),
        ).order_by(VehicleInspection.created_at.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def get_by_token_global(session, token: str) -> Optional[VehicleInspection]:
        """Global unauthenticated lookup by unguessable public token."""
        stmt = select(VehicleInspection).where(
            VehicleInspection.public_token == token,
            VehicleInspection.is_active == True,
        ).options(
            selectinload(VehicleInspection.items),
            selectinload(VehicleInspection.vehicle)
            .selectinload(Vehicle.vehicle_model)
            .selectinload(VehicleModel.brand),
            selectinload(VehicleInspection.customer),
            selectinload(VehicleInspection.service_center),
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
