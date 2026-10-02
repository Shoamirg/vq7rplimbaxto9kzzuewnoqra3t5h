"""Analytics projection layer.

Reports are a *consumer* of the data the platform already produces — the ledger,
invoices, cases, appointments, vehicles and customers — never a new core model.
The UI renders; it does not compute.

A projection returns a GENERIC report contract so one frontend renders them all:

    { report, period, questions[], insights[], groups[{title, kpis[]}],
      sections[{title, kind, drill, span, data}], reconciliation? }

Shared computations live on ``BaseProjection``; each domain projection composes
them. ``AnalyticsService`` routes a report name + period to a projection.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import case, func, select

from app.models.appointment import Appointment
from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceKind, InvoiceLineItem, InvoiceStatus, Payment, PaymentKind
from app.models.ledger import LedgerDirection, LedgerEntry, LedgerEntryType
from app.models.operational_case import CaseType, OperationalCase
from app.models.vehicle import Vehicle
from app.repositories.unit_of_work import UnitOfWork

_OUTSTANDING = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]
_PERIODS = {"today": 1, "7d": 7, "30d": 30, "quarter": 90, "year": 365}


class Period:
    def __init__(self, key: str = "30d"):
        self.key = key if key in _PERIODS else "30d"
        self.end = datetime.now(timezone.utc)
        self.start = (self.end - timedelta(days=_PERIODS[self.key])) if self.key != "today" \
            else self.end.replace(hour=0, minute=0, second=0, microsecond=0)
        span = self.end - self.start
        self.prev_end, self.prev_start = self.start, self.start - span

    def as_dict(self) -> dict:
        return {"key": self.key, "start": self.start.isoformat(), "end": self.end.isoformat()}


def _delta(cur: float, prev: float) -> dict | None:
    if prev == 0:
        return None
    pct = round((cur - prev) / prev * 100, 1)
    return {"pct": abs(pct), "dir": "up" if pct > 0.5 else "down" if pct < -0.5 else "flat", "raw": pct}


def _kpi(key, label, value, fmt, drill, delta=None, series=None, tone=None) -> dict:
    return {"key": key, "label": label, "value": value, "format": fmt, "drill": drill,
            "delta": delta, "series": series, "tone": tone}


def _section(title, kind, drill, data, span=1) -> dict:
    return {"title": title, "kind": kind, "drill": drill, "span": span, "data": data}


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


def _commercial_health(avg_days, outstanding, overdue_count, invoice_count) -> dict:
    from app.services.financial_service import commercial_health
    return commercial_health(avg_days_to_pay=avg_days, outstanding=outstanding,
                             overdue_count=overdue_count, invoice_count=invoice_count)


# ── base ──────────────────────────────────────────────────────
class BaseProjection:
    report = "base"
    title = "Report"

    def __init__(self, uow: UnitOfWork, currency: str = "UZS"):
        self.currency = currency
        self.session = uow.session
        self.sc = uow.service_center_id

    async def build(self, period: Period) -> dict:
        groups = await self.groups(period)
        return {
            "report": self.report, "title": self.title, "period": period.as_dict(),
            "currency": self.currency,
            "available_currencies": sorted(set((await self.session.execute(select(Invoice.currency).where(Invoice.service_center_id == self.sc, Invoice.is_active.is_(True)).distinct())).scalars().all()) | {self.currency}),
            "questions": self.questions(), "insights": await self.insights(period),
            "groups": groups, "sections": await self.sections(period),
            "reconciliation": await self.reconciliation(),
        }

    async def groups(self, period: Period) -> list: return []
    async def sections(self, period: Period) -> list: return []
    async def insights(self, period: Period) -> list: return []
    def questions(self) -> list: return []
    async def reconciliation(self) -> dict | None: return None

    # ── shared computations ──
    async def _ledger_sum(self, direction, entry_type, start, end) -> float:
        return float(await self.session.scalar(
            select(func.coalesce(func.sum(LedgerEntry.amount), 0)).outerjoin(Invoice, LedgerEntry.invoice_id == Invoice.id).where(
                LedgerEntry.service_center_id == self.sc, func.coalesce(Invoice.currency, LedgerEntry.currency) == self.currency, LedgerEntry.direction == direction,
                LedgerEntry.entry_type == entry_type,
                LedgerEntry.occurred_at >= start, LedgerEntry.occurred_at < end)) or 0)

    async def _revenue(self, p: Period): return await self._ledger_sum(LedgerDirection.DEBIT, LedgerEntryType.INVOICE_ISSUED, p.start, p.end)
    async def _revenue_prev(self, p: Period): return await self._ledger_sum(LedgerDirection.DEBIT, LedgerEntryType.INVOICE_ISSUED, p.prev_start, p.prev_end)
    async def _cash(self, p: Period): return await self._ledger_sum(LedgerDirection.CREDIT, LedgerEntryType.PAYMENT_RECEIVED, p.start, p.end)
    async def _cash_prev(self, p: Period): return await self._ledger_sum(LedgerDirection.CREDIT, LedgerEntryType.PAYMENT_RECEIVED, p.prev_start, p.prev_end)

    async def _outstanding(self) -> float:
        return float(await self.session.scalar(
            select(func.coalesce(func.sum(Invoice.balance), 0)).where(
                Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status.in_(_OUTSTANDING))) or 0)

    async def _overdue(self) -> float:
        return float(await self.session.scalar(
            select(func.coalesce(func.sum(Invoice.balance), 0)).where(
                Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status.in_(_OUTSTANDING),
                Invoice.balance > 0, Invoice.due_date < date.today())) or 0)

    async def _revenue_series(self, months=7) -> list:
        rows = (await self.session.execute(
            select(LedgerEntry.occurred_at, LedgerEntry.amount).outerjoin(Invoice, LedgerEntry.invoice_id == Invoice.id).where(
                LedgerEntry.service_center_id == self.sc, func.coalesce(Invoice.currency, LedgerEntry.currency) == self.currency,
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
            out.append({"label": date(y, m, 1).isoformat(), "value": round(by_month.get(f"{y:04d}-{m:02d}", 0.0), 2)})
        return out

    async def _conversion(self):
        rows = (await self.session.execute(
            select(Invoice.status, func.count()).where(
                Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.ESTIMATE
            ).group_by(Invoice.status))).all()
        c = {s: n for s, n in rows}
        created = sum(c.values())
        st = lambda *ss: sum(c.get(s, 0) for s in ss)
        invoiced = int(await self.session.scalar(
            select(func.count()).select_from(Invoice).where(
                Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
                Invoice.source_estimate_id.isnot(None))) or 0)
        funnel = [
            {"stage": "Created", "count": created},
            {"stage": "Sent", "count": st("sent", "viewed", "approved", "rejected", "changes_requested")},
            {"stage": "Viewed", "count": st("viewed", "approved")},
            {"stage": "Approved", "count": st("approved")},
            {"stage": "Invoiced", "count": invoiced},
        ]
        conv = round(st("approved") / created * 100) if created else 0
        approval = round(st("approved") / max(1, st("approved", "rejected")) * 100) if st("approved", "rejected") else 0
        return conv, approval, funnel, created, st("rejected")

    async def _avg_pay(self, since=None) -> float:
        q = select(Invoice.issued_at, Invoice.paid_at).where(
            Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
            Invoice.status == InvoiceStatus.PAID, Invoice.paid_at.isnot(None))
        if since is not None:
            q = q.where(Invoice.paid_at >= since)
        rows = (await self.session.execute(q)).all()
        days = [(pd - (iss or pd)).days for iss, pd in rows if pd]
        return round(sum(days) / len(days), 1) if days else 0.0

    async def _revenue_by_service(self, p: Period) -> list:
        rows = (await self.session.execute(
            select(InvoiceLineItem.description, InvoiceLineItem.line_total).join(
                Invoice, InvoiceLineItem.invoice_id == Invoice.id).where(
                Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status == InvoiceStatus.PAID, Invoice.created_at >= p.start))).all()
        b: dict = defaultdict(float)
        for desc, lt in rows:
            b[_bucket(desc)] += float(lt)
        items = sorted(([{"label": k, "value": round(v, 2)} for k, v in b.items() if k != "Other"]), key=lambda x: -x["value"])
        return items[:6]

    async def _revenue_by_customer(self, p: Period, limit=6) -> list:
        rows = (await self.session.execute(
            select(Invoice.customer_id, func.sum(Invoice.total)).where(
                Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status == InvoiceStatus.PAID, Invoice.created_at >= p.start
            ).group_by(Invoice.customer_id).order_by(func.sum(Invoice.total).desc()).limit(limit))).all()
        out = []
        for cid, tot in rows:
            cust = await self.session.get(Customer, cid)
            out.append({"label": cust.full_name if cust else "—", "value": round(float(tot), 2)})
        return out

    async def _ar_aging(self) -> list:
        rows = (await self.session.execute(
            select(Invoice.balance, Invoice.due_date).where(
                Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status.in_(_OUTSTANDING), Invoice.balance > 0))).all()
        today = date.today()
        buckets = {"Current": 0.0, "1–15 days": 0.0, "16–30 days": 0.0, "30+ days": 0.0}
        for bal, due in rows:
            od = (today - due).days if due else 0
            key = "Current" if od <= 0 else "1–15 days" if od <= 15 else "16–30 days" if od <= 30 else "30+ days"
            buckets[key] += float(bal)
        return [{"label": k, "value": round(v, 2)} for k, v in buckets.items()]

    async def _ar_concentration(self):
        rows = (await self.session.execute(
            select(Invoice.customer_id, func.sum(Invoice.balance)).where(
                Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status.in_(_OUTSTANDING),
                Invoice.balance > 0).group_by(Invoice.customer_id))).all()
        vals = sorted((float(v) for _, v in rows), reverse=True)
        total = sum(vals)
        return round(sum(vals[:2]) / total * 100) if total else None

    async def _payment_methods(self, p: Period) -> list:
        rows = (await self.session.execute(
            select(Payment.method, func.sum(Payment.amount)).join(Invoice, Payment.invoice_id == Invoice.id).where(
                Payment.service_center_id == self.sc, Invoice.currency == self.currency, Payment.kind != PaymentKind.REFUND,
                Payment.received_at >= p.start).group_by(Payment.method))).all()
        return sorted(([{"label": m.replace("_", " "), "value": round(float(v), 2)} for m, v in rows]), key=lambda x: -x["value"])

    async def _customer_health(self):
        """Per-customer Commercial Health bands, from actual pay behaviour."""
        rows = (await self.session.execute(
            select(Invoice.customer_id, Invoice.status, Invoice.balance, Invoice.issued_at,
                   Invoice.paid_at, Invoice.due_date, Invoice.total).where(
                Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE))).all()
        agg: dict = defaultdict(lambda: {"cnt": 0, "outstanding": 0.0, "overdue": 0, "days": []})
        today = date.today()
        for cid, status, bal, iss, paid, due, total in rows:
            a = agg[cid]
            a["cnt"] += 1
            if status in _OUTSTANDING:
                a["outstanding"] += float(bal) / max(float(total), 0.01) * 150
            if status in _OUTSTANDING and float(bal) > 0 and due and due < today:
                a["overdue"] += 1
            if status == InvoiceStatus.PAID and paid:
                a["days"].append((paid.date() - (iss.date() if iss else paid.date())).days)
        dist = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
        for a in agg.values():
            avg = round(sum(a["days"]) / len(a["days"]), 1) if a["days"] else None
            h = _commercial_health(avg, a["outstanding"], a["overdue"], a["cnt"])
            if h["band"] in dist:
                dist[h["band"]] += 1
        return dist

    async def _count(self, model, col, start, end) -> int:
        return int(await self.session.scalar(
            select(func.count()).select_from(model).where(
                model.service_center_id == self.sc, col >= start, col < end)) or 0)

    async def _emergency_sla(self):
        rows = (await self.session.execute(
            select(OperationalCase.created_at, OperationalCase.sla_response_minutes, OperationalCase.status).where(
                OperationalCase.service_center_id == self.sc, OperationalCase.case_type == CaseType.EMERGENCY))).all()
        if not rows:
            return 100, 0
        now = datetime.now(timezone.utc)
        breaches = 0
        for created, sla_min, status in rows:
            created = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
            if status not in ("resolved", "closed") and (now - created).total_seconds() / 60 > sla_min:
                breaches += 1
        return round((len(rows) - breaches) / len(rows) * 100), breaches

    async def _vehicle_health(self):
        from app.services.maintenance_service import MaintenanceService
        from app.services.vehicle_health_service import _band
        maint = MaintenanceService(self.session, self.sc)
        ids = (await self.session.execute(
            select(Vehicle.id).where(Vehicle.service_center_id == self.sc, Vehicle.is_active.is_(True)).limit(60))).scalars().all()
        dist = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
        scores = []
        for vid in ids:
            try:
                r = await maint.calculate_due_services(vid)
                scores.append(r.overall_score); dist[_band(r.overall_score)] += 1
            except Exception:
                continue
        return (round(sum(scores) / len(scores)) if scores else 0), dist

    async def _total(self, model) -> int:
        return int(await self.session.scalar(select(func.count()).select_from(model).where(
            model.service_center_id == self.sc, model.is_active.is_(True))) or 0)


# ── executive ─────────────────────────────────────────────────
class ExecutiveProjection(BaseProjection):
    report, title = "executive", "Executive Overview"

    async def groups(self, p: Period) -> list:
        rev, rev_p = await self._revenue(p), await self._revenue_prev(p)
        cash, cash_p = await self._cash(p), await self._cash_prev(p)
        out, over = await self._outstanding(), await self._overdue()
        conv, approval, funnel, *_ = await self._conversion()
        avg_pay = await self._avg_pay(p.start)
        series = await self._revenue_series()
        appt = await self._count(Appointment, Appointment.created_at, p.start, p.end)
        appt_p = await self._count(Appointment, Appointment.created_at, p.prev_start, p.prev_end)
        sla, breaches = await self._emergency_sla()
        active = int(await self.session.scalar(select(func.count()).select_from(OperationalCase).where(
            OperationalCase.service_center_id == self.sc, OperationalCase.status.notin_(["resolved", "closed"]))) or 0)
        avg_h, health_dist = await self._vehicle_health()
        new_c = await self._count(Customer, Customer.created_at, p.start, p.end)
        new_c_p = await self._count(Customer, Customer.created_at, p.prev_start, p.prev_end)
        ch_dist = await self._customer_health()
        ch_label = "Good" if ch_dist["excellent"] + ch_dist["good"] >= ch_dist["fair"] + ch_dist["poor"] else "Fair"

        self._c = {"rev": rev, "rev_p": rev_p, "conv": conv, "over": over, "breaches": breaches,
                   "series": series, "health_dist": health_dist, "ch_dist": ch_dist, "avg_h": avg_h, "funnel": funnel}
        return [
            {"title": "Money", "kpis": [
                _kpi("revenue", "Revenue", rev, "money", "/billing", _delta(rev, rev_p), [s["value"] for s in series]),
                _kpi("outstanding", "Outstanding A/R", out, "money", "/billing?view=awaiting", tone="danger"),
                _kpi("cash", "Cash collected", cash, "money", "/billing?view=payments", _delta(cash, cash_p)),
                _kpi("conversion", "Est → Invoice", conv, "pct", "/billing?view=estimates"),
                _kpi("avg_pay", "Avg payment time", avg_pay, "days", "/billing?view=overdue")]},
            {"title": "Operations", "kpis": [
                _kpi("appointments", "Appointments", appt, "int", "/calendar", _delta(appt, appt_p)),
                _kpi("sla", "Emergency SLA", sla, "pct", "/operations", tone="success" if sla >= 90 else "warning"),
                _kpi("active", "Active operations", active, "int", "/operations"),
                _kpi("health", "Avg vehicle health", avg_h, "int", "/vehicles", tone="success" if avg_h >= 70 else "warning"),
                _kpi("passports", "Passports", await self._total(Vehicle), "int", "/vehicles")]},
            {"title": "Customers", "kpis": [
                _kpi("new", "New customers", new_c, "int", "/customers", _delta(new_c, new_c_p)),
                _kpi("total", "Total customers", await self._total(Customer), "int", "/customers"),
                _kpi("ch", "Commercial Health", ch_label, "text", "/customers", tone="success")]},
        ]

    async def sections(self, p: Period) -> list:
        c = self._c
        return [
            _section("Revenue trend", "area", "/billing", c["series"], span=2),
            _section("Vehicle Health", "donut", "/vehicles", {"dist": c["health_dist"], "center": str(c["avg_h"])}),
            _section("Estimate → Invoice", "funnel", "/billing?view=estimates", c["funnel"]),
            _section("A/R aging", "bars", "/billing?view=overdue", {"rows": await self._ar_aging(), "fmt": "money", "color": "amber"}),
            _section("Commercial Health", "bars", "/customers",
                     {"rows": [{"label": b, "value": c["ch_dist"][b]} for b in ("excellent", "good", "fair", "poor")], "bandColors": True}),
            _section("Revenue by service", "bars", "/billing", {"rows": await self._revenue_by_service(p), "fmt": "moneyK"}),
        ]

    async def insights(self, p: Period) -> list:
        c = self._c
        out = []
        d = _delta(c["rev"], c["rev_p"])
        svc = await self._revenue_by_service(p)
        if d:
            top = f", led by {svc[0]['label'].lower()}" if svc else ""
            out.append({"tone": "insight", "label": "Revenue",
                        "text_key": "reports.revenue_change", "params": {"pct": d.get("raw", d["pct"])},
                        "text": f"Revenue is {'up' if d['dir']=='up' else 'down'} {d['pct']}% vs the previous period{top}. Open the Commercial report.",
                        "drill": "/reports?report=commercial"})
        if c["conv"] < 70:
            out.append({"tone": "watch", "label": "Conversion",
                        "text_key": "reports.conversion_watch", "params": {"pct": c["conv"]},
                        "text": f"Estimate → invoice conversion is {c['conv']}% — below target. Review open estimates.",
                        "drill": "/billing?view=estimates"})
        conc = await self._ar_concentration()
        if conc and conc >= 30:
            out.append({"tone": "watch", "label": "Receivables",
                        "text_key": "reports.ar_watch", "params": {"pct": conc},
                        "text": f"Two customers account for {conc}% of outstanding receivables. Open A/R aging.",
                        "drill": "/billing?view=overdue"})
        if c["breaches"]:
            out.append({"tone": "watch", "label": "SLA",
                        "text_key": "reports.sla_watch", "params": {"count": c["breaches"]},
                        "text": f"{c['breaches']} emergency case(s) breached SLA. Open Operations.",
                        "drill": "/operations"})
        return out[:4]

    def questions(self) -> list:
        return [
            {"q": "Why did revenue change?", "drill": "/reports?report=commercial"},
            {"q": "Which invoices need attention?", "drill": "/billing?view=overdue"},
            {"q": "Which customers are at risk?", "drill": "/customers"},
            {"q": "What needs a human right now?", "drill": "/inbox"},
        ]


# ── commercial ────────────────────────────────────────────────
class CommercialProjection(BaseProjection):
    report, title = "commercial", "Commercial"

    async def groups(self, p: Period) -> list:
        rev, rev_p = await self._revenue(p), await self._revenue_prev(p)
        cash, cash_p = await self._cash(p), await self._cash_prev(p)
        out, over = await self._outstanding(), await self._overdue()
        avg_pay = await self._avg_pay(p.start)
        conv, approval, funnel, est_created, lost = await self._conversion()
        paid_cnt = int(await self.session.scalar(select(func.count()).select_from(Invoice).where(
            Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
            Invoice.status == InvoiceStatus.PAID, Invoice.created_at >= p.start)) or 0)
        avg_inv = round(rev / paid_cnt, 2) if paid_cnt else 0
        collection = round(cash / (cash + out) * 100) if (cash + out) else 100
        refunds = float(await self.session.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).join(Invoice, Payment.invoice_id == Invoice.id).where(
            Payment.service_center_id == self.sc, Invoice.currency == self.currency, Payment.kind == PaymentKind.REFUND, Payment.received_at >= p.start)) or 0)
        deposits = int(await self.session.scalar(select(func.count()).select_from(Payment).join(Invoice, Payment.invoice_id == Invoice.id).where(
            Payment.service_center_id == self.sc, Invoice.currency == self.currency, Payment.kind == PaymentKind.DEPOSIT)) or 0)
        overdue_cnt = int(await self.session.scalar(select(func.count()).select_from(Invoice).where(
            Invoice.service_center_id == self.sc, Invoice.currency == self.currency, Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
            Invoice.status.in_(_OUTSTANDING),
            Invoice.balance > 0, Invoice.due_date < date.today())) or 0)
        self._series = await self._revenue_series()
        self._funnel = funnel
        self._c = {"rev": rev, "rev_p": rev_p, "conv": conv, "over": over}
        return [
            {"title": "Revenue", "kpis": [
                _kpi("revenue", "Revenue", rev, "money", "/billing", _delta(rev, rev_p), [s["value"] for s in self._series]),
                _kpi("avg_invoice", "Avg invoice value", avg_inv, "money", "/billing"),
                _kpi("paid_invoices", "Paid invoices", paid_cnt, "int", "/billing")]},
            {"title": "Receivables", "kpis": [
                _kpi("outstanding", "Outstanding", out, "money", "/billing?view=awaiting", tone="danger" if out else None),
                _kpi("overdue", "Overdue", over, "money", "/billing?view=overdue", tone="danger" if over else None),
                _kpi("overdue_cnt", "Overdue invoices", overdue_cnt, "int", "/billing?view=overdue"),
                _kpi("collection", "Collection rate", collection, "pct", "/billing", tone="success" if collection >= 90 else "warning"),
                _kpi("avg_pay", "Avg payment time", avg_pay, "days", "/billing?view=overdue")]},
            {"title": "Sales", "kpis": [
                _kpi("est_created", "Estimates created", est_created, "int", "/billing?view=estimates"),
                _kpi("approval", "Approval rate", approval, "pct", "/billing?view=estimates"),
                _kpi("conversion", "Est → Invoice", conv, "pct", "/billing?view=estimates"),
                _kpi("lost", "Lost estimates", lost, "int", "/billing?view=estimates")]},
            {"title": "Payments", "kpis": [
                _kpi("cash", "Cash collected", cash, "money", "/billing?view=payments", _delta(cash, cash_p)),
                _kpi("refunds", "Refunds", refunds, "money", "/billing?view=payments"),
                _kpi("deposits", "Deposits", deposits, "int", "/billing?view=payments")]},
        ]

    async def sections(self, p: Period) -> list:
        return [
            _section("Revenue trend", "area", "/billing", self._series, span=2),
            _section("Estimate → Invoice", "funnel", "/billing?view=estimates", self._funnel),
            _section("Revenue by service", "bars", "/billing", {"rows": await self._revenue_by_service(p), "fmt": "moneyK"}),
            _section("Top customers by revenue", "bars", "/customers", {"rows": await self._revenue_by_customer(p), "fmt": "moneyK"}),
            _section("A/R aging", "bars", "/billing?view=overdue", {"rows": await self._ar_aging(), "fmt": "money", "color": "amber"}),
            _section("Payment methods", "bars", "/billing?view=payments", {"rows": await self._payment_methods(p), "fmt": "moneyK", "color": "green"}),
        ]

    async def insights(self, p: Period) -> list:
        c = self._c
        out = []
        d = _delta(c["rev"], c["rev_p"])
        svc = await self._revenue_by_service(p)
        if d and svc:
            out.append({"tone": "insight", "label": "Revenue",
                        "text_key": "reports.revenue_change", "params": {"pct": d.get("raw", d["pct"])},
                        "text": f"Revenue {'increased' if d['dir']=='up' else 'declined'} {d['pct']}% vs the previous period; {svc[0]['label']} contributed the most (${svc[0]['value']:,.0f}).",
                        "drill": "/billing"})
        conc = await self._ar_concentration()
        if conc:
            out.append({"tone": "watch" if conc >= 30 else "insight", "label": "Receivables",
                        "text_key": "reports.ar_watch", "params": {"pct": conc},
                        "text": f"Top 2 customers hold {conc}% of outstanding receivables. Open A/R aging.",
                        "drill": "/billing?view=overdue"})
        if c["conv"] < 70:
            out.append({"tone": "watch", "label": "Sales",
                        "text_key": "reports.conversion_watch", "params": {"pct": c["conv"]},
                        "text": f"Estimate conversion is {c['conv']}%. Follow up on unanswered estimates.",
                        "drill": "/billing?view=estimates"})
        return out[:4]

    def questions(self) -> list:
        return [
            {"q": "Where is revenue coming from?", "drill": "/billing"},
            {"q": "Who owes us money?", "drill": "/billing?view=overdue"},
            {"q": "Are estimates converting?", "drill": "/billing?view=estimates"},
        ]

    async def reconciliation(self) -> dict:
        entries = int(await self.session.scalar(select(func.count()).select_from(LedgerEntry).outerjoin(Invoice, LedgerEntry.invoice_id == Invoice.id).where(
            LedgerEntry.service_center_id == self.sc, func.coalesce(Invoice.currency, LedgerEntry.currency) == self.currency)) or 0)
        debit = await self._ledger_all(LedgerDirection.DEBIT)
        credit = await self._ledger_all(LedgerDirection.CREDIT)
        outstanding = await self._outstanding()
        # Ledger identity: issued (debit) − collected (credit) ≈ outstanding (± rounding).
        diff = abs((debit - credit) - outstanding)
        checks = [
            {"label": "Debit − credit ≈ outstanding", "ok": diff < 1.0},
        ]
        return {"ledger_entries": entries, "checks": checks,
                "status": "Projection healthy" if all(c["ok"] for c in checks) else "Review",
                "debit": round(debit, 2), "credit": round(credit, 2), "outstanding": round(outstanding, 2)}

    async def _ledger_all(self, direction) -> float:
        # Refunds increase the receivable. Normalize historic refund rows that
        # were appended as credits, without rewriting the append-only ledger.
        effective_direction = case(
            (LedgerEntry.entry_type == LedgerEntryType.REFUND_ISSUED, LedgerDirection.DEBIT),
            else_=LedgerEntry.direction,
        )
        return float(await self.session.scalar(
            select(func.coalesce(func.sum(LedgerEntry.amount), 0)).outerjoin(Invoice, LedgerEntry.invoice_id == Invoice.id).where(
                LedgerEntry.service_center_id == self.sc, func.coalesce(Invoice.currency, LedgerEntry.currency) == self.currency,
                Invoice.is_active.is_(True), Invoice.kind == InvoiceKind.INVOICE,
                Invoice.status != InvoiceStatus.VOID, effective_direction == direction)) or 0)


class AnalyticsService:
    _PROJECTIONS = {"executive": ExecutiveProjection, "commercial": CommercialProjection}

    def __init__(self, uow: UnitOfWork):
        self.uow = uow

    async def report(self, name: str, period_key: str = "30d", currency: str = "UZS") -> dict:
        proj = self._PROJECTIONS.get(name, ExecutiveProjection)
        return await proj(self.uow, currency=currency).build(Period(period_key))
