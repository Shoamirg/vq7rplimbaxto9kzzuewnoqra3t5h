"""Seed the Billing workspace: estimates, invoices, payments, and their timelines.

Live documents flow from the API/EventBus at runtime; this backfills a plausible
commercial board — estimates (draft/sent/approved), invoices (paid/partial/
overdue), first-class payments (card/bank/deposit, various sources), and each
document's financial timeline (as invoice-linked notifications).
"""
from __future__ import annotations

import random
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select

from app.models import Appointment, Invoice, InvoiceLineItem, LedgerEntry, Notification, Payment, ServiceCenter
from app.models.appointment import AppointmentStatus
from app.models.ledger import LedgerDirection, LedgerEntryType
from app.models.invoice import (
    InvoiceKind,
    InvoiceStatus,
    LineKind,
    PaymentKind,
    PaymentMethod,
    PaymentSource,
)

_NOW = datetime.now(timezone.utc)
_CENTS = Decimal("0.01")
_UZS_SCALE = Decimal("10000")


def _m(v) -> Decimal:
    return Decimal(str(v)).quantize(_CENTS, rounding=ROUND_HALF_UP)


def _calc(items: list[dict], tax_rate: Decimal):
    subtotal = Decimal("0"); discount = Decimal("0"); taxable = Decimal("0")
    for it in items:
        lt = _m(it["quantity"]) * _m(it["unit_price"])
        it["line_total"] = lt
        if it["kind"] == LineKind.DISCOUNT:
            discount += abs(lt)
        else:
            subtotal += lt
            if it.get("taxable", True):
                taxable += lt
    base = max(Decimal("0"), taxable - discount)
    tax = _m(base * tax_rate / Decimal("100"))
    total = _m(subtotal - discount + tax)
    return _m(subtotal), _m(discount), tax, total


# kind, status, title(service), items, [payments], mins_ago, due_offset_days
_DOCS = [
    ("invoice", "paid", "Major service",
     [("labor", "Full inspection & diagnostics", 1.5, 80), ("labor", "Oil & filter change", 0.6, 80),
      ("part", "Synthetic oil 5W-30 (5L)", 1, 62), ("part", "Oil filter", 1, 14), ("part", "Air filter", 1, 22)],
     [("bank_transfer", "bank", "payment", None)], 4320, 7),
    ("invoice", "partial", "Battery replacement",
     [("labor", "Battery diagnostic", 0.5, 80), ("labor", "Battery replacement", 0.8, 80),
      ("part", "AGM Battery 12V 80Ah", 1, 180), ("part", "Terminal protector spray", 1, 12),
      ("discount", "Loyalty discount", 1, 20)],
     [("card", "terminal", "deposit", 100)], 60, 7),
    ("invoice", "overdue", "Brake pads + labour",
     [("labor", "Brake pad replacement (front)", 1.2, 80), ("part", "Brake pad set", 1, 90),
      ("part", "Brake cleaner", 1, 10)],
     [], 8640, -4),
    ("invoice", "paid", "Tire rotation",
     [("labor", "Tire rotation & balance", 1.0, 80)],
     [("card", "terminal", "payment", None)], 300, 7),
    ("estimate", "sent", "Suspension overhaul",
     [("labor", "Suspension inspection", 1.0, 80), ("labor", "Strut replacement (pair)", 3.5, 80),
      ("part", "Front struts (pair)", 1, 340), ("part", "Alignment", 1, 90)],
     [], 60, None),
    ("estimate", "approved", "Cabin filter + diagnostics",
     [("labor", "Diagnostics", 1.0, 80), ("part", "Cabin filter", 1, 28)],
     [], 1440, None),
    ("estimate", "draft", "Timing belt (quote)",
     [("labor", "Timing belt replacement", 4.0, 80), ("part", "Timing belt kit", 1, 210)],
     [], 30, None),
]


async def generate_invoices(session, center: ServiceCenter, vehicles) -> int:
    # Derive the (customer, vehicle) pairs from the MOST RECENT appointments so
    # every seeded invoice links to a vehicle that appears on the schedule —
    # making the appointment ↔ billing loop visible on the Appointments page.
    appt_by_vehicle: dict = {}
    completed_by_vehicle: dict = {}
    pairs: list = []
    for a in (await session.execute(
        select(Appointment).where(Appointment.service_center_id == center.id)
        .order_by(Appointment.appointment_date.desc()))).scalars().all():
        if a.vehicle_id not in appt_by_vehicle:
            appt_by_vehicle[a.vehicle_id] = a.id  # latest appointment per vehicle
            pairs.append((a.customer_id, a.vehicle_id))
        if a.status == AppointmentStatus.COMPLETED and a.vehicle_id not in completed_by_vehicle:
            completed_by_vehicle[a.vehicle_id] = a.id
    pairs = pairs[: len(_DOCS)]
    if not pairs:  # fallback if a tenant has no appointments
        pairs = [(v.customer_id, v.id) for v in (vehicles or []) if v.customer_id][: len(_DOCS)]
    if not pairs:
        return 0
    year = _NOW.year
    est_n = inv_n = 0
    created = 0
    notifs: list = []
    linked_appointments: set = set()

    for i, (kind, status, title, raw_items, pays, mins, due_off) in enumerate(_DOCS):
        cust_id, veh_id = pairs[i % len(pairs)]
        base_dt = _NOW - timedelta(minutes=mins)
        tax_rate = _m(12)
        items = [{"kind": k, "description": d, "quantity": q, "unit_price": _m(p * _UZS_SCALE),
                  "taxable": k != LineKind.DISCOUNT} for (k, d, q, p) in raw_items]
        subtotal, discount, tax, total = _calc(items, tax_rate)

        if kind == InvoiceKind.ESTIMATE:
            est_n += 1; code = f"EST-{year}-{est_n:06d}"
        else:
            inv_n += 1; code = f"INV-{year}-{inv_n:06d}"

        amount_paid = Decimal("0")
        for (_m2, _s, pkind, amt) in pays:
            amount_paid += _m(amt * _UZS_SCALE) if amt is not None else total
        amount_paid = min(amount_paid, total)
        balance = _m(total - amount_paid)

        completed_id = completed_by_vehicle.get(veh_id) if kind == InvoiceKind.INVOICE else None
        if completed_id in linked_appointments:
            completed_id = None
        if completed_id is not None:
            linked_appointments.add(completed_id)

        inv = Invoice(
            service_center_id=center.id, code=code, kind=kind, status=status,
            customer_id=cust_id, vehicle_id=veh_id,
            appointment_id=(completed_id if kind == InvoiceKind.INVOICE
                            else appt_by_vehicle.get(veh_id)),
            currency="UZS", tax_rate=tax_rate,
            subtotal=subtotal, discount_total=discount, tax_total=tax, total=total,
            amount_paid=amount_paid, balance=balance,
            issued_at=(base_dt if kind == InvoiceKind.INVOICE else None),
            due_date=(date.today() + timedelta(days=due_off) if due_off is not None else None),
            approved_at=(base_dt if status == InvoiceStatus.APPROVED else None),
            paid_at=(base_dt if status == InvoiceStatus.PAID else None),
            created_at=base_dt,
        )
        session.add(inv)
        await session.flush()
        for order, it in enumerate(items):
            session.add(InvoiceLineItem(
                service_center_id=center.id, invoice_id=inv.id, kind=it["kind"],
                description=it["description"], quantity=_m(it["quantity"]),
                unit_price=_m(it["unit_price"]), line_total=it["line_total"],
                taxable=it["taxable"], sort_order=order))
        # Ledger stream — invoice issued (debit) + each payment (credit) — so
        # Reports/exports project over a complete money-movement history.
        if kind == InvoiceKind.INVOICE:
            session.add(LedgerEntry(
                service_center_id=center.id, customer_id=cust_id, invoice_id=inv.id,
                entry_type=LedgerEntryType.INVOICE_ISSUED, direction=LedgerDirection.DEBIT,
                amount=total, description=f"Invoice issued · {code}", occurred_at=base_dt))
        for order, (method, src, pkind, amt) in enumerate(pays):
            pay_amt = _m(amt * _UZS_SCALE) if amt is not None else total
            session.add(Payment(
                service_center_id=center.id, invoice_id=inv.id, kind=pkind, method=method,
                source=src, amount=pay_amt,
                reference=f"REF-{code[-4:]}-{order}", received_at=base_dt))
            session.add(LedgerEntry(
                service_center_id=center.id, customer_id=cust_id, invoice_id=inv.id,
                entry_type=LedgerEntryType.PAYMENT_RECEIVED, direction=LedgerDirection.CREDIT,
                amount=pay_amt, description=f"{pkind.title()} · {method} · {code}", occurred_at=base_dt))

        # Financial timeline (invoice-linked notifications), read-back on the doc.
        def _n(t, body, when, sev="info"):
            return Notification(
                service_center_id=center.id, category="finance", severity=sev, title=t,
                body=body, entity_type="invoice", entity_id=inv.id, link=f"/billing/{inv.id}",
                vehicle_id=veh_id, customer_id=cust_id, is_read=True, created_at=when)

        if kind == InvoiceKind.ESTIMATE:
            notifs.append(_n(f"Estimate created · {code}", title, base_dt))
            if status in (InvoiceStatus.SENT, InvoiceStatus.APPROVED):
                notifs.append(_n(f"Estimate sent · {code}", None, base_dt + timedelta(minutes=2)))
            if status == InvoiceStatus.APPROVED:
                notifs.append(_n(f"Estimate approved · {code}", None, base_dt + timedelta(minutes=30), "medium"))
        else:
            notifs.append(_n(f"Invoice issued · {code}", f"{total} UZS", base_dt, "medium"))
            for (method, src, pkind, amt) in pays:
                a = _m(amt * _UZS_SCALE) if amt is not None else total
                notifs.append(_n(f"Payment received · {code}", f"{a} UZS · {method}", base_dt + timedelta(minutes=5), "medium"))
            if status == InvoiceStatus.PAID:
                notifs.append(_n(f"Invoice paid · {code}", None, base_dt + timedelta(minutes=6)))
            if status == InvoiceStatus.OVERDUE:
                notifs.append(_n(f"Payment reminder · {code}", "Balance overdue", base_dt + timedelta(days=1), "high"))
        created += 1

    session.add_all(notifs)
    await session.flush()
    return created


# ── ~12 months of paid-invoice history (powers real revenue trends) ──────────
_HIST_SERVICES = [
    ("Brake pad replacement", "Brakes", 1.2, 90),
    ("Major service", "Major service", 2.5, 180),
    ("Battery replacement", "Battery", 0.8, 180),
    ("Tire rotation & balance", "Tires", 1.0, 40),
    ("Oil & filter change", "Oil change", 0.6, 76),
    ("Diagnostics", "Diagnostics", 1.0, 0),
]
_HIST_METHODS = [("card", "terminal"), ("cash", "cash"), ("bank_transfer", "bank"), ("card", "stripe")]


def _month_start(dt: datetime, k: int) -> datetime:
    y, m = dt.year, dt.month - k
    while m <= 0:
        m += 12
        y -= 1
    return dt.replace(year=y, month=m, day=1, hour=9, minute=0, second=0, microsecond=0)


async def generate_invoice_history(session, center: ServiceCenter, vehicles) -> int:
    """Backfill plausible paid invoices across the last ~12 months so revenue
    trends, avg-pay-time and month-over-month deltas are real, not illustrative."""
    pairs = [(v.customer_id, v.id) for v in (vehicles or []) if v.customer_id]
    if not pairs:
        return 0
    rng = random.Random(center.id.int & 0xFFFFFFFF)  # stable per tenant
    tax = _m(12)
    # Assign each customer a payer profile so Commercial Health distributes
    # realistically (~45% fast / 32% normal / 15% slow / 8% risky).
    _PAY_RANGE = {"fast": (0, 4), "normal": (3, 12), "slow": (16, 40), "risky": (20, 55)}
    profiles: dict = {}
    for cust, _v in pairs:
        if cust not in profiles:
            r = rng.random()
            profiles[cust] = "fast" if r < 0.45 else "normal" if r < 0.77 else "slow" if r < 0.92 else "risky"
    n = int(await session.scalar(
        select(func.count()).select_from(Invoice).where(
            Invoice.service_center_id == center.id, Invoice.kind == InvoiceKind.INVOICE)) or 0)
    li, pays, led = [], [], []
    created = 0
    for k in range(12):
        ms = _month_start(_NOW, k)
        cnt = (7 + (3 if k < 2 else 1 if k < 5 else 0)) + rng.randint(0, 3)  # recent months busier
        for _ in range(cnt):
            cust, veh = rng.choice(pairs)
            name, cat, hrs, part = rng.choice(_HIST_SERVICES)
            created_dt = ms.replace(day=rng.randint(1, monthrange(ms.year, ms.month)[1]))
            if created_dt > _NOW:
                continue
            labor, part_c = _m(hrs) * _m(80 * _UZS_SCALE), _m(part * _UZS_SCALE)
            subtotal = labor + part_c
            taxv = _m(subtotal * tax / 100)
            total = _m(subtotal + taxv)
            n += 1
            code = f"INV-{created_dt.year}-{n:06d}"
            prof = profiles[cust]
            lo, hi = _PAY_RANGE[prof]
            # Risky payers leave ~35% of invoices unpaid (overdue); everyone else
            # pays within their profile's window.
            leave_overdue = prof == "risky" and rng.random() < 0.35
            due_date = (created_dt + timedelta(days=7)).date()
            if leave_overdue:
                status, amount_paid, balance, paid_dt = InvoiceStatus.OVERDUE, _m(0), total, None
            else:
                status, amount_paid, balance = InvoiceStatus.PAID, total, _m(0)
                paid_dt = min(_NOW, created_dt + timedelta(days=rng.randint(lo, hi)))
            inv = Invoice(
                service_center_id=center.id, code=code, kind=InvoiceKind.INVOICE,
                status=status, customer_id=cust, vehicle_id=veh, currency="UZS",
                tax_rate=tax, subtotal=subtotal, discount_total=_m(0), tax_total=taxv,
                total=total, amount_paid=amount_paid, balance=balance, issued_at=created_dt,
                due_date=due_date, paid_at=paid_dt, created_at=created_dt)
            session.add(inv)
            await session.flush()
            li.append(InvoiceLineItem(service_center_id=center.id, invoice_id=inv.id, kind=LineKind.LABOR,
                                      description=name, quantity=_m(hrs), unit_price=_m(80 * _UZS_SCALE), line_total=labor, sort_order=0))
            if part > 0:
                li.append(InvoiceLineItem(service_center_id=center.id, invoice_id=inv.id, kind=LineKind.PART,
                                          description=f"{cat} parts", quantity=_m(1), unit_price=part_c, line_total=part_c, sort_order=1))
            led.append(LedgerEntry(service_center_id=center.id, customer_id=cust, invoice_id=inv.id,
                                   entry_type=LedgerEntryType.INVOICE_ISSUED, direction=LedgerDirection.DEBIT,
                                   amount=total, description=f"Invoice issued · {code}", occurred_at=created_dt))
            if not leave_overdue:
                meth, src = rng.choice(_HIST_METHODS)
                pays.append(Payment(service_center_id=center.id, invoice_id=inv.id, kind=PaymentKind.PAYMENT,
                                    method=meth, source=src, amount=total, reference=f"H-{code[-5:]}", received_at=paid_dt))
                led.append(LedgerEntry(service_center_id=center.id, customer_id=cust, invoice_id=inv.id,
                                       entry_type=LedgerEntryType.PAYMENT_RECEIVED, direction=LedgerDirection.CREDIT,
                                       amount=total, description=f"Payment · {meth} · {code}", occurred_at=paid_dt))
            created += 1
    session.add_all(li + pays + led)
    await session.flush()
    return created
