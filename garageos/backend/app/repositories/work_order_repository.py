"""Tenant-scoped queries for work orders."""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.models.appointment import Appointment
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.models.work_order import WorkOrder
from app.repositories.base import TenantScopedRepository


class WorkOrderRepository(TenantScopedRepository[WorkOrder]):
    def __init__(self, session, service_center_id: uuid.UUID):
        super().__init__(WorkOrder, session, service_center_id)

    def _detailed(self, statement):
        return statement.options(
            selectinload(WorkOrder.customer),
            selectinload(WorkOrder.vehicle)
            .selectinload(Vehicle.vehicle_model)
            .selectinload(VehicleModel.brand),
            selectinload(WorkOrder.assigned_mechanic),
            selectinload(WorkOrder.created_by),
            selectinload(WorkOrder.service_record),
        )

    async def find_by_idempotency_key(self, key: str) -> WorkOrder | None:
        stmt = self._scope(select(WorkOrder).where(
            WorkOrder.idempotency_key == key,
            WorkOrder.is_active == True,
        ))
        return (await self.session.execute(self._detailed(stmt))).scalar_one_or_none()

    async def find_by_appointment(self, appointment_id: uuid.UUID) -> WorkOrder | None:
        stmt = self._scope(select(WorkOrder).where(
            WorkOrder.appointment_id == appointment_id,
            WorkOrder.is_active == True,
        ))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_detailed(self, work_order_id: uuid.UUID) -> WorkOrder | None:
        stmt = self._scope(select(WorkOrder).where(
            WorkOrder.id == work_order_id,
            WorkOrder.is_active == True,
        ))
        return (await self.session.execute(self._detailed(stmt))).scalar_one_or_none()

    async def list_work_orders(
        self,
        *,
        skip: int,
        limit: int,
        status: str | None = None,
        assigned_mechanic_user_id: uuid.UUID | None = None,
    ) -> tuple[list[WorkOrder], int]:
        conditions = [WorkOrder.is_active == True, WorkOrder.service_center_id == self.service_center_id]
        if status:
            conditions.append(WorkOrder.status == status)
        if assigned_mechanic_user_id is not None:
            conditions.append(WorkOrder.assigned_mechanic_user_id == assigned_mechanic_user_id)

        total = await self.session.scalar(select(func.count()).select_from(WorkOrder).where(*conditions))
        stmt = select(WorkOrder).where(*conditions).order_by(
            WorkOrder.created_at.desc(), WorkOrder.id.desc()
        ).offset(skip).limit(limit)
        rows = (await self.session.execute(self._detailed(stmt))).scalars().all()
        return list(rows), int(total or 0)


async def get_appointment_for_update(session, service_center_id: uuid.UUID, appointment_id: uuid.UUID) -> Appointment | None:
    """Lock a tenant-owned appointment while linking a work order to it."""
    statement = select(Appointment).where(
        Appointment.id == appointment_id,
        Appointment.service_center_id == service_center_id,
        Appointment.is_active == True,
    ).with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def get_user_for_tenant(session, service_center_id: uuid.UUID, user_id: uuid.UUID) -> User | None:
    """Return one active tenant user with its role loaded."""
    from sqlalchemy.orm import joinedload

    statement = select(User).where(
        User.id == user_id,
        User.service_center_id == service_center_id,
        User.is_active == True,
    ).options(joinedload(User.role))
    return (await session.execute(statement)).scalar_one_or_none()
