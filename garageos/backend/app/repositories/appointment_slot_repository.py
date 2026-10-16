from __future__ import annotations
import uuid
from datetime import date, datetime, timezone, timedelta
from typing import Sequence
from sqlalchemy import select, func, and_
from app.models.appointment_slot import AppointmentSlot, AppointmentSlotStatus
from app.repositories.base import TenantScopedRepository
from app.repositories.scheduling import slot_has_conflict
from app.core.timezone import local_day_bounds, service_center_timezone


class AppointmentSlotRepository(TenantScopedRepository[AppointmentSlot]):
    def __init__(self, session, service_center_id: uuid.UUID):
        super().__init__(AppointmentSlot, session, service_center_id)

    async def find_available(
        self,
        service_center_id: uuid.UUID,
        slot_date: date,
    ) -> Sequence[AppointmentSlot]:
        zone_name = await service_center_timezone(self.session, service_center_id)
        day_start, day_end = local_day_bounds(slot_date, zone_name)
        stmt = select(AppointmentSlot).where(
            AppointmentSlot.service_center_id == service_center_id,
            AppointmentSlot.slot_date >= day_start,
            AppointmentSlot.slot_date < day_end,
            AppointmentSlot.status == AppointmentSlotStatus.AVAILABLE,
            AppointmentSlot.is_active.is_(True),
            ~slot_has_conflict(),
        ).order_by(AppointmentSlot.start_time)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_in_range(
        self,
        start: datetime,
        end: datetime,
        statuses: Sequence[str] | None = None,
        available_only: bool = False,
    ) -> Sequence[AppointmentSlot]:
        stmt = self._scope(
            select(AppointmentSlot).where(
                AppointmentSlot.slot_date >= start,
                AppointmentSlot.slot_date < end,
                AppointmentSlot.is_active.is_(True),
            )
        )
        if statuses:
            stmt = stmt.where(AppointmentSlot.status.in_(list(statuses)))
        if available_only:
            stmt = stmt.where(AppointmentSlot.status == AppointmentSlotStatus.AVAILABLE, ~slot_has_conflict())
        stmt = stmt.order_by(AppointmentSlot.slot_date, AppointmentSlot.start_time)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_by_date(
        self,
        service_center_id: uuid.UUID,
        slot_date: date,
    ) -> Sequence[AppointmentSlot]:
        zone_name = await service_center_timezone(self.session, service_center_id)
        day_start, day_end = local_day_bounds(slot_date, zone_name)
        stmt = select(AppointmentSlot).where(
            AppointmentSlot.service_center_id == service_center_id,
            AppointmentSlot.slot_date >= day_start,
            AppointmentSlot.slot_date < day_end,
        ).order_by(AppointmentSlot.start_time)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def release_expired(self) -> int:
        """Release slots where the temporary reservation has expired.

        Scoped to this tenant — a release sweep must never touch other tenants.
        """
        now = datetime.now(timezone.utc)
        stmt = self._scope(
            select(AppointmentSlot).where(
                AppointmentSlot.status == AppointmentSlotStatus.RESERVED,
                AppointmentSlot.reserved_until < now,
            )
        )
        result = await self.session.execute(stmt)
        expired = result.scalars().all()

        for slot in expired:
            slot.status = AppointmentSlotStatus.AVAILABLE
            slot.reserved_until = None
            slot.appointment_id = None

        await self.session.flush()
        return len(expired)

    async def count_by_status(
        self,
        service_center_id: uuid.UUID,
        slot_date: date,
    ) -> dict:
        """Get counts of slots by status for a given date."""
        zone_name = await service_center_timezone(self.session, service_center_id)
        day_start, day_end = local_day_bounds(slot_date, zone_name)
        statuses = [
            AppointmentSlotStatus.AVAILABLE,
            AppointmentSlotStatus.RESERVED,
            AppointmentSlotStatus.BOOKED,
            AppointmentSlotStatus.BLOCKED,
        ]
        counts = {}
        for status in statuses:
            stmt = select(func.count()).select_from(AppointmentSlot).where(
                AppointmentSlot.service_center_id == service_center_id,
                AppointmentSlot.slot_date >= day_start,
                AppointmentSlot.slot_date < day_end,
                AppointmentSlot.status == status,
            )
            count = await self.session.scalar(stmt)
            counts[status] = count or 0
        return counts
