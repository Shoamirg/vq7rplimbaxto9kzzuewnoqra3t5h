"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Download, ShieldCheck } from "lucide-react";
import { cn } from "@garageos/design-system";

import { useI18n } from "@/lib/i18n/context";
import { clientFetch } from "@/lib/api/client";
import type { ReportKpi, ReportResponse, ReportSection } from "@/lib/api/types";
import { AreaChart, BarRows, Donut, Funnel, Sparkline } from "./charts";

const PERIODS = [
  { key: "today", label: "Today" }, { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" }, { key: "quarter", label: "Quarter" }, { key: "year", label: "Year" },
];
// Saved views = different combinations of the same projections. A view lists the
// group titles it shows (empty = all).
const VIEWS: Record<string, { label: string; titles: string[] }> = {
  owner: { label: "Owner", titles: [] },
  finance: { label: "Finance", titles: ["Money", "Revenue", "Receivables", "Payments"] },
  operations: { label: "Operations", titles: ["Operations"] },
  advisor: { label: "Advisor", titles: ["Customers", "Sales", "Receivables"] },
};
const CATEGORIES = [
  { key: "executive", label: "Executive", icon: "📊", live: true },
  { key: "commercial", label: "Commercial", icon: "💳", live: true },
  { key: "operations", label: "Operations", icon: "🛰️", live: false },
  { key: "customers", label: "Customers", icon: "👥", live: false },
  { key: "vehicles", label: "Vehicles", icon: "🚗", live: false },
  { key: "technicians", label: "Technicians", icon: "🔧", live: false },
];

function useReportText(currency = "UZS") {
  const { t, fmt } = useI18n();
  const text = (value: string) => {
    const key = "reports.text." + value;
    const translated = t(key);
    return translated === key ? value : translated;
  };
  const money = (n: number) => fmt.money(n, currency);
  const fmtKpi = (k: ReportKpi): string => {
    if (typeof k.value === "string") return text(k.value);
    if (k.format === "money") return money(k.value);
    if (k.format === "pct") return fmt.number(k.value) + "%";
    if (k.format === "days") return t("reports.days", { count: fmt.number(k.value) });
    return fmt.number(k.value);
  };
  return { t, fmt, text, money, fmtKpi };
}

export function ReportsWorkspace() {
  const { t, text } = useReportText();
  const params = useSearchParams();
  const [report, setReport] = useState(params.get("report") === "commercial" ? "commercial" : "executive");
  const [period, setPeriod] = useState("30d");
  const [view, setView] = useState("owner");
  const [currency, setCurrency] = useState("UZS");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setData(null);
    setError(false);
    try {
      const result = await clientFetch<ReportResponse>(`/reports/${report}?period=${period}&currency=${currency}`);
      if (id === requestId.current) setData(result);
    } catch { if (id === requestId.current) setError(true); }
  }, [report, period, currency]);
  useEffect(() => { load(); }, [load]);

  const allowed = VIEWS[view].titles;
  const groups = (data?.groups ?? []).filter((g) => allowed.length === 0 || allowed.includes(g.title));

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center flex-wrap gap-3 px-4 py-3 min-h-14 border-b border-border bg-card shrink-0">
        <span className="font-bold text-foreground">{t("nav.reports")}</span>
        <div className="flex gap-1 ml-2">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button key={k} onClick={() => setView(k)}
              className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors",
                view === k ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>{t("reports.view." + k)}</button>
          ))}
        </div>
        <div className="ml-auto max-w-full overflow-x-auto flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn("text-xs font-semibold px-3 py-1.5 rounded-md transition-colors",
                period === p.key ? "bg-card shadow-xs text-foreground" : "text-muted-foreground")}>{t("reports.period." + p.key)}</button>
          ))}
        </div>
        <label className="inline-flex gap-2 items-center text-xs">{t("reports.currency")}
          <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="rounded-lg border border-border bg-card px-2 py-1.5">
            {[...new Set(["UZS", "USD", ...(data?.available_currencies ?? [])])].map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <button disabled title={t("soon.badge")} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-muted-foreground inline-flex items-center gap-1.5"><Download className="size-3.5" /> {t("common.export")} · {t("soon.badge")}</button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        <nav className="flex lg:block lg:w-48 shrink-0 bg-card text-foreground overflow-x-auto lg:overflow-y-auto py-3">
          <p className="hidden lg:block px-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("nav.reports")}</p>
          {CATEGORIES.map((c) => (
            <button key={c.key} disabled={!c.live} onClick={() => c.live && setReport(c.key)}
              className={cn("shrink-0 lg:w-full flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 rounded-lg text-[13px] text-left",
                report === c.key ? "bg-muted text-foreground" : c.live ? "text-muted-foreground hover:bg-muted" : "text-muted-foreground")}
              >
              <span className="w-4 text-center">{c.icon}</span>
              <span className="flex-1">{t("reports.category." + c.key)}</span>
              {!c.live && <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("soon.badge")}</span>}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6">
          {error ? <div role="alert" className="rounded-xl border border-red-300 p-4"><p>{t("common.load_failed")}</p><button onClick={load} className="mt-3 text-primary underline">{t("common.retry")}</button></div> : !data ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : (
            <>
              <h1 className="text-xl font-extrabold">{t("reports." + data.report)}</h1>
              <p className="text-sm text-muted-foreground mb-4">{t("reports.subtitle")}</p>

              <div className="flex gap-2 flex-wrap mb-4">
                {data.questions.map((q) => (
                  <Link key={q.q} href={q.drill}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">{text(q.q)}</Link>
                ))}
              </div>

              {data.insights.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  {data.insights.map((ins, i) => (
                    <InsightCard key={i} ins={ins} />
                  ))}
                </div>
              )}

              {groups.map((g) => (
                <div key={g.title} className="mb-6">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">{text(g.title)}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {g.kpis.map((k) => <KpiCard key={k.key} k={k} currency={data.currency} />)}
                  </div>
                </div>
              ))}

              {data.reconciliation && <Reconciliation r={data.reconciliation} currency={data.currency} />}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {data.sections.map((s) => (
                  <div key={s.title} className={cn(s.span >= 2 && "lg:col-span-2")}>
                    <ChartCard title={text(s.title)} drill={s.drill}><SectionChart s={s} currency={data.currency} /></ChartCard>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionChart({ s, currency }: { s: ReportSection; currency: string }) {
  const { text, fmt, money } = useReportText(currency);
  if (s.kind === "area") return <AreaChart series={s.data.map((row: { label: string; value: number }) => ({ ...row, label: /^\d{4}-\d{2}-\d{2}$/.test(row.label) ? fmt.date(row.label, { month: "short" }) : text(row.label) }))} />;
  if (s.kind === "donut") return <Donut dist={s.data.dist} center={s.data.center} />;
  if (s.kind === "funnel") return <Funnel stages={s.data.map((row: { stage: string; count: number }) => ({ ...row, stage: text(row.stage) }))} />;
  const d = s.data;
  const color = d.color === "amber" ? "#D97706" : d.color === "green" ? "#059669" : "var(--color-foreground)";
  const format = d.fmt === "money" || d.fmt === "moneyK" ? money : fmt.number;
  return <BarRows rows={d.rows.map((row: { label: string; value: number }) => ({ ...row, label: text(row.label) }))} color={color} fmt={format} bandColors={!!d.bandColors} />;
}

function KpiCard({ k, currency }: { k: ReportKpi; currency: string }) {
  const { text, fmtKpi } = useReportText(currency);
  const d = k.delta;
  return (
    <Link href={k.drill} className="rounded-2xl border border-border bg-card p-3.5 hover:border-primary/40 hover:shadow-[0_6px_20px_-14px_rgba(17,19,21,.15)] transition-all relative group">
      <span className="absolute right-3 top-3.5 text-xs text-muted-foreground/50 group-hover:text-primary">↗</span>
      <p className="text-[11px] text-muted-foreground font-medium truncate">{text(k.label)}</p>
      <p className={cn("text-lg lg:text-2xl font-extrabold mt-1 wrap-break-word", k.tone === "danger" ? "text-danger" : k.tone === "success" ? "text-success" : "text-foreground")}>{fmtKpi(k)}</p>
      {d && d.pct != null && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={cn("text-[11px] font-bold px-1.5 rounded", d.dir === "up" ? "text-success bg-success/10" : d.dir === "down" ? "text-danger bg-danger/10" : "text-muted-foreground bg-muted")}>
            {d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "—"} {d.pct}%
          </span>
        </div>
      )}
      {k.series && k.series.length > 1 && <Sparkline values={k.series} tone={k.tone === "danger" ? "amber" : "green"} />}
    </Link>
  );
}

function InsightCard({ ins }: { ins: import("@/lib/api/types").ReportInsight }) {
  const { t, text } = useReportText();
  const body = (
    <div className={cn("rounded-xl border p-3 h-full transition-colors", ins.tone === "watch" ? "border-warning/30 bg-warning/10 hover:bg-warning/15" : "border-border bg-muted hover:bg-accent")}>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-1 text-foreground">✦ {text(ins.label)}</p>
      <p className="text-[12.5px] text-foreground leading-snug">{ins.text_key ? t(ins.text_key, ins.params) : ins.text}</p>
    </div>
  );
  return ins.drill ? <Link href={ins.drill}>{body}</Link> : body;
}

function Reconciliation({ r, currency }: { r: import("@/lib/api/types").ReportReconciliation; currency: string }) {
  const { t, text, fmt, money } = useReportText(currency);
  return (
    <div className="rounded-2xl border border-emerald-200 bg-success/10 p-4 mb-6 flex items-center gap-5 flex-wrap">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-success" />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-success">{t("reports.integrity")}</p>
          <p className="text-sm font-bold text-foreground">{text(r.status)}</p>
        </div>
      </div>
      <div className="text-center px-3 border-l border-emerald-200">
        <p className="text-lg font-extrabold tabular-nums">{fmt.number(r.ledger_entries)}</p>
        <p className="text-[10px] text-muted-foreground">{t("reports.ledger_entries")}</p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {r.checks.map((c) => (
          <span key={c.label} className={cn("text-xs font-medium inline-flex items-center gap-1.5", c.ok ? "text-success" : "text-danger")}>
            {c.ok ? <Check className="size-3.5" /> : "✕"} {text(c.label)}
          </span>
        ))}
      </div>
      <span className="ml-auto text-[11px] text-muted-foreground font-mono">
        {t("reports.debit")} {money(r.debit)} − {t("reports.credit")} {money(r.credit)} ≈ {money(r.outstanding)}
      </span>
    </div>
  );
}

function ChartCard({ title, drill, children }: { title: string; drill: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-border bg-card p-4 h-full">
      <div className="flex items-center mb-3">
        <span className="text-[13.5px] font-bold">{title}</span>
        <Link href={drill} className="ml-auto text-[11px] font-semibold text-primary hover:underline">{t("customer.text.Open →")}</Link>
      </div>
      {children}
    </div>
  );
}
