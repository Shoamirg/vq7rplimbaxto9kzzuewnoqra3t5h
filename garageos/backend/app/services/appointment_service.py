from __future__ import annotations
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional, Sequence

from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.appointment_slot_repository import AppointmentSlotRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.service_record_repository import ServiceRecordRepository
from app.repositories.user_repository import UserRepository
from app.repositories.unit_of_work import UnitOfWork
from app.services.maintenance_service import MaintenanceService
from app.models.appointment import AppointmentStatus
from app.models.appointment_slot import AppointmentSlot, AppointmentSlotStatus
from app.core.events import AppointmentCreated, AppointmentConfirmed, \
    AppointmentCompleted, AppointmentCancelled, MileageUpdated
from app.exceptions import (
    AppointmentNotFound, SlotUnavailable, AppointmentConflict, AppointmentStateError,
    VehicleNotFound, CustomerNotFound,
)


def serialize_appointment(a) -> dict:
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
        "appointment_time": a.appointment_time,
        "mechanic_name": a.mechanic_name,
        "status": a.status,
        # service_type is derived from the linked maintenance rule (canonical
        # source) — Appointment has no service_type column of its own.
        "maintenance_rule_id": str(a.maintenance_rule_id) if a.maintenance_rule_id else None,
        "service_type": a.maintenance_rule.service_type if a.maintenance_rule else None,
        "estimated_duration_minutes": a.estimated_duration_minutes,
        "total_cost": a.total_cost,
    }


class AppointmentService:
    """Manages appointment lifecycle: slot generation → reservation → confirm → complete."""

    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        sc = uow.service_center_id
        self.appointment_repo = AppointmentRepository(uow.session, sc)
        self.slot_repo = AppointmentSlotRepository(uow.session, sc)
        self.vehicle_repo = VehicleRepository(uow.session, sc)
        self.customer_repo = CustomerRepository(uow.session, sc)
        self.service_record_repo = ServiceRecordRepository(uow.session, sc)

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
        mechanics = mechanic_names or [None]
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
                    slot_date=current,
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

        if not await self.customer_repo.get_by_id(customer_id):
            raise CustomerNotFound()
        if not await self.vehicle_repo.get_by_id(vehicle_id):
            raise VehicleNotFound(vehicle_id)

        slot = await self.slot_repo.get_by_id(slot_id)
        if not slot or slot.status != AppointmentSlotStatus.AVAILABLE:
            raise SlotUnavailable()

        # Conflict detection: the mechanic/time must not already be taken.
        conflicts = await self.appointment_repo.find_conflicting(
            sc, slot.slot_date, slot.start_time, slot.duration_minutes
        )
        if conflicts:
            raise AppointmentConflict()

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
    ) -> dict:
        """Complete an appointment and drive the core value chain.

        The state changes that MUST be atomic with completion happen in this one
        transaction: mark completed, create the ServiceRecord, advance mileage,
        recalculate vehicle health. Side effects that can be eventually
        consistent (customer notifications) are emitted as domain events and
        handled after commit — that is where Telegram/email hook in.
        """
        appointment = await self.appointment_repo.get_detailed(appointment_id)
        if not appointment:
            raise AppointmentNotFound()
        if appointment.status == AppointmentStatus.COMPLETED:
            raise AppointmentStateError("Appointment is already completed")

        appointment.status = AppointmentStatus.COMPLETED
        appointment.total_cost = total_cost
        if notes:
            appointment.notes = notes

        vehicle = appointment.vehicle
        rule = appointment.maintenance_rule
        service_type = rule.service_type if rule else "General Service"
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
            service_type=service_type,
            description=rule.description if rule else None,
            performed_km=performed_km,
            performed_date=datetime.now(timezone.utc),
            cost=total_cost,
        )
        await self.uow.flush()

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
        ))
        await self.uow.flush()

        result = serialize_appointment(appointment)
        result["service_record_id"] = str(record.id)
        result["vehicle_health_score"] = health_score
        return result

    async def cancel_appointment(
        self,
        appointment_id: uuid.UUID,
        reason: Optional[str] = None,
    ) -> dict:
        appointment = await self.appointment_repo.get_with_slot(appointment_id)
        if not appointment:
            raise AppointmentNotFound()
        if appointment.status in (AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED):
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
        ))
        await self.uow.flush()
        return await self.get_appointment(appointment_id)

    async def reschedule_appointment(
        self,
        appointment_id: uuid.UUID,
        new_slot_id: uuid.UUID,
    ) -> dict:
        # Load appointment with slot relationship
        from sqlalchemy.orm import selectinload
        from sqlalchemy import select as sa_select
        from app.models.appointment import Appointment

        stmt = sa_select(Appointment).options(
            selectinload(Appointment.slot)
        ).where(Appointment.id == appointment_id)
        result = await self.uow.session.execute(stmt)
        appointment = result.scalar_one_or_none()

        if not appointment:
            raise AppointmentNotFound()

        # Release old slot
        if appointment.slot:
            appointment.slot.status = AppointmentSlotStatus.AVAILABLE
            appointment.slot.appointment_id = None

        # Reserve new slot
        new_slot = await self.slot_repo.get_by_id(new_slot_id)
        if not new_slot or new_slot.status != AppointmentSlotStatus.AVAILABLE:
            raise SlotUnavailable()

        new_slot.status = AppointmentSlotStatus.BOOKED
        new_slot.appointment_id = appointment_id

        appointment.appointment_date = new_slot.slot_date
        appointment.appointment_time = new_slot.start_time
        appointment.mechanic_name = new_slot.mechanic_name
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
        return [
            {
                "id": str(a.id),
                "vehicle_id": str(a.vehicle_id),
                "date": a.appointment_date.isoformat(),
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
        return [
            {
                "id": str(a.id),
                "customer_id": str(a.customer_id),
                "customer_name": a.customer.full_name if a.customer else "",
                "vehicle_id": str(a.vehicle_id),
                "date": a.appointment_date.isoformat(),
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
        return serialize_appointment(appointment)

    async def list_appointments(
        self,
        *,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> dict:
        items, total = await self.appointment_repo.list_detailed(
            status=status, skip=skip, limit=limit
        )
        return {"items": [serialize_appointment(a) for a in items], "total": total}

    async def get_today(self) -> List[dict]:
        items, _ = await self.appointment_repo.list_detailed(on_date=date.today(), limit=200)
        return [serialize_appointment(a) for a in items]

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
        sc = self.uow.service_center_id
        mechanics = mechanic_names or [None]
        start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
        end_dt = datetime.combine(
            start_date + timedelta(days=days), datetime.min.time(), tzinfo=timezone.utc
        )

        existing = await self.slot_repo.list_in_range(start_dt, end_dt)
        seen = {(s.slot_date.date(), s.start_time, s.mechanic_name) for s in existing}

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
                            slot_date=cursor,
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
    async def get_calendar(self, start: date, end: date) -> dict:
        """One-request calendar payload: mechanics, slots, appointments, blocked."""
        start_dt = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
        end_dt = datetime.combine(end, datetime.min.time(), tzinfo=timezone.utc)

        appointments = await self.appointment_repo.list_in_range(start_dt, end_dt)
        slots = await self.slot_repo.list_in_range(start_dt, end_dt)
        mechanics = await self._mechanics()

        def slot_dict(s: AppointmentSlot) -> dict:
            return {
                "id": str(s.id),
                "date": s.slot_date.isoformat(),
                "start_time": s.start_time,
                "end_time": s.end_time,
                "mechanic": s.mechanic_name,
                "status": s.status,
                "duration": s.duration_minutes,
                "appointment_id": str(s.appointment_id) if s.appointment_id else None,
            }

        return {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "mechanics": mechanics,
            "appointments": [serialize_appointment(a) for a in appointments],
            "slots": [slot_dict(s) for s in slots if s.status != AppointmentSlotStatus.BLOCKED],
            "blocked": [slot_dict(s) for s in slots if s.status == AppointmentSlotStatus.BLOCKED],
        }

    async def _mechanics(self) -> List[dict]:
        users = await UserRepository(self.uow.session).find_by_service_center(
            self.uow.service_center_id
        )
        return [
            {"id": str(u.id), "name": u.full_name, "role": u.role.name if u.role else None}
            for u in users
            if u.role and u.role.name == "mechanic"
        ]

    # --- Calendar drag/drop -------------------------------------------------
    async def move_appointment(self, appointment_id: uuid.UUID, new_slot_id: uuid.UUID) -> dict:
        appointment = await self.appointment_repo.get_with_slot(appointment_id)
        if not appointment:
            raise AppointmentNotFound()
        if appointment.status in (AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED):
            raise AppointmentStateError(
                f"Cannot move an appointment in status '{appointment.status}'"
            )
        new_slot = await self.slot_repo.get_by_id(new_slot_id)
        if not new_slot or new_slot.status != AppointmentSlotStatus.AVAILABLE:
            raise SlotUnavailable()

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
    ) -> dict:
        """Partial update used by the calendar board (drag-to-move, resize)."""
        appointment = await self.appointment_repo.get_by_id(appointment_id)
        if not appointment:
            raise AppointmentNotFound()
        if appointment_date is not None:
            appointment.appointment_date = appointment_date
        if appointment_time is not None:
            appointment.appointment_time = appointment_time
        if mechanic_name is not None:
            appointment.mechanic_name = mechanic_name
        if estimated_duration_minutes is not None:
            appointment.estimated_duration_minutes = estimated_duration_minutes
        if notes is not None:
            appointment.notes = notes
        await self.uow.flush()
        return await self.get_appointment(appointment_id)

    async def assign_mechanic(self, appointment_id: uuid.UUID, mechanic_name: str) -> dict:
        appointment = await self.appointment_repo.get_with_slot(appointment_id)
        if not appointment:
            raise AppointmentNotFound()
        appointment.mechanic_name = mechanic_name
        if appointment.slot:
            appointment.slot.mechanic_name = mechanic_name
        await self.uow.flush()
        return await self.get_appointment(appointment_id)
