"use client";

// Hand-built SVG/CSS chart primitives — no charting dependency, full styling
// control, and a lean bundle. Enough for almost every GarageOS report.

import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/dictionaries";
import { formatNumber } from "@/lib/i18n/format";

export function money(n: number, locale: Locale = "en"): string {
  return "$" + formatNumber(locale, Math.round(n));
}
export function moneyK(n: number, locale: Locale = "en"): string {
  return n >= 1000 ? "$" + formatNumber(locale, n / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k" : money(n, locale);
}

// Small inline sparkline (bars).
export function Sparkline({ values, tone = "blue" }: { values: number[]; tone?: string }) {
  const max = Math.max(1, ...values);
  const cls = tone === "green" ? "bg-emerald-100" : tone === "amber" ? "bg-amber-100" : "bg-blue-100";
  return (
    <div className="flex items-end gap-0.5 h-7 mt-2">
      {values.map((v, i) => (
        <div key={i} className={`flex-1 rounded-t-sm ${cls}`} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

// Area/line chart for a labelled series.
export function AreaChart({ series }: { series: { label: string; value: number }[] }) {
  const { t } = useI18n();
  if (series.length === 0) return <div className="h-[150px] grid place-items-center text-xs text-muted-foreground">{t("rep.no_data")}</div>;
  const max = Math.max(1, ...series.map((s) => s.value));
  const W = 400, H = 150;
  const step = series.length > 1 ? W / (series.length - 1) : W;
  const pts = series.map((s, i) => [i * step, H - (s.value / max) * (H - 12)]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[150px] border-b border-border">
        <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2563EB" stopOpacity="0.25" /><stop offset="1" stopColor="#2563EB" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#rev)" />
        <path d={line} fill="none" stroke="#2563EB" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
        {series.map((s) => <span key={s.label}>{s.label}</span>)}
      </div>
    </div>
  );
}

const BAND_COLOR: Record<string, string> = {
  excellent: "#059669", good: "#7DD3A0", fair: "#D97706", poor: "#DC2626",
};

// Donut for a 4-band distribution.
export function Donut({ dist, center }: { dist: Record<string, number>; center?: string }) {
  const { t } = useI18n();
  const bands = ["excellent", "good", "fair", "poor"];
  const total = bands.reduce((s, b) => s + (dist[b] || 0), 0) || 1;
  let acc = 0;
  const stops = bands.map((b) => {
    const from = (acc / total) * 100;
    acc += dist[b] || 0;
    const to = (acc / total) * 100;
    return `${BAND_COLOR[b]} ${from}% ${to}%`;
  }).join(",");
  return (
    <div className="flex flex-col items-center">
      <div className="relative size-[120px] rounded-full" style={{ background: `conic-gradient(${stops})` }}>
        <div className="absolute inset-[22px] bg-card rounded-full grid place-items-center text-center">
          {center && <div><div className="text-xl font-extrabold">{center}</div><div className="text-[10px] text-muted-foreground">{t("rep.avg")}</div></div>}
        </div>
      </div>
      <div className="mt-3 w-full space-y-1">
        {bands.map((b) => (
          <div key={b} className="flex items-center gap-2 text-[11.5px]">
            <span className="size-2.5 rounded" style={{ background: BAND_COLOR[b] }} />
            <span className="capitalize">{t("band." + b)}</span>
            <span className="ml-auto font-bold">{Math.round(((dist[b] || 0) / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Funnel of stages.
export function Funnel({ stages }: { stages: { stage: string; count: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  const colors = ["#2563EB", "#3B82F6", "#60A5FA", "#059669", "#4338CA"];
  return (
    <div className="space-y-2 mt-1">
      {stages.map((s, i) => (
        <div key={s.stage} className="flex items-center gap-2 text-xs">
          <span className="w-20 text-muted-foreground">{s.stage}</span>
          <span className="h-[22px] rounded-md flex items-center px-2 text-white text-[11px] font-bold"
            style={{ width: `${Math.max(8, (s.count / max) * 100)}%`, background: colors[i % colors.length] }}>{s.count}</span>
        </div>
      ))}
    </div>
  );
}

// Horizontal bars (aging / distribution / revenue-by-service).
export function BarRows({ rows, color = "#2563EB", fmt = (n: number) => String(n), bandColors = false }: {
  rows: { label: string; value: number }[];
  color?: string;
  fmt?: (n: number) => string;
  bandColors?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const bandKeys = ["excellent", "good", "fair", "poor"];
  const bandFill = ["#059669", "#84CC16", "#D97706", "#DC2626"];
  return (
    <div className="space-y-2.5 mt-1">
      {rows.map((r, i) => (
        <div key={r.label} className="flex items-center gap-2.5 text-xs">
          <span className="w-[84px] text-muted-foreground capitalize truncate">{r.label}</span>
          <span className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: bandColors ? bandFill[i % 4] : color }} />
          </span>
          <span className="w-16 text-right font-bold font-mono">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
