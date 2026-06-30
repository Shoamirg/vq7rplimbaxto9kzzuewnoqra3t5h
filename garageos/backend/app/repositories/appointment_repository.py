from __future__ import annotations
import uuid
from datetime import date, datetime
from typing import Optional, Sequence
from sqlalchemy import select, func, and_
from app.models.appointment import Appointment, AppointmentStatus
from app.repositories.base import BaseRepository


class AppointmentRepository(BaseRepository[Appointment]):
    def __init__(self, session):
        super().__init__(Appointment, session)

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
        stmt = select(Appointment).where(
            Appointment.customer_id == customer_id,
            Appointment.is_active == True,
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
