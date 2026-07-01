from __future__ import annotations
import uuid
from datetime import date, datetime
from typing import Optional, Sequence
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from app.models.appointment import Appointment, AppointmentStatus
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.base import TenantScopedRepository


class AppointmentRepository(TenantScopedRepository[Appointment]):
    def __init__(self, session, service_center_id: uuid.UUID):
        super().__init__(Appointment, session, service_center_id)

    # --- Read helpers with relations eagerly loaded (async-safe) ------------
    _DETAIL_OPTIONS = (
        selectinload(Appointment.customer),
        selectinload(Appointment.maintenance_rule),
        selectinload(Appointment.vehicle)
        .selectinload(Vehicle.vehicle_model)
        .selectinload(VehicleModel.brand),
    )

    async def get_with_slot(self, appointment_id: uuid.UUID) -> Optional[Appointment]:
        """Tenant-scoped fetch with the linked slot loaded (for cancel/reschedule)."""
        stmt = self._scope(
            select(Appointment).where(
                Appointment.id == appointment_id,
                Appointment.is_active == True,
            )
        ).options(selectinload(Appointment.slot))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_detailed(self, appointment_id: uuid.UUID) -> Optional[Appointment]:
        """Tenant-scoped fetch by id with customer + vehicle relations loaded."""
        stmt = self._scope(
            select(Appointment).where(
                Appointment.id == appointment_id,
                Appointment.is_active == True,
            )
        ).options(*self._DETAIL_OPTIONS)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_detailed(
        self,
        *,
        status: Optional[str] = None,
        on_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[Sequence[Appointment], int]:
        base = self._scope(select(Appointment).where(Appointment.is_active == True))
        if status:
            base = base.where(Appointment.status == status)
        if on_date:
            base = base.where(
                Appointment.appointment_date >= datetime.combine(on_date, datetime.min.time()),
                Appointment.appointment_date < datetime.combine(on_date, datetime.max.time()),
            )

        total = await self.session.scalar(select(func.count()).select_from(base.subquery()))

        stmt = (
            base.order_by(Appointment.appointment_date.desc(), Appointment.appointment_time)
            .offset(skip)
            .limit(limit)
            .options(*self._DETAIL_OPTIONS)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all(), total or 0

    async def list_in_range(self, start: datetime, end: datetime) -> Sequence[Appointment]:
        """Non-cancelled appointments in [start, end), detailed — for the calendar."""
        stmt = self._scope(
            select(Appointment).where(
                Appointment.is_active == True,
                Appointment.appointment_date >= start,
                Appointment.appointment_date < end,
                Appointment.status != AppointmentStatus.CANCELLED,
            )
        ).options(*self._DETAIL_OPTIONS).order_by(
            Appointment.appointment_date, Appointment.appointment_time
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_by_date(self, service_center_id: uuid.UUID, appointment_date: date) -> Sequence[Appointment]:
        stmt = select(Appointment).where(
            Appointment.service_center_id == service_center_id,
            Appointment.appointment_date >= datetime.combine(appointment_date, datetime.min.time()),
            Appointment.appointment_date < datetime.combine(appointment_date, datetime.max.time()),
            Appointment.status.notin_([AppointmentStatus.CANCELLED]),
        ).order_by(Appointment.appointment_time)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_by_status(self, service_center_id: uuid.UUID, status: str) -> Sequence[Appointment]:
        stmt = select(Appointment).where(
            Appointment.service_center_id == service_center_id,
            Appointment.status == status,
            Appointment.is_active == True,
        ).order_by(Appointment.appointment_date)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_pending(self, service_center_id: uuid.UUID) -> Sequence[Appointment]:
        return await self.find_by_status(service_center_id, AppointmentStatus.PENDING)

    async def find_today(self, service_center_id: uuid.UUID) -> Sequence[Appointment]:
        today = date.today()
        stmt = select(Appointment).where(
            Appointment.service_center_id == service_center_id,
            Appointment.appointment_date >= datetime.combine(today, datetime.min.time()),
            Appointment.appointment_date < datetime.combine(today, datetime.max.time()),
            Appointment.status.in_([AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS]),
            Appointment.is_active == True,
        ).order_by(Appointment.appointment_time)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_by_customer(self, customer_id: uuid.UUID) -> Sequence[Appointment]:
        stmt = self._scope(
            select(Appointment).where(
                Appointment.customer_id == customer_id,
                Appointment.is_active == True,
            )
        ).order_by(Appointment.appointment_date.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_conflicting(
        self,
        service_center_id: uuid.UUID,
        appointment_date: datetime,
        appointment_time: str,
        duration_minutes: int,
        exclude_id: Optional[uuid.UUID] = None,
    ) -> Sequence[Appointment]:
        """Find appointments that overlap with the requested time slot."""
        stmt = select(Appointment).where(
            Appointment.service_center_id == service_center_id,
            Appointment.appointment_date == appointment_date,
            Appointment.appointment_time == appointment_time,
            Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED]),
            Appointment.is_active == True,
        )
        if exclude_id:
            stmt = stmt.where(Appointment.id != exclude_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_stats(self, service_center_id: uuid.UUID) -> dict:
        """Get appointment counts by status for dashboard."""
        today = date.today()
        statuses = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED,
                    AppointmentStatus.IN_PROGRESS, AppointmentStatus.COMPLETED,
                    AppointmentStatus.CANCELLED]
        stats = {}
        for status in statuses:
            count = await self.count(service_center_id=service_center_id, status=status)
            stats[status] = count
        # Today's appointments
        today_stmt = select(func.count()).select_from(Appointment).where(
            Appointment.service_center_id == service_center_id,
            Appointment.appointment_date >= datetime.combine(today, datetime.min.time()),
            Appointment.appointment_date < datetime.combine(today, datetime.max.time()),
        )
        today_count = await self.session.scalar(today_stmt)
        stats["today"] = today_count or 0
        return stats

    async def update_status(self, appointment_id: uuid.UUID, status: str, notes: Optional[str] = None) -> Optional[Appointment]:
        appointment = await self.get_by_id(appointment_id)
        if not appointment:
            return None
        appointment.status = status
        if notes:
            appointment.notes = notes
        await self.session.flush()
        await self.session.refresh(appointment)
        return appointment
