from __future__ import annotations
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Sequence
from sqlalchemy import literal, select, func, and_, or_, text
from sqlalchemy.orm import selectinload
from app.models.appointment import Appointment, AppointmentStatus
from app.models.brand import Brand
from app.models.customer import Customer
from app.models.maintenance_rule import MaintenanceRule
from app.models.invoice import Invoice, InvoiceKind
from app.models.service_record import ServiceRecord
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.base import TenantScopedRepository
from app.repositories.scheduling import appointment_start
from app.core.timezone import local_date_for_instant, local_day_bounds, service_center_timezone


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

    async def _day_bounds(self, day: date) -> tuple[datetime, datetime]:
        zone_name = await service_center_timezone(self.session, self.service_center_id)
        return local_day_bounds(day, zone_name)

    async def get_with_slot(self, appointment_id: uuid.UUID, *, for_update: bool = False) -> Optional[Appointment]:
        """Tenant-scoped fetch with the linked slot loaded (for cancel/reschedule)."""
        stmt = self._scope(
            select(Appointment).where(
                Appointment.id == appointment_id,
                Appointment.is_active == True,
            )
        ).options(selectinload(Appointment.slot))
        if for_update:
            stmt = stmt.with_for_update(of=Appointment).execution_options(populate_existing=True)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_detailed(self, appointment_id: uuid.UUID, *, for_update: bool = False) -> Optional[Appointment]:
        """Tenant-scoped fetch by id with customer + vehicle relations loaded."""
        stmt = self._scope(
            select(Appointment).where(
                Appointment.id == appointment_id,
                Appointment.is_active == True,
                # A tenant-owned appointment can contain a legacy/corrupt child
                # FK to another tenant. Do not load and serialize that record's
                # customer or vehicle labels through this detail endpoint. Keep
                # local inactive and transferred history readable: ownership,
                # not current active/customer assignment, is the read boundary.
                Appointment.customer.has(Customer.service_center_id == self.service_center_id),
                Appointment.vehicle.has(Vehicle.service_center_id == self.service_center_id),
            )
        ).options(*self._DETAIL_OPTIONS, selectinload(Appointment.slot))
        if for_update:
            stmt = stmt.with_for_update(of=Appointment).execution_options(populate_existing=True)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_detailed(
        self,
        *,
        status: Optional[str] = None,
        on_date: Optional[date] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        overdue: bool = False,
        awaiting_invoice: bool = False,
        q: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
        mechanic_user_id: Optional[uuid.UUID] = None,
    ) -> tuple[Sequence[Appointment], int]:
        base = self._scope(select(Appointment).where(Appointment.is_active == True))
        if mechanic_user_id is not None:
            base = base.where(Appointment.mechanic_user_id == mechanic_user_id)
        if status:
            base = base.where(Appointment.status == status)
        if awaiting_invoice:
            final_invoice = select(Invoice.id).where(
                Invoice.appointment_id == Appointment.id,
                Invoice.service_center_id == Appointment.service_center_id,
                Invoice.kind == InvoiceKind.INVOICE,
                Invoice.is_active.is_(True),
            ).exists()
            base = base.where(Appointment.status == AppointmentStatus.COMPLETED, ~final_invoice)
        zone_name = None
        if on_date or date_from or date_to or overdue:
            zone_name = await service_center_timezone(self.session, self.service_center_id)
        if on_date:
            day_start, day_end = local_day_bounds(on_date, zone_name)
            base = base.where(Appointment.appointment_date >= day_start,
                              Appointment.appointment_date < day_end)
        if date_from:
            day_start, _ = local_day_bounds(date_from, zone_name)
            base = base.where(Appointment.appointment_date >= day_start)
        if date_to:
            _, day_end = local_day_bounds(date_to, zone_name)
            base = base.where(Appointment.appointment_date < day_end)
        if overdue:
            # Past its date and still needing work — the operational "chase list".
            today = local_date_for_instant(datetime.now(timezone.utc), zone_name)
            today_start, _ = local_day_bounds(today, zone_name)
            base = base.where(
                Appointment.appointment_date < today_start,
                Appointment.status.in_([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
            )
        if q and q.strip():
            pattern = f"%{q.strip()}%"
            base = base.where(or_(
                Appointment.customer.has(Customer.full_name.ilike(pattern)),
                Appointment.vehicle.has(or_(
                    Vehicle.license_plate.ilike(pattern),
                    Vehicle.vin.ilike(pattern),
                    Vehicle.vehicle_model.has(or_(
                        VehicleModel.name.ilike(pattern),
                        VehicleModel.brand.has(Brand.name.ilike(pattern)),
                    )),
                )),
                Appointment.maintenance_rule.has(MaintenanceRule.service_type.ilike(pattern)),
                select(ServiceRecord.id).where(
                    ServiceRecord.service_center_id == self.service_center_id,
                    ServiceRecord.appointment_id == Appointment.id,
                    ServiceRecord.service_type.ilike(pattern),
                    ServiceRecord.is_active.is_(True),
                ).exists(),
            ))

        total = await self.session.scalar(select(func.count()).select_from(base.subquery()))

        stmt = (
            base.order_by(Appointment.appointment_date.desc(), Appointment.appointment_time, Appointment.id.desc())
            .offset(skip)
            .limit(limit)
            .options(*self._DETAIL_OPTIONS)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all(), total or 0

    async def list_in_range(self, start: datetime, end: datetime, *, include_cancelled: bool = False) -> Sequence[Appointment]:
        """Active appointments in [start, end); cancelled records are opt-in."""
        stmt = self._scope(
            select(Appointment).where(
                Appointment.is_active == True,
                Appointment.appointment_date >= start,
                Appointment.appointment_date < end,
            )
        ).options(*self._DETAIL_OPTIONS).order_by(
            Appointment.appointment_date, Appointment.appointment_time
        )
        if not include_cancelled:
            stmt = stmt.where(Appointment.status != AppointmentStatus.CANCELLED)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def find_by_date(self, service_center_id: uuid.UUID, appointment_date: date) -> Sequence[Appointment]:
        zone_name = await service_center_timezone(self.session, service_center_id)
        day_start, day_end = local_day_bounds(appointment_date, zone_name)
        stmt = select(Appointment).where(
            Appointment.service_center_id == service_center_id,
            Appointment.appointment_date >= day_start,
            Appointment.appointment_date < day_end,
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
        zone_name = await service_center_timezone(self.session, service_center_id)
        today = local_date_for_instant(datetime.now(timezone.utc), zone_name)
        day_start, day_end = local_day_bounds(today, zone_name)
        stmt = select(Appointment).where(
            Appointment.service_center_id == service_center_id,
            Appointment.appointment_date >= day_start,
            Appointment.appointment_date < day_end,
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

    async def find_by_vehicle(self, vehicle_id: uuid.UUID) -> Sequence[Appointment]:
        stmt = self._scope(
            select(Appointment).where(
                Appointment.vehicle_id == vehicle_id,
                Appointment.is_active == True,
            )
        ).order_by(Appointment.appointment_date.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def lock_schedule(self) -> None:
        """Serialize schedule writes inside this tenant's transaction.

        Locking only existing appointments leaves the empty-interval race open:
        two receptionists can both see no conflict and insert at the same time.
        Acquire this lock before any appointment row lock, consistently.
        """
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:schedule_key, 0))"),
            {"schedule_key": f"garageos:schedule:{self.service_center_id}"},
        )

    async def find_conflicting(
        self,
        service_center_id: uuid.UUID,
        appointment_date: datetime,
        appointment_time: str,
        duration_minutes: int,
        exclude_id: Optional[uuid.UUID] = None,
        mechanic_name: Optional[str] = None,
        mechanic_user_id: Optional[uuid.UUID] = None,
    ) -> Sequence[Appointment]:
        """Half-open intervals: adjacent jobs and different mechanics may coexist."""
        if not mechanic_name or not mechanic_name.strip():
            return []  # Unassigned visits consume no named mechanic's time yet.
        zone_name = await service_center_timezone(self.session, service_center_id)
        requested_day = local_date_for_instant(appointment_date, zone_name)
        requested_start = datetime.combine(
            requested_day, datetime.strptime(appointment_time, "%H:%M").time()
        )
        requested_end = requested_start + timedelta(minutes=duration_minutes)
        # appointment_time is canonical; date-only legacy rows must also work.
        starts_at = appointment_start()
        ends_at = starts_at + Appointment.estimated_duration_minutes * literal(timedelta(minutes=1))
        name_matches = func.lower(func.trim(Appointment.mechanic_name)) == mechanic_name.strip().lower()
        mechanic_matches = name_matches if mechanic_user_id is None else or_(
            Appointment.mechanic_user_id == mechanic_user_id,
            and_(Appointment.mechanic_user_id.is_(None), name_matches),
        )
        stmt = self._scope(select(Appointment)).where(
            Appointment.service_center_id == service_center_id,
            mechanic_matches,
            starts_at < requested_end,
            ends_at > requested_start,
            Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED]),
            Appointment.is_active == True,
        )
        if exclude_id:
            stmt = stmt.where(Appointment.id != exclude_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_stats(self, service_center_id: uuid.UUID) -> dict:
        """Get appointment counts by status for dashboard."""
        zone_name = await service_center_timezone(self.session, service_center_id)
        today = local_date_for_instant(datetime.now(timezone.utc), zone_name)
        day_start, day_end = local_day_bounds(today, zone_name)
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
            Appointment.is_active.is_(True),
            Appointment.appointment_date >= day_start,
            Appointment.appointment_date < day_end,
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
