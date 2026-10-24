from __future__ import annotations
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional, Sequence
from sqlalchemy import select

from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.appointment_slot_repository import AppointmentSlotRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.service_record_repository import ServiceRecordRepository
from app.repositories.user_repository import UserRepository
from app.repositories.unit_of_work import UnitOfWork
from app.services.maintenance_service import MaintenanceService
from app.models.appointment import AppointmentStatus
from app.models.invoice import Invoice, InvoiceKind
from app.models.appointment_slot import AppointmentSlot, AppointmentSlotStatus
from app.core.events import AppointmentCreated, AppointmentConfirmed, AppointmentStarted, \
    AppointmentCompleted, AppointmentCancelled, MileageUpdated
from app.core.timezone import (
    local_date_for_instant,
    local_day_bounds,
    local_datetime_to_utc,
    service_center_timezone,
)
from app.exceptions import (
    AppointmentNotFound, SlotUnavailable, AppointmentConflict, AppointmentStateError,
    VehicleNotFound, CustomerNotFound, UserNotFound, ValidationError,
)


def serialize_appointment(a, timezone_name: str = "UTC") -> dict:
    """Flatten an Appointment ORM row (with customer + vehicle eagerly loaded)
    into a JSON-friendly dict for API responses."""
    vm = a.vehicle.vehicle_model if a.vehicle else None
    brand = vm.brand.name if vm and getattr(vm, "brand", None) else ""
    model = vm.name if vm else ""
    plate = a.vehicle.license_plate if a.vehicle else None
    vehicle_summary = f"{brand} {model}".strip()
    if plate:
        vehicle_summary = f"{vehicle_summary} ({plate})".strip()
    return {
        "id": str(a.id),
        "customer_id": str(a.customer_id),
        "customer_name": a.customer.full_name if a.customer else "",
        "vehicle_id": str(a.vehicle_id),
        "vehicle_summary": vehicle_summary,
        "appointment_date": a.appointment_date.isoformat(),
        "appointment_local_date": local_date_for_instant(a.appointment_date, timezone_name).isoformat(),
        "appointment_time": a.appointment_time,
        "mechanic_name": a.mechanic_name,
        "mechanic_user_id": str(a.mechanic_user_id) if a.mechanic_user_id else None,
        "status": a.status,
        "customer_notes": a.customer_notes,
        "notes": a.notes,
        # service_type is derived from the linked maintenance rule (canonical
        # source) — Appointment has no service_type column of its own.
        "maintenance_rule_id": str(a.maintenance_rule_id) if a.maintenance_rule_id else None,
        "service_type": a.maintenance_rule.service_type if a.maintenance_rule else None,
        "estimated_duration_minutes": a.estimated_duration_minutes,
        "total_cost": a.total_cost,
    }


class AppointmentService:
    """Manages appointment lifecycle: book → confirm → start → complete."""

    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        sc = uow.service_center_id
        self.appointment_repo = AppointmentRepository(uow.session, sc)
        self.slot_repo = AppointmentSlotRepository(uow.session, sc)
        self.vehicle_repo = VehicleRepository(uow.session, sc)
        self.customer_repo = CustomerRepository(uow.session, sc)
        self.service_record_repo = ServiceRecordRepository(uow.session, sc)

    async def _check_schedule(self, when, time, duration, mechanic, *, exclude_id=None, mechanic_user_id=None):
        conflicts = await self.appointment_repo.find_conflicting(
            self.uow.service_center_id, when, time, duration,
            exclude_id=exclude_id, mechanic_name=mechanic, mechanic_user_id=mechanic_user_id,
        )
        if conflicts:
            raise AppointmentConflict()

    async def timezone_name(self) -> str:
        return await service_center_timezone(self.uow.session, self.uow.service_center_id)

    async def generate_slots(
        self,
        service_center_id: uuid.UUID,
        slot_date: date,
        start_hour: int = 9,
        end_hour: int = 18,
        slot_duration_minutes: int = 30,
        mechanic_names: Optional[List[str]] = None,
    ) -> List[dict]:
        """Pre-generate available time slots for a given date."""
        zone_name = await self.timezone_name()
        mechanics = mechanic_names or [None]
        await self.appointment_repo.lock_schedule()
        created = []

        for mechanic in mechanics:
            current = datetime.combine(slot_date, datetime.min.time().replace(hour=start_hour))
            end = datetime.combine(slot_date, datetime.min.time().replace(hour=end_hour))

            while current + timedelta(minutes=slot_duration_minutes) <= end:
                start_str = current.strftime("%H:%M")
                end_str = (current + timedelta(minutes=slot_duration_minutes)).strftime("%H:%M")

                slot = await self.slot_repo.create(
                    service_center_id=service_center_id,
                    mechanic_name=mechanic,
                    slot_date=local_datetime_to_utc(slot_date, start_str, zone_name),
                    start_time=start_str,
                    end_time=end_str,
                    duration_minutes=slot_duration_minutes,
                    status=AppointmentSlotStatus.AVAILABLE,
                )
                created.append({
                    "id": str(slot.id),
                    "time": start_str,
                    "mechanic": mechanic,
                    "duration": slot_duration_minutes,
                })
                current += timedelta(minutes=slot_duration_minutes)

        return created

    async def get_available_slots(
        self,
        service_center_id: uuid.UUID,
        slot_date: date,
    ) -> List[dict]:
        slots = await self.slot_repo.find_available(service_center_id, slot_date)
        return [
            {
                "id": str(s.id),
                "time": s.start_time,
                "end_time": s.end_time,
                "mechanic": s.mechanic_name,
                "duration": s.duration_minutes,
            }
            for s in slots
        ]

    async def create_appointment(
        self,
        *,
        customer_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        slot_id: uuid.UUID,
        maintenance_rule_id: Optional[uuid.UUID] = None,
        customer_notes: Optional[str] = None,
    ) -> dict:
        """Book an appointment against an available slot. Thin: all rules here.

        Tenant is taken from the UoW; every repo lookup is tenant-scoped, so a
        customer/vehicle/slot id from another tenant simply won't be found.
        """
        sc = self.uow.service_center_id

        await self.appointment_repo.lock_schedule()
        if not await self.customer_repo.get_by_id(customer_id):
            raise CustomerNotFound()
        vehicle = await self.vehicle_repo.get_by_id(vehicle_id)
        if not vehicle or vehicle.customer_id != customer_id:
            raise VehicleNotFound(vehicle_id)

        slot = await self.slot_repo.get_by_id(slot_id)
        if not slot or slot.status != AppointmentSlotStatus.AVAILABLE:
            raise SlotUnavailable()

        # Conflict detection: the mechanic/time must not already be taken.
        await self._check_schedule(
            slot.slot_date, slot.start_time, slot.duration_minutes, slot.mechanic_name
        )

        # Reserve then book the slot.
        slot.status = AppointmentSlotStatus.RESERVED
        slot.reserved_until = datetime.now(timezone.utc) + timedelta(minutes=30)

        appointment = await self.appointment_repo.create(
            customer_id=customer_id,
            vehicle_id=vehicle_id,
            maintenance_rule_id=maintenance_rule_id,
            mechanic_name=slot.mechanic_name,
            appointment_date=slot.slot_date,
            appointment_time=slot.start_time,
            estimated_duration_minutes=slot.duration_minutes,
            status=AppointmentStatus.PENDING,
            customer_notes=customer_notes,
        )
        slot.appointment_id = appointment.id
        slot.status = AppointmentSlotStatus.BOOKED

        self.uow.add_event(AppointmentCreated(
            aggregate_id=appointment.id,
            customer_id=customer_id,
            vehicle_id=vehicle_id,
            appointment_id=appointment.id,
            service_center_id=sc,
        ))
        await self.uow.flush()
        return await self.get_appointment(appointment.id)

    async def create_appointment_direct(
        self,
        *,
        customer_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        appointment_date,       # datetime.date
        appointment_time: str,  # "HH:MM"
        estimated_duration_minutes: int = 60,
        mechanic_name: Optional[str] = None,
        mechanic_user_id: Optional[uuid.UUID] = None,
        maintenance_rule_id: Optional[uuid.UUID] = None,
        customer_notes: Optional[str] = None,
        require_future: bool = False,
    ) -> dict:
        """Create an appointment at a given date/time without a pre-generated slot.

        The staff-facing booking path. Ownership is enforced by the tenant-scoped
        repos (a customer/vehicle from another tenant simply won't be found).
        """
        sc = self.uow.service_center_id
        await self.appointment_repo.lock_schedule()
        if not await self.customer_repo.get_by_id(customer_id):
            raise CustomerNotFound()
        vehicle = await self.vehicle_repo.get_by_id(vehicle_id)
        if not vehicle or vehicle.customer_id != customer_id:
            raise VehicleNotFound(vehicle_id)

        zone_name = await self.timezone_name()
        appt_dt = local_datetime_to_utc(appointment_date, appointment_time, zone_name)
        if require_future and appt_dt <= datetime.now(timezone.utc):
            raise ValidationError("Customer bookings must be scheduled in the future")

        mechanic_name = mechanic_name.strip() or None if mechanic_name is not None else None
        if mechanic_user_id is not None:
            mechanic = await UserRepository(self.uow.session).mechanic(sc, mechanic_user_id)
            if not mechanic:
                raise UserNotFound()
            mechanic_name = mechanic.full_name
        await self._check_schedule(
            appt_dt, appointment_time, estimated_duration_minutes, mechanic_name,
            mechanic_user_id=mechanic_user_id,
        )

        appointment = await self.appointment_repo.create(
            customer_id=customer_id,
            vehicle_id=vehicle_id,
            maintenance_rule_id=maintenance_rule_id,
            mechanic_name=mechanic_name,
            mechanic_user_id=mechanic_user_id,
            appointment_date=appt_dt,
            appointment_time=appointment_time,
            estimated_duration_minutes=estimated_duration_minutes,
            status=AppointmentStatus.PENDING,
            customer_notes=customer_notes,
        )
        self.uow.add_event(AppointmentCreated(
            aggregate_id=appointment.id,
            customer_id=customer_id,
            vehicle_id=vehicle_id,
            appointment_id=appointment.id,
            service_center_id=sc,
        ))
        await self.uow.flush()
        return await self.get_appointment(appointment.id)

    async def confirm_appointment(self, appointment_id: uuid.UUID) -> dict:
        appointment = await self.appointment_repo.get_by_id(appointment_id)
        if not appointment:
            raise AppointmentNotFound()
        if appointment.status != AppointmentStatus.PENDING:
            raise AppointmentStateError(
                f"Cannot confirm an appointment in status '{appointment.status}'"
            )
        appointment.status = AppointmentStatus.CONFIRMED
        self.uow.add_event(AppointmentConfirmed(
            aggregate_id=appointment_id,
            appointment_id=appointment_id,
            customer_id=appointment.customer_id,
            vehicle_id=appointment.vehicle_id,
            service_center_id=self.uow.service_center_id,
        ))
        await self.uow.flush()
        return await self.get_appointment(appointment_id)

    async def start_appointment(self, appointment_id: uuid.UUID,
                                *, mechanic_user_id: uuid.UUID | None = None) -> dict:
        appointment = await self.appointment_repo.get_detailed(appointment_id, for_update=True)
        if not appointment or (mechanic_user_id is not None and appointment.mechanic_user_id != mechanic_user_id):
            raise AppointmentNotFound()
        if appointment.status != AppointmentStatus.CONFIRMED:
            raise AppointmentStateError(
                f"Cannot start an appointment in status '{appointment.status}'"
            )
        if not (appointment.mechanic_name or "").strip():
            raise AppointmentStateError("Assign a mechanic before starting service work")
        appointment.status = AppointmentStatus.IN_PROGRESS
        self.uow.add_event(AppointmentStarted(
            aggregate_id=appointment_id,
            appointment_id=appointment_id,
            service_center_id=self.uow.service_center_id,
        ))
        await self.uow.flush()
        return await self.get_appointment(appointment_id)

    async def complete_appointment(
        self,
        appointment_id: uuid.UUID,
        *,
        odometer_km: Optional[int] = None,
        total_cost: Optional[float] = None,
        notes: Optional[str] = None,
        service_type: Optional[str] = None,
        mechanic_user_id: uuid.UUID | None = None,
    ) -> dict:
        """Complete an appointment and drive the core value chain.

        The state changes that MUST be atomic with completion happen in this one
        transaction: mark completed, create the ServiceRecord, advance mileage,
        recalculate vehicle health. Side effects that can be eventually
        consistent (customer notifications) are emitted as domain events and
        handled after commit — that is where Telegram/email hook in.
        """
        appointment = await self.appointment_repo.get_detailed(appointment_id, for_update=True)
        if not appointment or (mechanic_user_id is not None and appointment.mechanic_user_id != mechanic_user_id):
            raise AppointmentNotFound()
        if appointment.status != AppointmentStatus.IN_PROGRESS:
            raise AppointmentStateError(
                f"Cannot complete an appointment in status '{appointment.status}'"
            )

        appointment.status = AppointmentStatus.COMPLETED
        if mechanic_user_id is None:
            appointment.total_cost = total_cost
        if notes:
            appointment.notes = notes

        vehicle = appointment.vehicle
        rule = appointment.maintenance_rule
        recorded_type = (service_type or "").strip() or (rule.service_type if rule else "General Service")
        description = (notes or "").strip() or (rule.description if rule else None)
        performed_km = (
            odometer_km if odometer_km is not None
            else (vehicle.current_km if vehicle else 0)
        )

        # Advance the odometer if a higher reading was supplied.
        if vehicle and odometer_km is not None and odometer_km > (vehicle.current_km or 0):
            previous = vehicle.current_km or 0
            vehicle.current_km = odometer_km
            self.uow.add_event(MileageUpdated(
                aggregate_id=vehicle.id, vehicle_id=vehicle.id,
                previous_km=previous, new_km=odometer_km,
            ))

        # ServiceRecord is atomic with completion — a completed job always has one.
        record = await self.service_record_repo.create(
            vehicle_id=appointment.vehicle_id,
            appointment_id=appointment.id,
            service_type=recorded_type,
            description=description,
            performed_km=performed_km,
            performed_date=datetime.now(timezone.utc),
            cost=appointment.total_cost,
        )
        await self.uow.flush()

        # Award once, atomically with the locked appointment completion.
        points_earned = max(10, round((appointment.total_cost or 0) * 0.10))
        await self.customer_repo.add_loyalty_points(appointment.customer_id, points_earned)

        # Recalculate vehicle health; surface any maintenance-due events.
        health_score = None
        if vehicle:
            maintenance = MaintenanceService(self.uow.session, self.uow.service_center_id)
            report = await maintenance.calculate_due_services(vehicle.id)
            health_score = report.overall_score
            for event in maintenance.get_due_events(report):
                self.uow.add_event(event)

        self.uow.add_event(AppointmentCompleted(
            aggregate_id=appointment.id,
            appointment_id=appointment.id,
            service_record_id=record.id,
            service_center_id=self.uow.service_center_id,
        ))
        await self.uow.flush()

        result = serialize_appointment(appointment, await self.timezone_name())
        result["service_record_id"] = str(record.id)
        result["vehicle_health_score"] = health_score
        return result

    async def cancel_appointment(
        self,
        appointment_id: uuid.UUID,
        reason: Optional[str] = None,
    ) -> dict:
        appointment = await self.appointment_repo.get_with_slot(appointment_id, for_update=True)
        if not appointment:
            raise AppointmentNotFound()
        if appointment.status in (
            AppointmentStatus.IN_PROGRESS,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.COMPLETED,
        ):
            raise AppointmentStateError(
                f"Cannot cancel an appointment in status '{appointment.status}'"
            )

        # Free the linked slot so it can be booked again.
        if appointment.slot:
            appointment.slot.status = AppointmentSlotStatus.AVAILABLE
            appointment.slot.appointment_id = None
            appointment.slot.reserved_until = None

        appointment.status = AppointmentStatus.CANCELLED
        if reason:
            appointment.notes = reason

        self.uow.add_event(AppointmentCancelled(
            aggregate_id=appointment_id,
            appointment_id=appointment_id,
            reason=reason,
            service_center_id=self.uow.service_center_id,
        ))
        await self.uow.flush()
        return await self.get_appointment(appointment_id)

    async def reschedule_appointment(
        self,
        appointment_id: uuid.UUID,
        new_slot_id: uuid.UUID,
    ) -> dict:
        await self.appointment_repo.lock_schedule()
        appointment = await self.appointment_repo.get_with_slot(appointment_id, for_update=True)

        if not appointment:
            raise AppointmentNotFound()
        if appointment.status not in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
            raise AppointmentStateError("Only pending or confirmed appointments can be rescheduled")

        # Reserve new slot
        new_slot = await self.slot_repo.get_by_id(new_slot_id)
        if not new_slot or new_slot.status != AppointmentSlotStatus.AVAILABLE:
            raise SlotUnavailable()

        await self._check_schedule(
            new_slot.slot_date, new_slot.start_time, new_slot.duration_minutes,
            new_slot.mechanic_name, exclude_id=appointment_id,
        )

        # Release only after the destination has passed every check.
        if appointment.slot:
            appointment.slot.status = AppointmentSlotStatus.AVAILABLE
            appointment.slot.appointment_id = None

        new_slot.status = AppointmentSlotStatus.BOOKED
        new_slot.appointment_id = appointment_id

        appointment.appointment_date = new_slot.slot_date
        appointment.appointment_time = new_slot.start_time
        appointment.mechanic_name = new_slot.mechanic_name
        appointment.mechanic_user_id = None
        appointment.estimated_duration_minutes = new_slot.duration_minutes
        appointment.status = AppointmentStatus.RESCHEDULED
        await self.uow.session.flush()

        return {
            "id": str(appointment_id),
            "new_date": new_slot.slot_date.isoformat(),
            "new_time": new_slot.start_time,
            "status": AppointmentStatus.RESCHEDULED,
        }

    async def release_expired_reservations(self) -> int:
        """Release slots where reservation has expired."""
        released = await self.slot_repo.release_expired()
        return released

    async def get_appointments_for_customer(
        self,
        customer_id: uuid.UUID,
    ) -> Sequence:
        appointments = await self.appointment_repo.find_by_customer(customer_id)
        zone_name = await self.timezone_name()
        return [
            {
                "id": str(a.id),
                "vehicle_id": str(a.vehicle_id),
                "date": local_date_for_instant(a.appointment_date, zone_name).isoformat(),
                "time": a.appointment_time,
                "mechanic": a.mechanic_name,
                "status": a.status,
                "service_type": a.service_type,
            }
            for a in appointments
        ]

    async def get_appointments_for_date(
        self,
        service_center_id: uuid.UUID,
        appointment_date: date,
    ) -> List[dict]:
        appointments = await self.appointment_repo.find_by_date(
            service_center_id, appointment_date
        )
        zone_name = await self.timezone_name()
        return [
            {
                "id": str(a.id),
                "customer_id": str(a.customer_id),
                "customer_name": a.customer.full_name if a.customer else "",
                "vehicle_id": str(a.vehicle_id),
                "date": local_date_for_instant(a.appointment_date, zone_name).isoformat(),
                "time": a.appointment_time,
                "mechanic": a.mechanic_name,
                "service_type": a.service_type,
                "duration": a.estimated_duration_minutes,
                "status": a.status,
            }
            for a in appointments
        ]

    async def get_stats(self, service_center_id: uuid.UUID) -> dict:
        return await self.appointment_repo.get_stats(service_center_id)

    # --- Read API (tenant-scoped, relations eagerly loaded) -----------------
    async def get_appointment(self, appointment_id: uuid.UUID) -> dict:
        """Fetch one appointment. Raises AppointmentNotFound (-> 404) if it does
        not exist in the caller's tenant — never reveals other tenants' rows."""
        appointment = await self.appointment_repo.get_detailed(appointment_id)
        if not appointment:
            raise AppointmentNotFound()
        return serialize_appointment(appointment, await self.timezone_name())

    async def list_appointments(
        self,
        *,
        status: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        overdue: bool = False,
        awaiting_invoice: bool = False,
        q: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> dict:
        items, total = await self.appointment_repo.list_detailed(
            status=status, date_from=date_from, date_to=date_to, overdue=overdue,
            awaiting_invoice=awaiting_invoice,
            q=q,
            skip=skip, limit=limit,
        )
        zone_name = await self.timezone_name()
        # Enrich each row with a lightweight health score. Computed per unique
        # vehicle on the page (deduped), so a full-page load is a bounded cost.
        from app.services.financial_service import FinancialService
        from app.services.maintenance_service import MaintenanceService
        from app.services.vehicle_health_service import _band

        maintenance = MaintenanceService(self.uow.session, self.uow.service_center_id)
        financial = FinancialService(self.uow)
        health_cache: dict = {}
        serialized = []
        invoice_links = {}
        if items:
            links = await self.uow.session.execute(select(Invoice.appointment_id, Invoice.id).where(
                Invoice.service_center_id == self.uow.service_center_id,
                Invoice.appointment_id.in_([a.id for a in items]),
                Invoice.kind == InvoiceKind.INVOICE,
                Invoice.is_active.is_(True),
            ))
            invoice_links = dict(links.all())
        for a in items:
            row = serialize_appointment(a, zone_name)
            final_invoice_id = invoice_links.get(a.id)
            row["final_invoice_id"] = str(final_invoice_id) if final_invoice_id else None
            row["awaiting_invoice"] = a.status == AppointmentStatus.COMPLETED and final_invoice_id is None
            vid = a.vehicle_id
            if vid not in health_cache:
                try:
                    report = await maintenance.calculate_due_services(vid)
                    health_cache[vid] = (report.overall_score, _band(report.overall_score))
                except Exception:
                    health_cache[vid] = (None, None)
            row["health_score"], row["health_band"] = health_cache[vid]
            # Billing status closes the operational loop (paid? estimate? overdue?).
            row["billing"] = await financial.invoice_for_appointment(a.id)
            serialized.append(row)
        return {"items": serialized, "total": total}

    async def get_today(self) -> List[dict]:
        zone_name = await self.timezone_name()
        today = local_date_for_instant(datetime.now(timezone.utc), zone_name)
        items, _ = await self.appointment_repo.list_detailed(on_date=today, limit=200)
        return [serialize_appointment(a, zone_name) for a in items]

    # --- Slot generation ----------------------------------------------------
    async def generate_slots_range(
        self,
        *,
        start_date: date,
        days: int = 30,
        start_hour: int = 9,
        end_hour: int = 18,
        slot_minutes: int = 30,
        mechanic_names: Optional[List[str]] = None,
    ) -> dict:
        """Bulk-generate available slots for ``days`` from ``start_date``.

        Idempotent: slots already present (same day/time/mechanic) are skipped,
        so re-running to extend the horizon never duplicates.
        """
        await self.appointment_repo.lock_schedule()
        sc = self.uow.service_center_id
        zone_name = await self.timezone_name()
        mechanics = mechanic_names or [None]
        start_dt = local_day_bounds(start_date, zone_name)[0]
        end_dt = local_day_bounds(start_date + timedelta(days=days), zone_name)[0]

        existing = await self.slot_repo.list_in_range(start_dt, end_dt)
        seen = {(local_date_for_instant(s.slot_date, zone_name), s.start_time, s.mechanic_name) for s in existing}

        new_slots: List[AppointmentSlot] = []
        created = skipped = 0
        for offset in range(days):
            day = start_date + timedelta(days=offset)
            for mechanic in mechanics:
                cursor = datetime.combine(
                    day, datetime.min.time().replace(hour=start_hour), tzinfo=timezone.utc
                )
                day_end = datetime.combine(
                    day, datetime.min.time().replace(hour=end_hour), tzinfo=timezone.utc
                )
                while cursor + timedelta(minutes=slot_minutes) <= day_end:
                    start_str = cursor.strftime("%H:%M")
                    key = (day, start_str, mechanic)
                    if key in seen:
                        skipped += 1
                    else:
                        new_slots.append(AppointmentSlot(
                            service_center_id=sc,
                            mechanic_name=mechanic,
                            slot_date=local_datetime_to_utc(day, start_str, zone_name),
                            start_time=start_str,
                            end_time=(cursor + timedelta(minutes=slot_minutes)).strftime("%H:%M"),
                            duration_minutes=slot_minutes,
                            status=AppointmentSlotStatus.AVAILABLE,
                        ))
                        seen.add(key)
                        created += 1
                    cursor += timedelta(minutes=slot_minutes)

        if new_slots:
            self.uow.session.add_all(new_slots)
            await self.uow.flush()
        return {"created": created, "skipped": skipped}

    # --- Calendar aggregation ----------------------------------------------
    async def get_calendar(self, start: date, end: date, *, include_cancelled: bool = False) -> dict:
        """One-request calendar payload: mechanics, slots, appointments, blocked."""
        zone_name = await self.timezone_name()
        start_dt = local_day_bounds(start, zone_name)[0]
        end_dt = local_day_bounds(end, zone_name)[0]

        appointments = await self.appointment_repo.list_in_range(start_dt, end_dt, include_cancelled=include_cancelled)
        slots = await self.slot_repo.list_in_range(start_dt, end_dt)
        available_ids = {s.id for s in await self.slot_repo.list_in_range(start_dt, end_dt, available_only=True)}
        mechanics = await self._mechanics()

        def effective_status(s: AppointmentSlot) -> str:
            if s.status == AppointmentSlotStatus.AVAILABLE and s.id not in available_ids:
                return AppointmentSlotStatus.BLOCKED
            return s.status

        def slot_dict(s: AppointmentSlot) -> dict:
            return {
                "id": str(s.id),
                "date": s.slot_date.isoformat(),
                "local_date": local_date_for_instant(s.slot_date, zone_name).isoformat(),
                "start_time": s.start_time,
                "end_time": s.end_time,
                "mechanic": s.mechanic_name,
                "status": effective_status(s),
                "duration": s.duration_minutes,
                "appointment_id": str(s.appointment_id) if s.appointment_id else None,
            }

        return {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "mechanics": mechanics,
            "appointments": [serialize_appointment(a, zone_name) for a in appointments],
            "slots": [slot_dict(s) for s in slots if effective_status(s) != AppointmentSlotStatus.BLOCKED],
            "blocked": [slot_dict(s) for s in slots if effective_status(s) == AppointmentSlotStatus.BLOCKED],
        }

    async def _mechanics(self) -> List[dict]:
        users = await UserRepository(self.uow.session).mechanics(
            self.uow.service_center_id
        )
        return [
            {"id": str(u.id), "name": u.full_name, "role": "mechanic"}
            for u in users
        ]

    # --- Calendar drag/drop -------------------------------------------------
    async def move_appointment(self, appointment_id: uuid.UUID, new_slot_id: uuid.UUID) -> dict:
        await self.appointment_repo.lock_schedule()
        appointment = await self.appointment_repo.get_with_slot(appointment_id, for_update=True)
        if not appointment:
            raise AppointmentNotFound()
        if appointment.status not in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
            raise AppointmentStateError(
                f"Cannot move an appointment in status '{appointment.status}'"
            )
        new_slot = await self.slot_repo.get_by_id(new_slot_id)
        if not new_slot or new_slot.status != AppointmentSlotStatus.AVAILABLE:
            raise SlotUnavailable()

        await self._check_schedule(
            new_slot.slot_date, new_slot.start_time, new_slot.duration_minutes,
            new_slot.mechanic_name, exclude_id=appointment_id,
        )

        # Free the old slot, book the new one.
        if appointment.slot:
            appointment.slot.status = AppointmentSlotStatus.AVAILABLE
            appointment.slot.appointment_id = None
            appointment.slot.reserved_until = None
        new_slot.status = AppointmentSlotStatus.BOOKED
        new_slot.appointment_id = appointment.id

        appointment.appointment_date = new_slot.slot_date
        appointment.appointment_time = new_slot.start_time
        appointment.mechanic_name = new_slot.mechanic_name
        appointment.mechanic_user_id = None
        appointment.estimated_duration_minutes = new_slot.duration_minutes
        await self.uow.flush()
        return await self.get_appointment(appointment_id)

    async def update_appointment(
        self,
        appointment_id: uuid.UUID,
        *,
        appointment_date=None,
        appointment_time: Optional[str] = None,
        mechanic_name: Optional[str] = None,
        estimated_duration_minutes: Optional[int] = None,
        notes: Optional[str] = None,
        mechanic_user_id: uuid.UUID | None = None,
    ) -> dict:
        """Partial update used by the calendar board (drag-to-move, resize)."""
        await self.appointment_repo.lock_schedule()
        appointment = await self.appointment_repo.get_detailed(appointment_id, for_update=True)
        if not appointment:
            raise AppointmentNotFound()
        if appointment.status not in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
            raise AppointmentStateError("Only pending or confirmed appointments can be edited")
        new_time = appointment_time or appointment.appointment_time
        zone_name = await self.timezone_name()
        if appointment_date is None:
            local_day = local_date_for_instant(appointment.appointment_date, zone_name)
        elif isinstance(appointment_date, datetime):
            # AppointmentUpdate carries the selected calendar date in the date
            # portion. Its time/offset are deliberately ignored; HH:MM is the
            # separate canonical local wall-time field.
            local_day = appointment_date.date()
        else:
            local_day = appointment_date
        new_date = local_datetime_to_utc(local_day, new_time, zone_name)
        new_duration = estimated_duration_minutes if estimated_duration_minutes is not None else appointment.estimated_duration_minutes
        new_mechanic = (mechanic_name.strip() or None) if mechanic_name is not None else appointment.mechanic_name
        assigned_id = appointment.mechanic_user_id if mechanic_name is None else None
        if mechanic_user_id is not None:
            mechanic = await UserRepository(self.uow.session).mechanic(self.uow.service_center_id, mechanic_user_id)
            if not mechanic:
                raise UserNotFound()
            new_mechanic, assigned_id = mechanic.full_name, mechanic.id
        await self._check_schedule(new_date, new_time, new_duration, new_mechanic, exclude_id=appointment_id,
                                   mechanic_user_id=assigned_id)
        # A freely edited visit no longer occupies its old pre-generated slot.
        # Keep that slot reusable rather than leaving a phantom booking behind.
        placement_changed = (
            new_date != local_datetime_to_utc(
                local_date_for_instant(appointment.appointment_date, zone_name),
                appointment.appointment_time, zone_name,
            )
            or new_duration != appointment.estimated_duration_minutes
            or new_mechanic != appointment.mechanic_name
            or assigned_id != appointment.mechanic_user_id
        )
        if placement_changed and appointment.slot:
            appointment.slot.status = AppointmentSlotStatus.AVAILABLE
            appointment.slot.appointment_id = None
            appointment.slot.reserved_until = None
            appointment.slot = None
        appointment.appointment_date = new_date
        if appointment_time is not None:
            appointment.appointment_time = appointment_time
        if mechanic_name is not None or mechanic_user_id is not None:
            appointment.mechanic_name = new_mechanic
            appointment.mechanic_user_id = assigned_id
        if estimated_duration_minutes is not None:
            appointment.estimated_duration_minutes = estimated_duration_minutes
        if notes is not None:
            appointment.notes = notes
        await self.uow.flush()
        return await self.get_appointment(appointment_id)

    async def assign_mechanic(self, appointment_id: uuid.UUID, mechanic_name: str | None = None,
                              *, mechanic_user_id: uuid.UUID | None = None) -> dict:
        await self.appointment_repo.lock_schedule()
        appointment = await self.appointment_repo.get_with_slot(appointment_id, for_update=True)
        if not appointment:
            raise AppointmentNotFound()
        if appointment.status not in (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED):
            raise AppointmentStateError("Mechanic assignment is closed after service work starts")
        if mechanic_user_id:
            mechanic = await UserRepository(self.uow.session).mechanic(self.uow.service_center_id, mechanic_user_id)
            if not mechanic:
                raise UserNotFound()
            mechanic_name = mechanic.full_name
        else:
            mechanic_name = (mechanic_name or "").strip()
        await self._check_schedule(
            appointment.appointment_date, appointment.appointment_time,
            appointment.estimated_duration_minutes, mechanic_name, exclude_id=appointment_id,
            mechanic_user_id=mechanic_user_id,
        )
        appointment.mechanic_name = mechanic_name
        appointment.mechanic_user_id = mechanic_user_id
        if appointment.slot:
            appointment.slot.mechanic_name = mechanic_name
        await self.uow.flush()
        return await self.get_appointment(appointment_id)
