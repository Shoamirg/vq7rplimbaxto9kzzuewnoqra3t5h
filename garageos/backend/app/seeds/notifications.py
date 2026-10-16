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
    (58, "passport", "info", "Service record available", "Toyota Land Cruiser — vehicle service record is ready to share.", "/vehicles", False),
    (95, "customer", "info", "New customer added", "Michelle Martin was added with 5 vehicles.", "/customers", True),
    (180, "appointment", "low", "Appointment confirmed", "Tomorrow · 10:00 with Dmitri Volkov.", "/calendar", True),
    (320, "vehicle", "medium", "Due soon: Cabin filter", "Honda CR-V is approaching its service window.", "/vehicles", True),
    (1500, "appointment", "medium", "Appointment cancelled", "Customer cancelled — slot freed.", "/calendar", True),
    (1900, "passport", "info", "Service record shared", "A vehicle service record link was opened.", "/vehicles", True),
]


async def generate_notifications(session, center: ServiceCenter, vehicles=None) -> int:
    # Tie the vehicle/passport events to real vehicles (and their owners) so the
    # same events show up on those entities' timelines — one stream, many views.
    linkable = [v for v in (vehicles or []) if v.customer_id][:4]
    rows = []
    for i, (mins, cat, sev, title, body, link, is_read) in enumerate(_FEED):
        v = linkable[i % len(linkable)] if linkable and cat in ("vehicle", "passport", "appointment") else None
        rows.append(Notification(
            service_center_id=center.id,
            category=cat, severity=sev, title=title, body=body,
            link=(f"/vehicles/{v.id}" if v else link), is_read=is_read,
            created_at=_NOW - timedelta(minutes=mins),
            entity_type=("vehicle" if v else None),
            entity_id=(v.id if v else None),
            vehicle_id=(v.id if v else None),
            customer_id=(v.customer_id if v else None),
        ))
    session.add_all(rows)
    await session.flush()
    return len(rows)
