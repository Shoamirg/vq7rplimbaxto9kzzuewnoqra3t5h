"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Download, ShieldCheck } from "lucide-react";
import { cn } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import type { ReportKpi, ReportResponse, ReportSection } from "@/lib/api/types";
import { AreaChart, BarRows, Donut, Funnel, Sparkline, money, moneyK } from "./charts";

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

function fmtKpi(k: ReportKpi): string {
  const v = k.value;
  if (typeof v === "string") return v;
  if (k.format === "money") return money(v);
  if (k.format === "pct") return `${v}%`;
  if (k.format === "days") return `${v} days`;
  return v.toLocaleString("en-US");
}

export function ReportsWorkspace() {
  const params = useSearchParams();
  const [report, setReport] = useState(params.get("report") === "commercial" ? "commercial" : "executive");
  const [period, setPeriod] = useState("30d");
  const [view, setView] = useState("owner");
  const [data, setData] = useState<ReportResponse | null>(null);

  const load = useCallback(async () => {
    try { setData(await clientFetch<ReportResponse>(`/reports/${report}?period=${period}`)); } catch { /* keep */ }
  }, [report, period]);
  useEffect(() => { load(); }, [load]);

  const allowed = VIEWS[view].titles;
  const groups = (data?.groups ?? []).filter((g) => allowed.length === 0 || allowed.includes(g.title));

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-5 h-14 border-b border-border bg-card shrink-0">
        <span className="font-bold text-foreground">Reports</span>
        <div className="flex gap-1 ml-2">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button key={k} onClick={() => setView(k)}
              className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors",
                view === k ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>{v.label}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn("text-xs font-semibold px-3 py-1.5 rounded-md transition-colors",
                period === p.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>{p.label}</button>
          ))}
        </div>
        <button className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-slate-600 inline-flex items-center gap-1.5"><Download className="size-3.5" /> Export</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <nav className="w-48 shrink-0 bg-slate-900 text-slate-300 overflow-y-auto py-3">
          <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Reports</p>
          {CATEGORIES.map((c) => (
            <button key={c.key} disabled={!c.live} onClick={() => c.live && setReport(c.key)}
              className={cn("w-full flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 rounded-lg text-[13px] text-left",
                report === c.key ? "bg-blue-600/20 text-white" : c.live ? "text-slate-300 hover:bg-slate-800" : "text-slate-500")}
              style={{ width: "calc(100% - 16px)" }}>
              <span className="w-4 text-center">{c.icon}</span>
              <span className="flex-1">{c.label}</span>
              {!c.live && <span className="text-[9px] uppercase tracking-wide text-slate-600">soon</span>}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-5 lg:p-6">
          {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <>
              <h1 className="text-xl font-extrabold">{data.title}</h1>
              <p className="text-sm text-muted-foreground mb-4">Every metric drills into the work behind it.</p>

              <div className="flex gap-2 flex-wrap mb-4">
                {data.questions.map((q) => (
                  <Link key={q.q} href={q.drill}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-card text-slate-600 hover:border-primary/40 hover:text-primary transition-colors">{q.q}</Link>
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
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">{g.title}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {g.kpis.map((k) => <KpiCard key={k.key} k={k} />)}
                  </div>
                </div>
              ))}

              {data.reconciliation && <Reconciliation r={data.reconciliation} />}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {data.sections.map((s) => (
                  <div key={s.title} className={cn(s.span >= 2 && "lg:col-span-2")}>
                    <ChartCard title={s.title} drill={s.drill}><SectionChart s={s} /></ChartCard>
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

function SectionChart({ s }: { s: ReportSection }) {
  if (s.kind === "area") return <AreaChart series={s.data} />;
  if (s.kind === "donut") return <Donut dist={s.data.dist} center={s.data.center} />;
  if (s.kind === "funnel") return <Funnel stages={s.data} />;
  const d = s.data;
  const color = d.color === "amber" ? "#D97706" : d.color === "green" ? "#059669" : "#2563EB";
  const fmt = d.fmt === "money" ? money : d.fmt === "moneyK" ? moneyK : (n: number) => n.toLocaleString("en-US");
  return <BarRows rows={d.rows} color={color} fmt={fmt} bandColors={!!d.bandColors} />;
}

function KpiCard({ k }: { k: ReportKpi }) {
  const d = k.delta;
  return (
    <Link href={k.drill} className="rounded-2xl border border-border bg-card p-3.5 hover:border-primary/40 hover:shadow-[0_6px_20px_-14px_rgba(37,99,235,.5)] transition-all relative group">
      <span className="absolute right-3 top-3.5 text-xs text-muted-foreground/50 group-hover:text-primary">↗</span>
      <p className="text-[11px] text-muted-foreground font-medium truncate">{k.label}</p>
      <p className={cn("text-2xl font-extrabold mt-1", k.tone === "danger" ? "text-red-600" : k.tone === "success" ? "text-emerald-600" : "text-foreground")}>{fmtKpi(k)}</p>
      {d && d.pct != null && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={cn("text-[11px] font-bold px-1.5 rounded", d.dir === "up" ? "text-emerald-600 bg-emerald-50" : d.dir === "down" ? "text-red-600 bg-red-50" : "text-muted-foreground bg-muted")}>
            {d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "—"} {d.pct}%
          </span>
        </div>
      )}
      {k.series && k.series.length > 1 && <Sparkline values={k.series} tone={k.tone === "danger" ? "amber" : "green"} />}
    </Link>
  );
}

function InsightCard({ ins }: { ins: { tone: string; label: string; text: string; drill?: string } }) {
  const body = (
    <div className={cn("rounded-xl border p-3 h-full transition-colors", ins.tone === "watch" ? "border-amber-200 bg-amber-50/40 hover:bg-amber-50" : "border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50/60")}>
      <p className={cn("text-[10px] font-bold uppercase tracking-wide mb-1", ins.tone === "watch" ? "text-amber-700" : "text-indigo-700")}>✦ {ins.label}</p>
      <p className="text-[12.5px] text-slate-700 leading-snug">{ins.text}</p>
    </div>
  );
  return ins.drill ? <Link href={ins.drill}>{body}</Link> : body;
}

function Reconciliation({ r }: { r: import("@/lib/api/types").ReportReconciliation }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 mb-6 flex items-center gap-5 flex-wrap">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-emerald-600" />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Commercial Integrity</p>
          <p className="text-sm font-bold text-foreground">{r.status}</p>
        </div>
      </div>
      <div className="text-center px-3 border-l border-emerald-200">
        <p className="text-lg font-extrabold tabular-nums">{r.ledger_entries.toLocaleString("en-US")}</p>
        <p className="text-[10px] text-muted-foreground">ledger entries</p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {r.checks.map((c) => (
          <span key={c.label} className={cn("text-xs font-medium inline-flex items-center gap-1.5", c.ok ? "text-emerald-700" : "text-red-600")}>
            {c.ok ? <Check className="size-3.5" /> : "✕"} {c.label}
          </span>
        ))}
      </div>
      <span className="ml-auto text-[11px] text-muted-foreground font-mono">
        debit {money(r.debit)} − credit {money(r.credit)} = {money(r.outstanding)}
      </span>
    </div>
  );
}

function ChartCard({ title, drill, children }: { title: string; drill: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 h-full">
      <div className="flex items-center mb-3">
        <span className="text-[13.5px] font-bold">{title}</span>
        <Link href={drill} className="ml-auto text-[11px] font-semibold text-primary hover:underline">Open →</Link>
      </div>
      {children}
    </div>
  );
}
