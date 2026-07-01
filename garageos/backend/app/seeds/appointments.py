"""Generate a clustered, realistic appointment schedule.

Appointments are packed onto near-term days (today heaviest, tapering off) across
mechanic lanes with hourly slots and a lunch gap, so the calendar looks like a
busy garage rather than one booking scattered per week. Statuses follow the clock:
past = completed, around-now = in progress, later = confirmed/pending.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Appointment, MaintenanceRule, ServiceCenter, User, Vehicle
from app.models.appointment import AppointmentStatus
from app.seeds.base import rng

# Hourly slots with a lunch gap at 12:00.
_SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"]
# Per-day fill probability: today busiest, tapering across the next days.
_DAY_FILL = [0.42, 0.36, 0.26, 0.20, 0.16, 0.12]


async def generate_appointments(
    session: AsyncSession,
    service_center: ServiceCenter,
    vehicles: list[Vehicle],
    mechanics: list[User],
    rules: list[MaintenanceRule],
    count: int,  # kept for signature compatibility; schedule is slot-driven
) -> list[Appointment]:
    if not vehicles:
        return []

    mechanic_names = [m.full_name for m in mechanics] or [None]
    now = datetime.now(timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)

    appointments: list[Appointment] = []
    for day_offset, fill in enumerate(_DAY_FILL):
        day = midnight + timedelta(days=day_offset)
        for mechanic in mechanic_names:
            for slot in _SLOTS:
                if rng.random() > fill:
                    continue

                vehicle = rng.choice(vehicles)
                rule = rng.choice(rules) if rules and rng.random() < 0.85 else None
                hh, mm = int(slot[:2]), int(slot[3:])
                appt_dt = day + timedelta(hours=hh, minutes=mm)

                if appt_dt < now - timedelta(hours=1):
                    status = AppointmentStatus.COMPLETED
                elif appt_dt <= now + timedelta(minutes=30):
                    status = AppointmentStatus.IN_PROGRESS
                else:
                    status = rng.choices(
                        [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
                        weights=[70, 30], k=1,
                    )[0]
                if rng.random() < 0.06:
                    status = AppointmentStatus.CANCELLED

                duration = rng.choice([60, 60, 60, 30, 90])
                total_cost = None
                if status == AppointmentStatus.COMPLETED:
                    base = rule.estimated_cost if rule and rule.estimated_cost else 100.0
                    total_cost = round(base * rng.uniform(0.9, 1.3), 2)

                appointments.append(Appointment(
                    service_center_id=service_center.id,
                    customer_id=vehicle.customer_id,
                    vehicle_id=vehicle.id,
                    maintenance_rule_id=rule.id if rule else None,
                    mechanic_name=mechanic,
                    appointment_date=appt_dt,
                    appointment_time=slot,
                    estimated_duration_minutes=duration,
                    status=status,
                    notes=None,
                    customer_notes=None,
                    total_cost=total_cost,
                ))

    session.add_all(appointments)
    await session.flush()
    return appointments
