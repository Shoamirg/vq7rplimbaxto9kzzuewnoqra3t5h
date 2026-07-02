"""Seed a realistic notification feed so the bell is alive in the demo.

Live notifications flow from the EventBus at runtime; this backfills a plausible
recent history (varied category + severity + read state) for a fresh demo.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import Notification, ServiceCenter

_NOW = datetime.now(timezone.utc)

# (minutes_ago, category, severity, title, body, link, is_read)
_FEED = [
    (6, "appointment", "info", "Service completed", "Ford Fiesta — health recalculated to 97.", "/calendar", False),
    (34, "vehicle", "high", "Overdue: Brake Pad Replacement", "BMW X5 (GSX3967) needs attention.", "/vehicles", False),
    (58, "passport", "info", "Passport certified", "Toyota Land Cruiser — certified passport issued.", "/vehicles", False),
    (95, "customer", "info", "New customer added", "Michelle Martin was added with 5 vehicles.", "/customers", True),
    (180, "appointment", "low", "Appointment confirmed", "Tomorrow · 10:00 with Dmitri Volkov.", "/calendar", True),
    (320, "vehicle", "medium", "Due soon: Cabin filter", "Honda CR-V is approaching its service window.", "/vehicles", True),
    (1500, "appointment", "medium", "Appointment cancelled", "Customer cancelled — slot freed.", "/calendar", True),
    (1900, "passport", "info", "Passport shared", "A certified passport link was opened.", "/vehicles", True),
]


async def generate_notifications(session, center: ServiceCenter) -> int:
    rows = [
        Notification(
            service_center_id=center.id,
            category=cat, severity=sev, title=title, body=body,
            link=link, is_read=is_read,
            created_at=_NOW - timedelta(minutes=mins),
        )
        for (mins, cat, sev, title, body, link, is_read) in _FEED
    ]
    session.add_all(rows)
    await session.flush()
    return len(rows)
