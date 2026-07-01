from __future__ import annotations
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional, Sequence

from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.appointment_slot_repository import AppointmentSlotRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.customer_repository import CustomerRepository
from app.repositories.unit_of_work import UnitOfWork
from app.models.appointment import AppointmentStatus
from app.models.appointment_slot import AppointmentSlotStatus
from app.core.events import AppointmentCreated, AppointmentConfirmed, \
    AppointmentCompleted, AppointmentCancelled
from app.exceptions import (
    AppointmentNotFound, SlotUnavailable, AppointmentConflict,
    VehicleNotFound, CustomerNotFound,
)


class AppointmentService:
    """Manages appointment lifecycle: slot generation → reservation → confirm → complete."""

    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        sc = uow.service_center_id
        self.appointment_repo = AppointmentRepository(uow.session, sc)
        self.slot_repo = AppointmentSlotRepository(uow.session, sc)
        self.vehicle_repo = VehicleRepository(uow.session, sc)
        self.customer_repo = CustomerRepository(uow.session, sc)

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
        customer_id: uuid.UUID,
        vehicle_id: uuid.UUID,
        service_center_id: uuid.UUID,
        slot_id: uuid.UUID,
        service_type: Optional[str] = None,
        customer_notes: Optional[str] = None,
    ) -> dict:
        vehicle = await self.vehicle_repo.get_by_id(vehicle_id)
        if not vehicle:
            raise VehicleNotFound(vehicle_id)

        customer = await self.customer_repo.get_by_id(customer_id)
        if not customer:
            raise CustomerNotFound()

        slot = await self.slot_repo.get_by_id(slot_id)
        if not slot or slot.status != AppointmentSlotStatus.AVAILABLE:
            raise SlotUnavailable()

        # Reserve the slot
        slot.status = AppointmentSlotStatus.RESERVED
        slot.reserved_until = datetime.now(timezone.utc) + timedelta(minutes=30)

        appointment = await self.appointment_repo.create(
            customer_id=customer_id,
            vehicle_id=vehicle_id,
            service_center_id=service_center_id,
            maintenance_rule_id=None,
            mechanic_name=slot.mechanic_name,
            appointment_date=slot.slot_date,
            appointment_time=slot.start_time,
            estimated_duration_minutes=slot.duration_minutes,
            status=AppointmentStatus.PENDING,
            service_type=service_type,
            customer_notes=customer_notes,
        )

        # Link slot to appointment
        slot.appointment_id = appointment.id
        slot.status = AppointmentSlotStatus.BOOKED

        self.uow.add_event(AppointmentCreated(
            aggregate_id=appointment.id,
            customer_id=customer_id,
            vehicle_id=vehicle_id,
            appointment_id=appointment.id,
            service_center_id=service_center_id,
        ))

        await self.uow.flush()
        await self.uow.session.refresh(appointment)

        return {
            "id": str(appointment.id),
            "customer_id": str(customer_id),
            "vehicle_id": str(vehicle_id),
            "date": appointment.appointment_date.isoformat(),
            "time": appointment.appointment_time,
            "mechanic": appointment.mechanic_name,
            "status": appointment.status,
        }

    async def confirm_appointment(self, appointment_id: uuid.UUID) -> dict:
        appointment = await self.appointment_repo.update_status(
            appointment_id, AppointmentStatus.CONFIRMED
        )
        if not appointment:
            raise AppointmentNotFound()

        self.uow.add_event(AppointmentConfirmed(
            aggregate_id=appointment_id,
            appointment_id=appointment_id,
            customer_id=appointment.customer_id,
            vehicle_id=appointment.vehicle_id,
        ))

        return {"id": str(appointment_id), "status": AppointmentStatus.CONFIRMED}

    async def complete_appointment(
        self,
        appointment_id: uuid.UUID,
        notes: Optional[str] = None,
        total_cost: Optional[float] = None,
    ) -> dict:
        appointment = await self.appointment_repo.update(
            appointment_id,
            status=AppointmentStatus.COMPLETED,
            notes=notes,
            total_cost=total_cost,
        )
        if not appointment:
            raise AppointmentNotFound()

        self.uow.add_event(AppointmentCompleted(
            aggregate_id=appointment_id,
            appointment_id=appointment_id,
        ))

        return {
            "id": str(appointment_id),
            "status": AppointmentStatus.COMPLETED,
            "total_cost": total_cost,
        }

    async def cancel_appointment(
        self,
        appointment_id: uuid.UUID,
        reason: Optional[str] = None,
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

        # Release the slot if linked
        if appointment.slot:
            appointment.slot.status = AppointmentSlotStatus.AVAILABLE
            appointment.slot.appointment_id = None
            appointment.slot.reserved_until = None

        appointment.status = AppointmentStatus.CANCELLED
        appointment.notes = reason

        self.uow.add_event(AppointmentCancelled(
            aggregate_id=appointment_id,
            appointment_id=appointment_id,
            reason=reason,
        ))

        return {"id": str(appointment_id), "status": AppointmentStatus.CANCELLED}

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
