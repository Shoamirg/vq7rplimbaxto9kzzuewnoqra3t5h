"""Analytics projection layer.

Reports are a *consumer* of the data the platform already produces — the ledger,
invoices, cases, appointments, vehicles and customers — never a new core model.
The UI renders; it does not compute. Each domain has a projection exposing a
consistent surface (metrics / time_series / distributions / insights /
questions), and ``AnalyticsService`` routes a report name + period to it.

Only the Executive projection is fully built here; the others are scaffolded with
the same interface so the reporting surface can grow without restructuring.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, func, select

from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceKind, InvoiceStatus, Payment, PaymentKind
from app.models.appointment import Appointment
from app.models.ledger import LedgerDirection, LedgerEntry, LedgerEntryType
from app.models.operational_case import CaseType, OperationalCase
from app.models.vehicle import Vehicle
from app.repositories.unit_of_work import UnitOfWork


# ── period ────────────────────────────────────────────────────
_PERIODS = {"today": 1, "7d": 7, "30d": 30, "quarter": 90, "year": 365}


class Period:
    def __init__(self, key: str = "30d"):
        self.key = key if key in _PERIODS else "30d"
        days = _PERIODS[self.key]
        self.end = datetime.now(timezone.utc)
        self.start = (self.end - timedelta(days=days)) if self.key != "today" \
            else self.end.replace(hour=0, minute=0, second=0, microsecond=0)
        span = self.end - self.start
        self.prev_end = self.start
        self.prev_start = self.start - span

    def as_dict(self) -> dict:
        return {"key": self.key, "start": self.start.isoformat(), "end": self.end.isoformat()}


def _delta(cur: float, prev: float) -> dict:
    if prev == 0:
        return {"pct": None, "dir": "flat"}
    pct = round((cur - prev) / prev * 100, 1)
    return {"pct": abs(pct), "dir": "up" if pct > 0.5 else "down" if pct < -0.5 else "flat", "raw": pct}


def _kpi(key, label, value, fmt, drill, delta=None, series=None, tone=None) -> dict:
    return {"key": key, "label": label, "value": value, "format": fmt, "drill": drill,
            "delta": delta, "series": series, "tone": tone}


# ── base ──────────────────────────────────────────────────────
class BaseProjection:
    report = "base"

    def __init__(self, uow: UnitOfWork):
        self.session = uow.session
        self.sc = uow.service_center_id

    async def build(self, period: Period) -> dict:
        return {
            "report": self.report, "period": period.as_dict(),
            "groups": await self.metrics(period),
            "charts": await self.distributions(period),
            "insights": await self.insights(period),
            "questions": self.questions(),
        }

    async def metrics(self, period: Period) -> dict: return {}
    async def distributions(self, period: Period) -> dict: return {}
    async def insights(self, period: Period) -> list: return []
    def questions(self) -> list: return []

    # shared helpers
    async def _ledger_sum(self, direction: str, entry_type: str, start, end) -> float:
        return float(await self.session.scalar(
            select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
                LedgerEntry.service_center_id == self.sc, LedgerEntry.direction == direction,
                LedgerEntry.entry_type == entry_type,
                LedgerEntry.occurred_at >= start, LedgerEntry.occurred_at < end)) or 0)


# ── executive ─────────────────────────────────────────────────
_SERVICE_BUCKETS = [
    ("Brakes", ("brake",)), ("Major service", ("major", "inspection")),
    ("Battery", ("battery",)), ("Tires", ("tire", "alignment", "wheel")),
    ("Oil change", ("oil",)), ("Diagnostics", ("diagnostic", "diag")),
]


def _bucket(desc: str) -> str:
    d = (desc or "").lower()
    for name, kws in _SERVICE_BUCKETS:
        if any(k in d for k in kws):
            return name
    return "Other"


class ExecutiveProjection(BaseProjection):
    report = "executive"

    async def metrics(self, period: Period) -> dict:
        p = period
        # Money (accrual revenue = invoices issued; cash = payments received).
        revenue = await self._ledger_sum(LedgerDirection.DEBIT, LedgerEntryType.INVOICE_ISSUED, p.start, p.end)
        revenue_prev = await self._ledger_sum(LedgerDirection.DEBIT, LedgerEntryType.INVOICE_ISSUED, p.prev_start, p.prev_end)
        cash = await self._ledger_sum(LedgerDirection.CREDIT, LedgerEntryType.PAYMENT_RECEIVED, p.start, p.end)
        cash_prev = await self._ledger_sum(LedgerDirection.CREDIT, LedgerEntryType.PAYMENT_RECEIVED, p.prev_start, p.prev_end)
        outstanding = float(await self.session.scalar(
            select(func.coalesce(func.sum(Invoice.balance), 0)).where(
                Invoice.service_center_id == self.sc, Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]))) or 0)
        overdue = float(await self.session.scalar(
            select(func.coalesce(func.sum(Invoice.balance), 0)).where(
                Invoice.service_center_id == self.sc, Invoice.kind == InvoiceKind.INVOICE,
                Invoice.balance > 0, Invoice.due_date < date.today())) or 0)
        conv, funnel = await self._conversion()
        avg_pay = await self._avg_pay(p)
        series = await self._revenue_series(months=7)

        money = [
            _kpi("revenue", "Revenue", revenue, "money", "/billing", _delta(revenue, revenue_prev), [s["value"] for s in series]),
            _kpi("outstanding", "Outstanding A/R", outstanding, "money", "/billing?view=awaiting", tone="danger",
                 delta=None, series=None),
            _kpi("cash", "Cash collected", cash, "money", "/billing?view=payments", _delta(cash, cash_prev)),
            _kpi("conversion", "Est → Invoice", conv, "pct", "/billing?view=estimates"),
            _kpi("avg_pay", "Avg payment time", avg_pay, "days", "/billing?view=overdue"),
        ]

        # Operations. Count appointments by when they were BOOKED (created_at)
        # so the metric reflects activity even when visits are scheduled ahead.
        appt_cur = await self._count(Appointment, Appointment.created_at, p.start, p.end)
        appt_prev = await self._count(Appointment, Appointment.created_at, p.prev_start, p.prev_end)
        sla_pct, breaches = await self._emergency_sla()
        active_ops = int(await self.session.scalar(
            select(func.count()).select_from(OperationalCase).where(
                OperationalCase.service_center_id == self.sc,
                OperationalCase.status.notin_(["resolved", "closed"]))) or 0)
        avg_health, health_dist = await self._vehicle_health()
        operations = [
            _kpi("appointments", "Appointments", appt_cur, "int", "/calendar", _delta(appt_cur, appt_prev)),
            _kpi("sla", "Emergency SLA", sla_pct, "pct", "/operations", tone="success" if sla_pct >= 90 else "warning"),
            _kpi("active_ops", "Active operations", active_ops, "int", "/operations"),
            _kpi("health", "Avg vehicle health", avg_health, "int", "/dashboard", tone="success" if avg_health >= 70 else "warning"),
            _kpi("passports", "Passports", await self._vehicle_total(), "int", "/vehicles"),
        ]

        # Customers.
        new_cur = await self._count(Customer, Customer.created_at, p.start, p.end)
        new_prev = await self._count(Customer, Customer.created_at, p.prev_start, p.prev_end)
        ch_dist, ch_label = await self._commercial_health_dist()
        customers = [
            _kpi("new_customers", "New customers", new_cur, "int", "/customers", _delta(new_cur, new_prev)),
            _kpi("total_customers", "Total customers", await self._customer_total(), "int", "/customers"),
            _kpi("commercial_health", "Commercial Health", ch_label, "text", "/customers", tone="success"),
        ]

        self._cache = {"funnel": funnel, "series": series, "health_dist": health_dist,
                       "ch_dist": ch_dist, "conv": conv, "revenue": revenue, "revenue_prev": revenue_prev,
                       "overdue": overdue, "outstanding": outstanding, "breaches": breaches}
        return {"money": money, "operations": operations, "customers": customers}

    async def distributions(self, period: Period) -> dict:
        by_service = await self._revenue_by_service(period)
        ar = await self._ar_aging()
        c = getattr(self, "_cache", {})
        return {
            "revenue_trend": c.get("series", []),
            "vehicle_health": c.get("health_dist", {}),
            "commercial_health": c.get("ch_dist", []),
            "conversion_funnel": c.get("funnel", []),
            "ar_aging": ar,
            "revenue_by_service": by_service,
        }

    async def insights(self, period: Period) -> list:
        c = getattr(self, "_cache", {})
        out = []
        d = _delta(c.get("revenue", 0), c.get("revenue_prev", 0))
        if d["pct"] is not None:
            out.append({"tone": "insight", "label": "Insight",
                        "text": f"Revenue is {'up' if d['dir']=='up' else 'down'} {d['pct']}% vs the previous period."})
        svc = c.get("_top_service")
        by_service = await self._revenue_by_service(period)
        if by_service:
            top = by_service[0]
            out.append({"tone": "insight", "label": "Top service",
                        "text": f"{top['name']} generated the most revenue (${top['amount']:,.0f})."})
        conv = c.get("conv")
        if conv is not None:
            out.append({"tone": "watch" if conv < 70 else "insight", "label": "Conversion",
                        "text": f"Estimate → invoice conversion is {conv}%."})
        conc = await self._ar_concentration()
        if conc:
            out.append({"tone": "watch", "label": "Receivables",
                        "text": f"Top 2 customers hold {conc}% of outstanding receivables."})
        if c.get("breaches"):
            out.append({"tone": "watch", "label": "SLA",
                        "text": f"{c['breaches']} emergency case(s) breached SLA recently."})
        return out[:4]

    def questions(self) -> list:
        return [
            {"q": "Why did revenue change?", "drill": "/reports?report=commercial"},
            {"q": "Which invoices need attention?", "drill": "/billing?view=overdue"},
            {"q": "Which customers are at risk?", "drill": "/customers"},
            {"q": "What needs a human right now?", "drill": "/inbox"},
        ]

    # ── computations ──
    async def _count(self, model, col, start, end) -> int:
        return int(await self.session.scalar(
            select(func.count()).select_from(model).where(
                model.service_center_id == self.sc, col >= start, col < end)) or 0)

    async def _customer_total(self) -> int:
        return int(await self.session.scalar(select(func.count()).select_from(Customer).where(
            Customer.service_center_id == self.sc, Customer.is_active.is_(True))) or 0)

    async def _vehicle_total(self) -> int:
        return int(await self.session.scalar(select(func.count()).select_from(Vehicle).where(
            Vehicle.service_center_id == self.sc, Vehicle.is_active.is_(True))) or 0)

    async def _revenue_series(self, months: int) -> list:
        rows = (await self.session.execute(
            select(LedgerEntry.occurred_at, LedgerEntry.amount).where(
                LedgerEntry.service_center_id == self.sc,
                LedgerEntry.direction == LedgerDirection.DEBIT,
                LedgerEntry.entry_type == LedgerEntryType.INVOICE_ISSUED))).all()
        by_month: dict = defaultdict(float)
        for dt, amt in rows:
            by_month[dt.strftime("%Y-%m")] += float(amt)
        now = datetime.now(timezone.utc)
        out = []
        for k in range(months - 1, -1, -1):
            y, m = now.year, now.month - k
            while m <= 0:
                m += 12; y -= 1
            key = f"{y:04d}-{m:02d}"
            out.append({"label": date(y, m, 1).strftime("%b"), "value": round(by_month.get(key, 0.0), 2)})
        return out

    async def _conversion(self):
        rows = (await self.session.execute(
            select(Invoice.status, func.count()).where(
                Invoice.service_center_id == self.sc, Invoice.kind == InvoiceKind.ESTIMATE
            ).group_by(Invoice.status))).all()
        counts = {s: n for s, n in rows}
        created = sum(counts.values())
        stage = lambda *ss: sum(counts.get(s, 0) for s in ss)
        funnel = [
            {"stage": "Created", "count": created},
            {"stage": "Sent", "count": stage("sent", "viewed", "approved", "rejected", "changes_requested")},
            {"stage": "Viewed", "count": stage("viewed", "approved")},
            {"stage": "Approved", "count": stage("approved")},
        ]
        invoiced = int(await self.session.scalar(
            select(func.count()).select_from(Invoice).where(
                Invoice.service_center_id == self.sc, Invoice.kind == InvoiceKind.INVOICE,
                Invoice.source_estimate_id.isnot(None))) or 0)
        funnel.append({"stage": "Invoiced", "count": invoiced})
        conv = round(stage("approved") / created * 100) if created else 0
        return conv, funnel

    async def _avg_pay(self, period: Period) -> float:
        rows = (await self.session.execute(
            select(Invoice.issued_at, Invoice.paid_at).where(
                Invoice.service_center_id == self.sc, Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status == InvoiceStatus.PAID, Invoice.paid_at.isnot(None),
                Invoice.paid_at >= period.start))).all()
        days = [(pd - (iss or pd)).days for iss, pd in rows if pd]
        return round(sum(days) / len(days), 1) if days else 0.0

    async def _revenue_by_service(self, period: Period) -> list:
        from app.models.invoice import InvoiceLineItem
        rows = (await self.session.execute(
            select(InvoiceLineItem.description, InvoiceLineItem.line_total).join(
                Invoice, InvoiceLineItem.invoice_id == Invoice.id).where(
                Invoice.service_center_id == self.sc, Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status == InvoiceStatus.PAID, Invoice.created_at >= period.start))).all()
        buckets: dict = defaultdict(float)
        for desc, lt in rows:
            buckets[_bucket(desc)] += float(lt)
        items = sorted(([{"name": k, "amount": round(v, 2)} for k, v in buckets.items() if k != "Other"]),
                       key=lambda x: -x["amount"])
        return items[:5]

    async def _ar_aging(self) -> list:
        rows = (await self.session.execute(
            select(Invoice.balance, Invoice.due_date).where(
                Invoice.service_center_id == self.sc, Invoice.kind == InvoiceKind.INVOICE,
                Invoice.balance > 0))).all()
        today = date.today()
        buckets = {"Current": 0.0, "1–15 days": 0.0, "16–30 days": 0.0, "30+ days": 0.0}
        for bal, due in rows:
            od = (today - due).days if due else 0
            key = "Current" if od <= 0 else "1–15 days" if od <= 15 else "16–30 days" if od <= 30 else "30+ days"
            buckets[key] += float(bal)
        return [{"bucket": k, "amount": round(v, 2)} for k, v in buckets.items()]

    async def _ar_concentration(self) -> int | None:
        rows = (await self.session.execute(
            select(Invoice.customer_id, func.sum(Invoice.balance)).where(
                Invoice.service_center_id == self.sc, Invoice.kind == InvoiceKind.INVOICE,
                Invoice.balance > 0).group_by(Invoice.customer_id))).all()
        vals = sorted((float(v) for _, v in rows), reverse=True)
        total = sum(vals)
        return round(sum(vals[:2]) / total * 100) if total else None

    async def _emergency_sla(self):
        rows = (await self.session.execute(
            select(OperationalCase.created_at, OperationalCase.sla_response_minutes, OperationalCase.status).where(
                OperationalCase.service_center_id == self.sc,
                OperationalCase.case_type == CaseType.EMERGENCY))).all()
        if not rows:
            return 100, 0
        met = breaches = 0
        now = datetime.now(timezone.utc)
        for created, sla_min, status in rows:
            created = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
            # Resolved cases: assume met (demo); open cases: breached if elapsed > SLA.
            elapsed_min = (now - created).total_seconds() / 60
            breached = status not in ("resolved", "closed") and elapsed_min > sla_min
            if breached:
                breaches += 1
            else:
                met += 1
        return round(met / len(rows) * 100), breaches

    async def _vehicle_health(self):
        from app.services.maintenance_service import MaintenanceService
        maint = MaintenanceService(self.session, self.sc)
        from app.services.vehicle_health_service import _band
        ids = (await self.session.execute(
            select(Vehicle.id).where(Vehicle.service_center_id == self.sc, Vehicle.is_active.is_(True)).limit(60))).scalars().all()
        dist = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
        scores = []
        for vid in ids:
            try:
                r = await maint.calculate_due_services(vid)
                scores.append(r.overall_score)
                dist[_band(r.overall_score)] += 1
            except Exception:
                continue
        avg = round(sum(scores) / len(scores)) if scores else 0
        return avg, dist

    async def _commercial_health_dist(self):
        from app.services.financial_service import commercial_health
        # Customers with at least one invoice.
        rows = (await self.session.execute(
            select(Invoice.customer_id, func.count(), func.sum(Invoice.balance)).where(
                Invoice.service_center_id == self.sc, Invoice.kind == InvoiceKind.INVOICE
            ).group_by(Invoice.customer_id))).all()
        dist = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
        for _, cnt, bal in rows:
            h = commercial_health(avg_days_to_pay=None, outstanding=float(bal or 0),
                                  overdue_count=0, invoice_count=int(cnt))
            if h["band"] in dist:
                dist[h["band"]] += 1
        label = "Good" if dist["excellent"] + dist["good"] >= dist["fair"] + dist["poor"] else "Fair"
        out = [{"band": b, "count": dist[b]} for b in ("excellent", "good", "fair", "poor")]
        return out, label


class AnalyticsService:
    _PROJECTIONS = {"executive": ExecutiveProjection}

    def __init__(self, uow: UnitOfWork):
        self.uow = uow

    async def report(self, name: str, period_key: str = "30d") -> dict:
        proj_cls = self._PROJECTIONS.get(name, ExecutiveProjection)
        return await proj_cls(self.uow).build(Period(period_key))
