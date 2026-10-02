"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  FileText,
  Gauge,
  History,
  Printer,
  QrCode,
  Share2,
  Sparkles,
  Wrench,
} from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { useI18n } from "@/lib/i18n/context";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Button, cn } from "@garageos/design-system";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@garageos/design-system/ui/card";

import type {
  HealthBand,
  HealthService,
  VehicleHealth,
  VehicleTimeline,
} from "@/lib/api/types";
import { HealthGauge } from "./health-gauge";

type Props = { health: VehicleHealth; timeline: VehicleTimeline };
type Translate = (key: string, params?: Record<string, string | number>) => string;

const TABS = ["Overview", "Timeline", "Services & History", "Documents", "Insights"] as const;

const TAB_KEY: Record<(typeof TABS)[number], string> = {
  "Overview": "veh.tab.overview",
  "Timeline": "veh.tab.timeline",
  "Services & History": "veh.tab.services",
  "Documents": "veh.tab.documents",
  "Insights": "veh.tab.insights",
};

// Event-stream items (from the notification engine) tinted by severity.
const EVENT_TINT: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600", high: "bg-red-500/10 text-red-600",
  medium: "bg-amber-500/10 text-amber-600", low: "bg-blue-500/10 text-blue-600",
  info: "bg-muted text-muted-foreground",
};
type Tab = (typeof TABS)[number];

function scoreBand(score: number): HealthBand {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

const BAND_TEXT: Record<HealthBand, string> = {
  excellent: "text-emerald-600 dark:text-emerald-400",
  good: "text-green-600 dark:text-green-400",
  fair: "text-amber-600 dark:text-amber-400",
  poor: "text-red-600 dark:text-red-400",
};
const BAND_BADGE: Record<HealthBand, string> = {
  excellent: "success",
  good: "success",
  fair: "warning",
  poor: "danger",
};

// Number/date formatters bound to the active UI language.
function useFmt() {
  const { locale } = useI18n();
  const nf = (n: number, opts?: Intl.NumberFormatOptions) => formatNumber(locale, n, opts);
  return {
    nf,
    km: (n: number | null | undefined) => (n == null ? "—" : `${nf(n)} km`),
    fmtDate: (iso: string) => formatDate(locale, iso, { day: "numeric", month: "short", year: "numeric" }),
    remainingText: (s: HealthService, t: Translate) => {
      if (s.remaining_km == null) return "";
      if (s.remaining_km < 0) return t("veh.km_overdue", { km: nf(Math.abs(s.remaining_km)) });
      return t("veh.km_in", { km: nf(s.remaining_km) });
    },
  };
}

function dueLabel(s: HealthService): { key: string; variant: string } {
  if (s.status === "overdue" || (s.remaining_km != null && s.remaining_km < 0)) {
    return { key: "veh.due.overdue", variant: "danger" };
  }
  if (s.status === "due") return { key: "veh.due.due", variant: "danger" };
  return { key: "veh.due.due_soon", variant: "warning" };
}

// ── Small deterministic QR-style placeholder (real QR generation is a follow-up)
function PassportQR({ seed, size = 100 }: { seed: string; size?: number }) {
  const N = 21;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h ^ seed.charCodeAt(i), 16777619)) >>> 0;
  const rand = (i: number) => {
    let x = (h ^ Math.imul(i, 2654435761)) >>> 0;
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    return (x % 1000) / 1000;
  };
  const finder = (r: number, c: number): boolean | null => {
    const box = (br: number, bc: number) => {
      const rr = r - br, cc = c - bc;
      if (rr < 0 || rr > 6 || cc < 0 || cc > 6) return null;
      if (rr === 0 || rr === 6 || cc === 0 || cc === 6) return true;
      return rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
    };
    return box(0, 0) ?? box(0, N - 7) ?? box(N - 7, 0);
  };
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const f = finder(r, c);
      const on = f == null ? rand(r * N + c) > 0.52 : f;
      if (on) rects.push(<rect key={`${r}-${c}`} x={c} y={r} width={1.02} height={1.02} />);
    }
  }
  return (
    <svg viewBox={`0 0 ${N} ${N}`} width={size} height={size} className="text-foreground" fill="currentColor" aria-hidden>
      {rects}
    </svg>
  );
}

function MiniRadial({ score, size = 68 }: { score: number; size?: number }) {
  const band = scoreBand(score);
  const color = band === "excellent" ? "#10b981" : band === "good" ? "#22c55e" : band === "fair" ? "#f59e0b" : "#ef4444";
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="size-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.max(0, Math.min(100, score)) / 100)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-sm font-bold text-foreground tabular-nums">{Math.round(score)}</span>
      </div>
    </div>
  );
}

function StatItem({ icon: Icon, value, label, tone }: { icon: React.ElementType; value: string; label: string; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("size-9 rounded-lg grid place-items-center shrink-0", tone)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}

export function VehicleHealthScreen({ health, timeline }: Props) {
  const { t } = useI18n();
  const { nf, fmtDate } = useFmt();
  const [tab, setTab] = useState<Tab>("Overview");
  const v = health.vehicle;
  const band = health.band;
  const title = `${v.brand} ${v.model}`.trim() || t("veh.vehicle");

  const serviceEvents = timeline.events.filter((e) => e.type === "service");
  const servicesCompleted = serviceEvents.length;
  const totalSpent = serviceEvents.reduce((sum, e) => sum + (e.cost ?? 0), 0);
  const lastServiceKm = serviceEvents[0]?.km ?? null;
  const kmSinceService = lastServiceKm != null ? v.current_km - lastServiceKm : null;
  const lastServiceDate = serviceEvents[0]?.date ?? null;

  const dueServices = health.services.filter((s) => s.is_due);
  dueServices.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
  });

  // No health snapshots are stored yet, so there is no real trend to plot —
  // render the series flat at zero rather than fabricating an illustrative curve.
  const trend = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((month) => ({
    month,
    score: 0,
  }));

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Breadcrumb + header */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/vehicles" className="hover:text-foreground transition-colors">{t("nav.vehicles")}</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">{title}{v.license_plate ? ` (${v.license_plate})` : ""}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card variant="elevated" className="xl:col-span-2">
          <CardContent padding="lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 grid place-items-center shrink-0">
                  <Gauge className="size-7 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
                    <Badge variant={BAND_BADGE[band] as never} size="sm" dot>{t(`band.${band}`)}</Badge>
                  </div>
                  {v.license_plate && (
                    <span className="inline-block mt-1 text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">{v.license_plate}</span>
                  )}
                  <p className="text-sm text-muted-foreground mt-1.5">
                    {v.year} · {nf(v.current_km)} km
                    {v.customer_name ? ` · ${v.customer_name}` : ""}
                    {lastServiceDate ? ` · ${t("veh.last_service")} ${fmtDate(lastServiceDate)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" leftIcon={<Share2 className="size-4" />}>{t("veh.share_report")}</Button>
                <Button size="sm" leftIcon={<Calendar className="size-4" />}>{t("veh.book_service")}</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Digital Vehicle Passport */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
          <CardContent padding="md">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{t("veh.digital_passport")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("veh.digital_passport_desc")}</p>
                <Link href={`/passport/${v.id}`} target="_blank" className="inline-block mt-3">
                  <Button variant="outline" size="sm" leftIcon={<QrCode className="size-4" />}>{t("veh.open_passport")}</Button>
                </Link>
              </div>
              <div className="rounded-lg bg-background border border-border p-1.5 shrink-0">
                <PassportQR seed={v.id} size={92} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-1 overflow-x-auto">
        {TABS.map((tabId) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={cn(
              "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              tab === tabId
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t(TAB_KEY[tabId])}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <OverviewTab
          health={health}
          trend={trend}
          dueServices={dueServices}
          timeline={timeline}
          stats={{ servicesCompleted, totalSpent, kmSinceService }}
        />
      )}
      {tab === "Timeline" && <TimelineTab timeline={timeline} />}
      {tab === "Services & History" && <ServicesTab health={health} />}
      {tab === "Documents" && <EmptyTab icon={FileText} title={t("veh.no_documents")} body={t("veh.documents_upload_hint")} />}
      {tab === "Insights" && <InsightsCard band={band} full />}
    </div>
  );
}

function OverviewTab({
  health, trend, dueServices, timeline, stats,
}: {
  health: VehicleHealth;
  trend: { month: string; score: number }[];
  dueServices: HealthService[];
  timeline: VehicleTimeline;
  stats: { servicesCompleted: number; totalSpent: number; kmSinceService: number | null };
}) {
  const { t } = useI18n();
  const { nf, km, fmtDate, remainingText } = useFmt();
  const band = health.band;
  return (
    <div className="space-y-4">
      {/* Score + trend + at a glance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>{t("veh.overall_health")}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col items-center text-center">
              <HealthGauge score={health.overall_score} band={band} />
              <p className={cn("mt-3 text-sm font-semibold", BAND_TEXT[band])}>{t(`band.${band}`)}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">{t(`veh.band_desc.${band}`)}</p>
              <p className="text-[11px] text-muted-foreground/60 mt-3">{t("veh.calculated", { date: fmtDate(health.generated_at) })}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("veh.health_trend")}</CardTitle>
              <Badge variant="neutral" size="sm">{t("veh.illustrative")}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(val: number) => [`${val}/100`, t("veh.score")]} />
                  <Area type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2} fill="url(#trendGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("veh.at_a_glance")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <StatItem icon={Wrench} value={String(stats.servicesCompleted)} label={t("veh.stat.services_completed")} tone="bg-primary/10 text-primary" />
            <StatItem icon={AlertTriangle} value={String(health.urgent_count)} label={t("veh.stat.services_overdue")} tone="bg-danger/10 text-danger" />
            <StatItem icon={Clock} value={String(health.due_soon_count)} label={t("veh.stat.due_soon")} tone="bg-warning/10 text-warning" />
            <StatItem icon={DollarSign} value={`$${nf(stats.totalSpent, { maximumFractionDigits: 0 })}`} label={t("veh.stat.total_spent")} tone="bg-success/10 text-success" />
            <StatItem icon={Activity} value={km(stats.kmSinceService)} label={t("veh.stat.since_service")} tone="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
          </CardContent>
        </Card>
      </div>

      {/* Category health */}
      <Card>
        <CardHeader><CardTitle>{t("veh.category_health")}</CardTitle></CardHeader>
        <CardContent>
          {health.categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("veh.no_categories")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {health.categories.map((c) => {
                const b = scoreBand(c.score);
                return (
                  <div key={c.name} className="flex flex-col items-center text-center gap-2 rounded-xl border border-border p-3">
                    <MiniRadial score={c.score} />
                    <div>
                      <p className="text-xs font-medium text-foreground leading-tight">{c.name}</p>
                      <p className={cn("text-[11px] font-medium", BAND_TEXT[b])}>{t(`band.${b}`)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Due services + timeline + insights + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("veh.due_services")}</CardTitle>
              <Badge variant="warning" size="sm">{t("veh.count_due", { n: dueServices.length })}</Badge>
            </div>
          </CardHeader>
          <CardContent padding="none">
            {dueServices.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("veh.everything_up_to_date")}</div>
            ) : (
              <div className="divide-y divide-border">
                {dueServices.slice(0, 8).map((s) => {
                  const d = dueLabel(s);
                  return (
                    <div key={s.service_type} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{s.service_type}</p>
                        <p className="text-xs text-muted-foreground">{remainingText(s, t)}</p>
                      </div>
                      <Badge variant={d.variant as never} size="sm">{t(d.key)}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>{t("veh.recent_timeline")}</CardTitle></CardHeader>
          <CardContent padding="none">
            <TimelineList events={timeline.events.slice(0, 6)} />
          </CardContent>
        </Card>

        <div className="lg:col-span-1 space-y-4">
          <InsightsCard band={band} />
          <Card>
            <CardHeader><CardTitle>{t("veh.quick_actions")}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <QuickAction icon={Calendar} label={t("veh.action.book_appointment")} />
              <QuickAction icon={FileText} label={t("veh.action.history_report")} />
              <QuickAction icon={Printer} label={t("veh.action.print_report")} onClick={() => window.print()} />
              <QuickAction icon={Download} label={t("veh.action.export_data")} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TimelineList({ events }: { events: VehicleTimeline["events"] }) {
  const { t } = useI18n();
  const { nf, fmtDate } = useFmt();
  if (events.length === 0) {
    return (
      <EmptyState
        compact
        icon={History}
        title={t("veh.no_history")}
        description={t("veh.no_history_desc")}
        action={{ label: t("veh.book_first"), href: "/calendar" }}
      />
    );
  }
  return (
    <div className="divide-y divide-border">
      {events.map((e, i) => {
        const isService = e.type === "service";
        const isEvent = e.type.startsWith("event_");
        const chip = isEvent ? EVENT_TINT[e.severity ?? "info"]
          : isService ? "bg-success/10 text-success" : "bg-primary/10 text-primary";
        return (
          <div key={e.id ?? i} className="flex items-start gap-3 px-4 py-3">
            <div className={cn("size-8 rounded-full grid place-items-center shrink-0 mt-0.5", chip)}>
              {isEvent ? <Activity className="size-4" /> : isService ? <Wrench className="size-4" /> : <Calendar className="size-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(e.date)}{e.km != null ? ` · ${nf(e.km)} km` : ""}{e.cost != null ? ` · $${nf(e.cost)}` : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineTab({ timeline }: { timeline: VehicleTimeline }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader><CardTitle>{t("veh.full_timeline")}</CardTitle><CardDescription>{t("veh.count_events", { n: timeline.events.length })}</CardDescription></CardHeader>
      <CardContent padding="none"><TimelineList events={timeline.events} /></CardContent>
    </Card>
  );
}

function ServicesTab({ health }: { health: VehicleHealth }) {
  const { t } = useI18n();
  const { nf, remainingText } = useFmt();
  return (
    <Card>
      <CardHeader><CardTitle>{t("veh.tab.services")}</CardTitle><CardDescription>{t("veh.services_history_desc")}</CardDescription></CardHeader>
      <CardContent padding="none">
        <div className="divide-y divide-border">
          {health.services.map((s) => {
            const b = scoreBand(s.health_score);
            return (
              <div key={s.service_type} className="flex items-center gap-3 px-4 py-3">
                <MiniRadial score={s.health_score} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{s.service_type}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.interval_km ? t("veh.every_km", { km: nf(s.interval_km) }) : ""}
                    {s.last_performed_km != null ? ` · ${t("veh.last_at_km", { km: nf(s.last_performed_km) })}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-semibold", BAND_TEXT[b])}>{Math.round(s.health_score)}</p>
                  <p className="text-xs text-muted-foreground">{remainingText(s, t) || t("veh.on_track")}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function InsightsCard({ band, full = false }: { band: HealthBand; full?: boolean }) {
  const { t } = useI18n();
  const positive = band === "excellent" || band === "good";
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent" />
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 grid place-items-center">
            <Sparkles className="size-4" />
          </div>
          <CardTitle>{t("veh.ai_insights")}</CardTitle>
          <Badge variant="neutral" size="sm">{t("veh.beta")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <p className="text-sm text-foreground">
          {positive ? t("veh.insight_positive") : t("veh.insight_negative")}
        </p>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-success shrink-0" /> {t("veh.insight_oil")}</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-success shrink-0" /> {t("veh.insight_brake")}</li>
          <li className="flex items-center gap-2"><AlertTriangle className="size-3.5 text-warning shrink-0" /> {t("veh.insight_transmission")}</li>
        </ul>
        {full && (
          <Button variant="outline" size="sm" className="mt-1" leftIcon={<Sparkles className="size-4" />}>{t("veh.ask_ai")}</Button>
        )}
      </CardContent>
    </Card>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/50 transition-all text-left group"
    >
      <Icon className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
      <span className="text-sm font-medium text-foreground flex-1">{label}</span>
      <ArrowUpRight className="size-4 text-muted-foreground/50" />
    </button>
  );
}

function EmptyTab({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <Card>
      <CardContent padding="lg">
        <div className="py-10 text-center max-w-sm mx-auto">
          <div className="mx-auto size-12 rounded-full bg-muted grid place-items-center text-muted-foreground mb-3">
            <Icon className="size-6" />
          </div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground mt-1">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}
