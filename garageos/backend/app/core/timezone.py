"""Service-center wall-time conversion helpers.

Appointment date/time inputs are local civil time. Persist only UTC instants,
while keeping the local ``HH:MM`` field for the garage's schedule display.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ValidationError
from app.models.service_center import ServiceCenter


def valid_zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, TypeError, ValueError):
        raise ValidationError("The service center has an invalid time zone") from None


async def service_center_timezone(session: AsyncSession, center_id) -> str:
    name = await session.scalar(select(ServiceCenter.timezone).where(ServiceCenter.id == center_id))
    if not name:
        raise ValidationError("The service center time zone is not configured")
    valid_zone(name)
    return name


def _parse_clock(value: str) -> time:
    try:
        parsed = time.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError("Appointment time must use HH:MM format") from None
    if parsed.tzinfo is not None:
        raise ValidationError("Appointment time must be a local wall time without an offset")
    return parsed


def local_datetime_to_utc(day: date, clock: str, zone_name: str) -> datetime:
    """Convert one local civil date/time to UTC; reject DST gaps or duplicates."""
    zone = valid_zone(zone_name)
    wall = datetime.combine(day, _parse_clock(clock))
    first = wall.replace(tzinfo=zone, fold=0)
    second = wall.replace(tzinfo=zone, fold=1)
    if first.utcoffset() != second.utcoffset():
        raise ValidationError("This local appointment time is ambiguous in the service center time zone")
    round_trip = first.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None)
    if round_trip != wall:
        raise ValidationError("This local appointment time does not exist in the service center time zone")
    return first.astimezone(timezone.utc)


def local_day_bounds(day: date, zone_name: str) -> tuple[datetime, datetime]:
    """Return UTC bounds for a local calendar day, including DST-length days."""
    zone = valid_zone(zone_name)

    def boundary(local_day: date) -> datetime:
        wall = datetime.combine(local_day, time.min)
        # Some regions change clocks at midnight. Use the first valid local
        # minute as the day's start; for an ambiguous boundary choose fold=0.
        for minute in range(24 * 60):
            candidate_wall = wall + timedelta(minutes=minute)
            candidate = candidate_wall.replace(tzinfo=zone, fold=0)
            if candidate.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) == candidate_wall:
                return candidate.astimezone(timezone.utc)
        raise ValidationError("Could not resolve the service center's local day boundary")

    return boundary(day), boundary(day + timedelta(days=1))


def local_date_for_instant(value: datetime, zone_name: str) -> date:
    """Read a stored UTC instant as a service-center local calendar date."""
    instant = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return instant.astimezone(valid_zone(zone_name)).date()
