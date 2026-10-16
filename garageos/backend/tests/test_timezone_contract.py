from datetime import date, datetime, timezone

import pytest

from app.core.timezone import local_date_for_instant, local_day_bounds, local_datetime_to_utc
from app.commands.audit_schedule_timezone import classify_timestamp
from app.exceptions import ValidationError


def test_tashkent_wall_time_is_converted_once_to_utc():
    assert local_datetime_to_utc(date(2032, 10, 2), "10:30", "Asia/Tashkent") == datetime(
        2032, 10, 2, 5, 30, tzinfo=timezone.utc
    )


def test_tashkent_calendar_day_uses_local_midnight_boundaries():
    start, end = local_day_bounds(date(2032, 10, 2), "Asia/Tashkent")
    assert start == datetime(2032, 10, 1, 19, tzinfo=timezone.utc)
    assert end == datetime(2032, 10, 2, 19, tzinfo=timezone.utc)


@pytest.mark.parametrize("day, clock", [
    (date(2026, 3, 29), "02:30"),  # nonexistent spring-forward time
    (date(2026, 10, 25), "02:30"),  # repeated fall-back time
])
def test_daylight_saving_gap_and_ambiguity_are_not_guessed(day, clock):
    with pytest.raises(ValidationError):
        local_datetime_to_utc(day, clock, "Europe/Berlin")


def test_local_date_is_derived_from_the_service_center_zone():
    instant = datetime(2032, 10, 1, 20, tzinfo=timezone.utc)
    assert local_date_for_instant(instant, "Asia/Tashkent") == date(2032, 10, 2)


def test_timezone_audit_flags_legacy_wall_clock_storage_without_mutating_data():
    legacy = datetime(2032, 10, 2, 10, tzinfo=timezone.utc)
    correct = datetime(2032, 10, 2, 5, tzinfo=timezone.utc)
    assert classify_timestamp(legacy, "10:00", "Asia/Tashkent") == "legacy_local_clock_stored_as_utc_candidate"
    assert classify_timestamp(correct, "10:00", "Asia/Tashkent") == "matches_service_center_local_time"
