"""Read-only scheduling timestamp audit; never rewrites appointment data."""
from __future__ import annotations

import asyncio
import json
from collections import Counter
from datetime import datetime, timezone

from sqlalchemy import select, text

from app.core.database import async_session_factory, engine
from app.core.timezone import valid_zone
from app.models.appointment import Appointment
from app.models.appointment_slot import AppointmentSlot
from app.models.service_center import ServiceCenter


def classify_timestamp(stored_at: datetime, local_clock: str, zone_name: str) -> str:
    """Classify likely storage shape for a manual data review, not migration."""
    instant = stored_at if stored_at.tzinfo else stored_at.replace(tzinfo=timezone.utc)
    zone = valid_zone(zone_name)
    if instant.astimezone(zone).strftime("%H:%M") == local_clock[:5]:
        return "matches_service_center_local_time"
    if instant.astimezone(timezone.utc).strftime("%H:%M") == local_clock[:5]:
        return "legacy_local_clock_stored_as_utc_candidate"
    return "manual_review_required"


async def build_report() -> dict:
    report = {
        "read_only": True,
        "warning": "Heuristic counts only. Review source records and backups before any data migration.",
        "service_centers": {},
    }
    async with async_session_factory() as session:
        async with session.begin():
            await session.execute(text("SET TRANSACTION READ ONLY"))
            centers = (await session.execute(select(ServiceCenter.id, ServiceCenter.timezone))).all()
            summaries = {}
            for center_id, zone_name in centers:
                valid_zone(zone_name)
                summaries[center_id] = {
                    "timezone": zone_name,
                    "appointments": Counter(),
                    "slots": Counter(),
                }

            appointments = (await session.execute(select(
                Appointment.service_center_id,
                Appointment.appointment_date,
                Appointment.appointment_time,
            ))).all()
            for center_id, stored_at, wall_clock in appointments:
                summary = summaries.get(center_id)
                if summary:
                    summary["appointments"][classify_timestamp(stored_at, wall_clock, summary["timezone"])] += 1

            slots = (await session.execute(select(
                AppointmentSlot.service_center_id,
                AppointmentSlot.slot_date,
                AppointmentSlot.start_time,
            ))).all()
            for center_id, stored_at, wall_clock in slots:
                summary = summaries.get(center_id)
                if summary:
                    summary["slots"][classify_timestamp(stored_at, wall_clock, summary["timezone"])] += 1

            report["service_centers"] = {
                str(center_id): {
                    "timezone": value["timezone"],
                    "appointments": dict(value["appointments"]),
                    "slots": dict(value["slots"]),
                }
                for center_id, value in summaries.items()
            }
    return report


async def _run() -> None:
    try:
        print(json.dumps(await build_report(), indent=2, sort_keys=True))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_run())
