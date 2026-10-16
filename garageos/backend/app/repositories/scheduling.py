"""Shared SQL intervals for booking validation and displayed availability."""
from datetime import timedelta

from sqlalchemy import Date, Time, cast, func, literal, select
from app.models.appointment import Appointment, AppointmentStatus
from app.models.appointment_slot import AppointmentSlot
from app.models.service_center import ServiceCenter


def _center_timezone(model):
    return select(ServiceCenter.timezone).where(
        ServiceCenter.id == model.service_center_id
    ).correlate(model).scalar_subquery()


def appointment_start():
    return (cast(func.timezone(_center_timezone(Appointment), Appointment.appointment_date), Date)
            + cast(Appointment.appointment_time, Time))


def slot_has_conflict():
    start = appointment_start()
    end = start + Appointment.estimated_duration_minutes * literal(timedelta(minutes=1))
    slot_start = (cast(func.timezone(_center_timezone(AppointmentSlot), AppointmentSlot.slot_date), Date)
                  + cast(AppointmentSlot.start_time, Time))
    slot_end = slot_start + AppointmentSlot.duration_minutes * literal(timedelta(minutes=1))
    return select(Appointment.id).where(
        Appointment.service_center_id == AppointmentSlot.service_center_id,
        Appointment.is_active.is_(True),
        Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED]),
        func.lower(func.trim(Appointment.mechanic_name)) == func.lower(func.trim(AppointmentSlot.mechanic_name)),
        start < slot_end, end > slot_start,
    ).exists()
