"""Mechanic Workspace — a mechanic's own job queue.

Distinct from the advisor-facing AppointmentService: this only ever surfaces
jobs assigned to *this* mechanic, and speaks the mechanic's language (Today's
Jobs → open a job → Start / Finish). Transitions delegate to AppointmentService
so completion still drives the value chain (service record, mileage, events).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from app.core.timezone import local_date_for_instant

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.exceptions import AppointmentNotFound
from app.models.appointment import Appointment, AppointmentStatus
from app.models.customer import Customer
from app.models.vehicle import Vehicle
from app.models.vehicle_model import VehicleModel
from app.repositories.unit_of_work import UnitOfWork
from app.services.appointment_service import AppointmentService

# Jobs a mechanic still has to act on. Completed/cancelled drop off the queue.
_ACTIVE = (
    AppointmentStatus.PENDING,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.IN_PROGRESS,
)


def _vehicle_label(v: Vehicle | None) -> str:
    if v is None:
        return "Vehicle"
    brand = v.vehicle_model.brand.name if v.vehicle_model and v.vehicle_model.brand else ""
    model = v.vehicle_model.name if v.vehicle_model else ""
    parts = [p for p in (brand, model, str(v.year) if v.year else "") if p]
    return " ".join(parts) or "Vehicle"


class WorkshopService:
    def __init__(self, uow: UnitOfWork, mechanic_id: uuid.UUID):
        self.uow = uow
        self.sc = uow.service_center_id
        self.session = uow.session
        self.mechanic_id = mechanic_id

    def _base_query(self):
        return (
            select(Appointment)
            .where(
                Appointment.service_center_id == self.sc,
                Appointment.mechanic_user_id == self.mechanic_id,
                Appointment.is_active.is_(True),
                Appointment.customer.has(Customer.service_center_id == self.sc),
                Appointment.vehicle.has(Vehicle.service_center_id == self.sc),
            )
            .options(
                selectinload(Appointment.vehicle)
                .selectinload(Vehicle.vehicle_model)
                .selectinload(VehicleModel.brand),
                selectinload(Appointment.customer),
                selectinload(Appointment.maintenance_rule),
            )
        )

    async def _owned_job(self, job_id: uuid.UUID) -> Appointment:
        stmt = self._base_query().where(Appointment.id == job_id)
        job = (await self.session.execute(stmt)).scalar_one_or_none()
        if job is None:
            raise AppointmentNotFound()
        return job

    def _card(self, a: Appointment, zone: str) -> dict:
        service = a.maintenance_rule.service_type if a.maintenance_rule else None
        return {
            "id": str(a.id),
            "status": a.status,
            "date": local_date_for_instant(a.appointment_date, zone).isoformat() if a.appointment_date else None,
            "time": a.appointment_time,
            "vehicle_label": _vehicle_label(a.vehicle),
            "license_plate": a.vehicle.license_plate if a.vehicle else None,
            "customer_name": a.customer.full_name if a.customer else None,
            "service": service,
            "note": a.customer_notes or a.notes or None,
        }

    async def my_jobs(self) -> dict:
        stmt = (
            self._base_query()
            .where(Appointment.status.in_(_ACTIVE))
            .order_by(Appointment.appointment_date, Appointment.appointment_time)
        )
        jobs = (await self.session.execute(stmt)).scalars().all()
        zone = await AppointmentService(self.uow).timezone_name()
        today = local_date_for_instant(datetime.now(timezone.utc), zone)
        cards_today, cards_upcoming = [], []
        for a in jobs:
            card = self._card(a, zone)
            d = local_date_for_instant(a.appointment_date, zone) if a.appointment_date else None
            (cards_today if d == today else cards_upcoming).append(card)
        return {
            "today": cards_today,
            "upcoming": cards_upcoming,
            "in_progress_count": sum(1 for a in jobs if a.status == AppointmentStatus.IN_PROGRESS),
        }

    async def job_detail(self, job_id: uuid.UUID) -> dict:
        a = await self._owned_job(job_id)
        v = a.vehicle
        card = self._card(a, await AppointmentService(self.uow).timezone_name())
        card.update({
            "vehicle_id": str(v.id) if v else None,
            "current_km": v.current_km if v else None,
            "customer_phone": a.customer.phone if a.customer else None,
            "estimated_duration_minutes": a.estimated_duration_minutes,
            "staff_notes": a.notes,
        })
        return card

    async def start(self, job_id: uuid.UUID) -> dict:
        await self._owned_job(job_id)  # ownership guard
        await AppointmentService(self.uow).start_appointment(job_id, mechanic_user_id=self.mechanic_id)
        return await self.job_detail(job_id)

    async def finish(self, job_id: uuid.UUID, *, odometer_km: int | None = None) -> dict:
        await self._owned_job(job_id)  # ownership guard
        await AppointmentService(self.uow).complete_appointment(
            job_id, odometer_km=odometer_km, mechanic_user_id=self.mechanic_id
        )
        # Completed jobs drop off the active queue; return a minimal ack.
        return {"id": str(job_id), "status": AppointmentStatus.COMPLETED}
