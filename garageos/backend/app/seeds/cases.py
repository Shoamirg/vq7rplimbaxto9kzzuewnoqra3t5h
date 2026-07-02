"""Seed a few Operations Center cases so the dispatch console is alive.

Live cases flow from the API/EventBus at runtime; this backfills a plausible
active board (mixed types, severities, statuses) tied to real customers/vehicles,
plus each case's timeline (as case-linked notifications).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import Notification, OperationalCase, ServiceCenter

_NOW = datetime.now(timezone.utc)

# type, severity, status, title, description, location, mins_ago, assign?, channel
_CASES = [
    ("emergency", "critical", "en_route", "Accident — vehicle not drivable",
     "Rear-end collision, airbags deployed. Customer safe.", "Ring Road, Tashkent", 3, True, "telegram"),
    ("emergency", "high", "assigned", "Battery won't start",
     "Car won't crank; dashboard lights dim.", "Samarqand Road, Tashkent", 8, True, "telegram"),
    ("towing", "medium", "new", "Flat tire on the roadside",
     "Front-left puncture, no spare in the boot.", "Chilonzor District", 22, False, "phone"),
    ("support", "low", "waiting_customer", "Booking assistance (VIP)",
     "Customer wants to move tomorrow's service earlier.", None, 60, False, "web"),
    ("emergency", "high", "resolved", "Overheating engine",
     "Coolant leak on the highway — jump-started and towed in. Resolved.", None, 240, True, "telegram"),
]


async def generate_cases(session, center: ServiceCenter, vehicles, mechanics) -> int:
    pairs = [(v.customer_id, v.id) for v in (vehicles or []) if v.customer_id][:len(_CASES)]
    if not pairs:
        return 0
    year = _NOW.year
    cases, notifs = [], []
    for i, (ctype, sev, st, title, desc, loc, mins, assign, channel) in enumerate(_CASES):
        cust_id, veh_id = pairs[i % len(pairs)]
        mech = mechanics[i % len(mechanics)] if (assign and mechanics) else None
        case = OperationalCase(
            service_center_id=center.id, code=f"OPS-{year}-{i + 1:06d}",
            case_type=ctype, status=st, severity=sev, title=title, description=desc,
            channel=channel, customer_id=cust_id, vehicle_id=veh_id,
            assigned_user_id=(mech.id if mech else None),
            location_text=loc, sla_response_minutes={"emergency": 15, "towing": 20, "support": 120}.get(ctype, 15),
            created_at=_NOW - timedelta(minutes=mins),
        )
        session.add(case)
        cases.append((case, mins, mech, st, ctype))
    await session.flush()

    for case, mins, mech, st, ctype in cases:
        base = _NOW - timedelta(minutes=mins)

        def _n(sev, title, body, when):
            return Notification(
                service_center_id=center.id, category=("emergency" if ctype == "emergency" else "operations"),
                severity=sev, title=title, body=body, entity_type="case", entity_id=case.id,
                link=f"/operations/{case.id}", vehicle_id=case.vehicle_id, customer_id=case.customer_id,
                is_read=True, created_at=when,
            )
        notifs.append(_n(case.severity, f"{ctype.title()} case opened", case.title, base))
        if mech:
            notifs.append(_n("low", "Case assigned", f"Assigned to {mech.full_name}", base + timedelta(minutes=1)))
        if st == "en_route":
            notifs.append(_n("low", "Case · en route", "Technician en route.", base + timedelta(minutes=2)))
        if st == "resolved":
            notifs.append(_n("info", "Case resolved", None, base + timedelta(minutes=30)))

    session.add_all(notifs)
    await session.flush()
    return len(cases)
