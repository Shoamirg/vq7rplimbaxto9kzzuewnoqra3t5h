"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { cn } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import type { ReportKpi, ReportResponse } from "@/lib/api/types";
import { AreaChart, BarRows, Donut, Funnel, Sparkline, money, moneyK } from "./charts";

const PERIODS = [
  { key: "today", label: "Today" }, { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" }, { key: "quarter", label: "Quarter" }, { key: "year", label: "Year" },
];
// Saved views = different combinations over the same projection layer.
const VIEWS: Record<string, { label: string; groups: string[] }> = {
  owner: { label: "Owner", groups: ["money", "operations", "customers"] },
  finance: { label: "Finance", groups: ["money"] },
  operations: { label: "Operations", groups: ["operations"] },
  advisor: { label: "Advisor", groups: ["customers", "operations"] },
};
const CATEGORIES = [
  { key: "executive", label: "Executive", icon: "📊", live: true },
  { key: "commercial", label: "Commercial", icon: "💳", live: false },
  { key: "operations", label: "Operations", icon: "🛰️", live: false },
  { key: "customers", label: "Customers", icon: "👥", live: false },
  { key: "vehicles", label: "Vehicles", icon: "🚗", live: false },
  { key: "technicians", label: "Technicians", icon: "🔧", live: false },
];

function fmt(k: ReportKpi): string {
  const v = k.value;
  if (typeof v === "string") return v;
  if (k.format === "money") return money(v);
  if (k.format === "pct") return `${v}%`;
  if (k.format === "days") return `${v} days`;
  return v.toLocaleString("en-US");
}

export function ReportsWorkspace() {
  const [period, setPeriod] = useState("30d");
  const [view, setView] = useState("owner");
  const [data, setData] = useState<ReportResponse | null>(null);

  const load = useCallback(async () => {
    try { setData(await clientFetch<ReportResponse>(`/reports/executive?period=${period}`)); } catch { /* keep */ }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const shownGroups = VIEWS[view].groups;

  return (
    <div className="h-full flex flex-col">
      {/* header */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-border bg-card shrink-0">
        <span className="font-bold text-foreground">Reports</span>
        <div className="flex gap-1 ml-2">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button key={k} onClick={() => setView(k)}
              className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors",
                view === k ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center rounded-lg border border-border bg-paper p-0.5">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn("text-xs font-semibold px-3 py-1.5 rounded-md transition-colors",
                period === p.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>{p.label}</button>
          ))}
        </div>
        <button className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-slate-600 inline-flex items-center gap-1.5"><Download className="size-3.5" /> Export</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* category rail */}
        <nav className="w-48 shrink-0 bg-slate-900 text-slate-300 overflow-y-auto py-3">
          <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Reports</p>
          {CATEGORIES.map((c) => (
            <div key={c.key}
              className={cn("flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 rounded-lg text-[13px]",
                c.key === "executive" ? "bg-blue-600/20 text-white" : "text-slate-400")}>
              <span className="w-4 text-center">{c.icon}</span>
              <span className="flex-1">{c.label}</span>
              {!c.live && <span className="text-[9px] uppercase tracking-wide text-slate-500">soon</span>}
            </div>
          ))}
        </nav>

        {/* content */}
        <div className="flex-1 overflow-y-auto p-5 lg:p-6">
          {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <>
              <h1 className="text-xl font-extrabold">Executive Overview</h1>
              <p className="text-sm text-muted-foreground mb-4">The morning read — every metric drills into the work behind it.</p>

              {/* questions strip */}
              <div className="flex gap-2 flex-wrap mb-4">
                {data.questions.map((q) => (
                  <Link key={q.q} href={q.drill}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-card text-slate-600 hover:border-primary/40 hover:text-primary transition-colors">
                    {q.q}
                  </Link>
                ))}
              </div>

              {/* insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {data.insights.map((ins, i) => (
                  <div key={i} className={cn("rounded-xl border p-3", ins.tone === "watch" ? "border-amber-200 bg-amber-50/40" : "border-indigo-200 bg-indigo-50/30")}>
                    <p className={cn("text-[10px] font-bold uppercase tracking-wide mb-1", ins.tone === "watch" ? "text-amber-700" : "text-indigo-700")}>✦ {ins.label}</p>
                    <p className="text-[12.5px] text-slate-700 leading-snug">{ins.text}</p>
                  </div>
                ))}
              </div>

              {/* KPI groups */}
              {(["money", "operations", "customers"] as const).filter((g) => shownGroups.includes(g)).map((g) => (
                <div key={g} className="mb-6">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5 capitalize">{g}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {data.groups[g].map((k) => <KpiCard key={k.key} k={k} />)}
                  </div>
                </div>
              ))}

              {/* charts */}
              <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr_1fr] gap-3 mb-3">
                <ChartCard title="Revenue trend" drill="/billing"><AreaChart series={data.charts.revenue_trend} /></ChartCard>
                <ChartCard title="Vehicle Health" drill="/vehicles"><Donut dist={data.charts.vehicle_health} center={String(data.groups.operations.find((k) => k.key === "health")?.value ?? "")} /></ChartCard>
                <ChartCard title="Estimate → Invoice" drill="/billing"><Funnel stages={data.charts.conversion_funnel} /></ChartCard>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <ChartCard title="A/R aging" drill="/billing?view=overdue"><BarRows rows={data.charts.ar_aging.map((a) => ({ label: a.bucket, value: a.amount }))} color="#D97706" fmt={money} /></ChartCard>
                <ChartCard title="Commercial Health" drill="/customers"><BarRows rows={data.charts.commercial_health.map((c) => ({ label: c.band, value: c.count }))} bandColors fmt={(n) => String(n)} /></ChartCard>
                <ChartCard title="Revenue by service" drill="/billing"><BarRows rows={data.charts.revenue_by_service.map((s) => ({ label: s.name, value: s.amount }))} fmt={moneyK} /></ChartCard>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ k }: { k: ReportKpi }) {
  const d = k.delta;
  return (
    <Link href={k.drill} className="rounded-2xl border border-border bg-card p-3.5 hover:border-primary/40 hover:shadow-[0_6px_20px_-14px_rgba(37,99,235,.5)] transition-all relative group">
      <span className="absolute right-3 top-3.5 text-xs text-muted-foreground/50 group-hover:text-primary">↗</span>
      <p className="text-[11px] text-muted-foreground font-medium truncate">{k.label}</p>
      <p className={cn("text-2xl font-extrabold mt-1", k.tone === "danger" ? "text-red-600" : k.tone === "success" ? "text-emerald-600" : "text-foreground")}>{fmt(k)}</p>
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

function ChartCard({ title, drill, children }: { title: string; drill: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center mb-3">
        <span className="text-[13.5px] font-bold">{title}</span>
        <Link href={drill} className="ml-auto text-[11px] font-semibold text-primary hover:underline">Open →</Link>
      </div>
      {children}
    </div>
  );
}
