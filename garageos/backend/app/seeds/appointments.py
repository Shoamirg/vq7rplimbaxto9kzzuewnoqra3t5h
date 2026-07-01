"""Generate appointments with a realistic spread of statuses and dates."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Appointment,
    MaintenanceRule,
    ServiceCenter,
    User,
    Vehicle,
)
from app.models.appointment import AppointmentStatus
from app.seeds.base import rng

_NOW = datetime.now(timezone.utc)
_TIMES = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"]


def _vehicles_by_customer(vehicles: list[Vehicle]) -> dict:
    grouped: dict = defaultdict(list)
    for vehicle in vehicles:
        grouped[vehicle.customer_id].append(vehicle)
    return grouped


async def generate_appointments(
    session: AsyncSession,
    service_center: ServiceCenter,
    vehicles: list[Vehicle],
    mechanics: list[User],
    rules: list[MaintenanceRule],
    count: int,
) -> list[Appointment]:
    if not vehicles:
        return []

    by_customer = _vehicles_by_customer(vehicles)
    mechanic_names = [m.full_name for m in mechanics] or [None]

    appointments: list[Appointment] = []
    for _ in range(count):
        vehicle = rng.choice(vehicles)
        # Status drives whether the appointment is in the past or future.
        status = rng.choices(
            [
                AppointmentStatus.COMPLETED,
                AppointmentStatus.CONFIRMED,
                AppointmentStatus.PENDING,
                AppointmentStatus.IN_PROGRESS,
                AppointmentStatus.CANCELLED,
            ],
            weights=[40, 25, 20, 5, 10],
            k=1,
        )[0]

        if status == AppointmentStatus.COMPLETED:
            appt_date = _NOW - timedelta(days=rng.randint(1, 120))
        elif status == AppointmentStatus.IN_PROGRESS:
            appt_date = _NOW
        elif status == AppointmentStatus.CANCELLED:
            appt_date = _NOW + timedelta(days=rng.randint(-30, 14))
        else:  # confirmed / pending -> upcoming
            appt_date = _NOW + timedelta(days=rng.randint(1, 21))

        rule = rng.choice(rules) if rules and rng.random() < 0.8 else None
        duration = (
            rule.estimated_duration_minutes
            if rule and rule.estimated_duration_minutes
            else rng.choice([30, 45, 60, 90])
        )
        total_cost = None
        if status == AppointmentStatus.COMPLETED:
            base = (rule.estimated_cost if rule and rule.estimated_cost else 100.0)
            total_cost = round(base * rng.uniform(0.9, 1.35), 2)

        appointments.append(
            Appointment(
                service_center_id=service_center.id,
                customer_id=vehicle.customer_id,
                vehicle_id=vehicle.id,
                maintenance_rule_id=rule.id if rule else None,
                mechanic_name=rng.choice(mechanic_names),
                appointment_date=appt_date,
                appointment_time=rng.choice(_TIMES),
                estimated_duration_minutes=duration,
                status=status,
                notes=None,
                customer_notes=None,
                total_cost=total_cost,
            )
        )
    session.add_all(appointments)
    await session.flush()
    return appointments
