from __future__ import annotations
import uuid
from typing import Optional, Sequence
from sqlalchemy import select
from app.models.service_record import ServiceRecord
from app.repositories.base import TenantScopedRepository


class ServiceRecordRepository(TenantScopedRepository[ServiceRecord]):
    def __init__(self, session, service_center_id: uuid.UUID):
        super().__init__(ServiceRecord, session, service_center_id)

    async def find_by_vehicle(self, vehicle_id: uuid.UUID) -> Sequence[ServiceRecord]:
        stmt = self._scope(
            select(ServiceRecord).where(
                ServiceRecord.vehicle_id == vehicle_id,
                ServiceRecord.is_active == True,
            )
        ).order_by(ServiceRecord.performed_date.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_by_service_type(self, vehicle_id: uuid.UUID, service_type: str) -> Optional[ServiceRecord]:
        stmt = self._scope(
            select(ServiceRecord).where(
                ServiceRecord.vehicle_id == vehicle_id,
                ServiceRecord.service_type == service_type,
                ServiceRecord.is_active == True,
            )
        ).order_by(ServiceRecord.performed_date.desc()).limit(1)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_appointment(self, appointment_id: uuid.UUID) -> Optional[ServiceRecord]:
        stmt = self._scope(
            select(ServiceRecord).where(
                ServiceRecord.appointment_id == appointment_id,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_by_customer(self, customer_id: uuid.UUID) -> Sequence[ServiceRecord]:
        from app.models.vehicle import Vehicle
        stmt = self._scope(
            select(ServiceRecord).join(
                Vehicle, ServiceRecord.vehicle_id == Vehicle.id
            ).where(
                Vehicle.customer_id == customer_id,
                ServiceRecord.is_active == True,
            )
        ).order_by(ServiceRecord.performed_date.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()
