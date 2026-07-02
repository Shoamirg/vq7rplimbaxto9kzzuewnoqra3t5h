"""Seed the Billing workspace: estimates, invoices, payments, and their timelines.

Live documents flow from the API/EventBus at runtime; this backfills a plausible
commercial board — estimates (draft/sent/approved), invoices (paid/partial/
overdue), first-class payments (card/bank/deposit, various sources), and each
document's financial timeline (as invoice-linked notifications).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from app.models import Invoice, InvoiceLineItem, Notification, Payment, ServiceCenter
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
    pairs = [(v.customer_id, v.id) for v in (vehicles or []) if v.customer_id][: len(_DOCS)]
    if not pairs:
        return 0
    year = _NOW.year
    est_n = inv_n = 0
    created = 0
    notifs: list = []

    for i, (kind, status, title, raw_items, pays, mins, due_off) in enumerate(_DOCS):
        cust_id, veh_id = pairs[i % len(pairs)]
        base_dt = _NOW - timedelta(minutes=mins)
        tax_rate = _m(12)
        items = [{"kind": k, "description": d, "quantity": q, "unit_price": p,
                  "taxable": k != LineKind.DISCOUNT} for (k, d, q, p) in raw_items]
        subtotal, discount, tax, total = _calc(items, tax_rate)

        if kind == InvoiceKind.ESTIMATE:
            est_n += 1; code = f"EST-{year}-{est_n:06d}"
        else:
            inv_n += 1; code = f"INV-{year}-{inv_n:06d}"

        amount_paid = Decimal("0")
        for (_m2, _s, pkind, amt) in pays:
            amount_paid += _m(amt) if amt is not None else total
        amount_paid = min(amount_paid, total)
        balance = _m(total - amount_paid)

        inv = Invoice(
            service_center_id=center.id, code=code, kind=kind, status=status,
            customer_id=cust_id, vehicle_id=veh_id, currency="USD", tax_rate=tax_rate,
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
        for order, (method, src, pkind, amt) in enumerate(pays):
            session.add(Payment(
                service_center_id=center.id, invoice_id=inv.id, kind=pkind, method=method,
                source=src, amount=(_m(amt) if amt is not None else total),
                reference=f"REF-{code[-4:]}-{order}", received_at=base_dt))

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
            notifs.append(_n(f"Invoice issued · {code}", f"${total}", base_dt, "medium"))
            for (method, src, pkind, amt) in pays:
                a = _m(amt) if amt is not None else total
                notifs.append(_n(f"Payment received · {code}", f"${a} · {method}", base_dt + timedelta(minutes=5), "medium"))
            if status == InvoiceStatus.PAID:
                notifs.append(_n(f"Invoice paid · {code}", None, base_dt + timedelta(minutes=6)))
            if status == InvoiceStatus.OVERDUE:
                notifs.append(_n(f"Payment reminder · {code}", "Balance overdue", base_dt + timedelta(days=1), "high"))
        created += 1

    session.add_all(notifs)
    await session.flush()
    return created
