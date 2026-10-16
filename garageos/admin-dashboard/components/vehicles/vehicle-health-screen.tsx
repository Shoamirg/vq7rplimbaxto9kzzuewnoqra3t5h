"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  FileText,
  Gauge,
  History,
  Printer,
  Share2,
  Wrench,
} from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
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
import { useI18n } from "@/lib/i18n/context";

type Props = { health: VehicleHealth; timeline: VehicleTimeline };

const TABS = ["Overview", "Timeline", "Services & History", "Documents", "Insights"] as const;

// Event-stream items (from the notification engine) tinted by severity.
const EVENT_TINT: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600", high: "bg-red-500/10 text-red-600",
  medium: "bg-amber-500/10 text-amber-600", low: "bg-blue-500/10 text-blue-600",
  info: "bg-muted text-muted-foreground",
};
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  Overview: "vehicleHealth.tab.overview",
  Timeline: "vehicleHealth.tab.timeline",
  "Services & History": "vehicleHealth.tab.services",
  Documents: "vehicleHealth.tab.documents",
  Insights: "vehicleHealth.tab.insights",
};

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
const BAND_LABEL: Record<HealthBand, string> = {
  excellent: "vehicleHealth.band.excellent",
  good: "vehicleHealth.band.good",
  fair: "vehicleHealth.band.fair",
  poor: "vehicleHealth.band.poor",
};
const BAND_BADGE: Record<HealthBand, string> = {
  excellent: "success",
  good: "success",
  fair: "warning",
  poor: "danger",
};
const BAND_DESC: Record<HealthBand, string> = {
  excellent: "vehicleHealth.desc.excellent",
  good: "vehicleHealth.desc.good",
  fair: "vehicleHealth.desc.fair",
  poor: "vehicleHealth.desc.poor",
};

function km(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toLocaleString("en-US")} km`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function dueLabel(s: HealthService): { text: string; variant: string } {
  if (s.status === "overdue" || (s.remaining_km != null && s.remaining_km < 0)) {
    return { text: "Overdue", variant: "danger" };
  }
  if (s.status === "due") return { text: "Due", variant: "danger" };
  return { text: "Due Soon", variant: "warning" };
}

function remainingText(s: HealthService): string {
  if (s.remaining_km == null) return "";
  if (s.remaining_km < 0) return `${Math.abs(s.remaining_km).toLocaleString("en-US")} km overdue`;
  return `in ${s.remaining_km.toLocaleString("en-US")} km`;
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
  const [tab, setTab] = useState<Tab>("Overview");
  const v = health.vehicle;
  const band = health.band;
  const title = `${v.brand} ${v.model}`.trim() || "Vehicle";

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

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Breadcrumb + header */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/vehicles" className="hover:text-foreground transition-colors">{t("vehicleHealth.vehicles")}</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">{title}{v.license_plate ? ` (${v.license_plate})` : ""}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card variant="elevated" className="xl:col-span-2">
          <CardContent padding="lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="size-16 rounded-2xl bg-linear-to-br from-primary/15 to-primary/5 grid place-items-center shrink-0">
                  <Gauge className="size-7 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
                    <Badge variant={BAND_BADGE[band] as never} size="sm" dot>{t(BAND_LABEL[band])}</Badge>
                  </div>
                  {v.license_plate && (
                    <span className="inline-block mt-1 text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">{v.license_plate}</span>
                  )}
                  <p className="text-sm text-muted-foreground mt-1.5">
                    {v.year} · {v.current_km.toLocaleString("en-US")} km
                    {v.customer_name ? ` · ${v.customer_name}` : ""}
                    {lastServiceDate ? ` · Last service ${fmtDate(lastServiceDate)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" leftIcon={<Share2 className="size-4" />}>{t("vehicleHealth.share")}</Button>
                <Button size="sm" leftIcon={<Calendar className="size-4" />}>{t("vehicleHealth.book")}</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Digital Vehicle Passport */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent" />
          <CardContent padding="md">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{t("vehicleHealth.passport")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("vehicleHealth.recordCaption")}</p>
                <Link href={`/passport/${v.id}`} target="_blank" className="inline-block mt-3">
                  <Button variant="outline" size="sm" leftIcon={<FileText className="size-4" />}>{t("vehicleHealth.openRecord")}</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-1 overflow-x-auto">
        {TABS.map((tabName) => (
          <button
            key={tabName}
            onClick={() => setTab(tabName)}
            className={cn(
              "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              tab === tabName
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t(TAB_LABEL[tabName])}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <OverviewTab
          health={health}
          dueServices={dueServices}
          timeline={timeline}
          stats={{ servicesCompleted, totalSpent, kmSinceService }}
        />
      )}
      {tab === "Timeline" && <TimelineTab timeline={timeline} />}
      {tab === "Services & History" && <ServicesTab health={health} />}
      {tab === "Documents" && <EmptyTab icon={FileText} title={t("vehicleHealth.noDocuments")} body={t("vehicleHealth.noDocumentsHint")} />}
      {tab === "Insights" && <InsightsCard health={health} />}
    </div>
  );
}

function OverviewTab({
  health, dueServices, timeline, stats,
}: {
  health: VehicleHealth;
  dueServices: HealthService[];
  timeline: VehicleTimeline;
  stats: { servicesCompleted: number; totalSpent: number; kmSinceService: number | null };
}) {
  const { t } = useI18n();
  const band = health.band;
  return (
    <div className="space-y-4">
      {/* Current status + at a glance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>{t("vehicleHealth.score")}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col items-center text-center">
              <HealthGauge score={health.overall_score} band={band} />
              <p className={cn("mt-3 text-sm font-semibold", BAND_TEXT[band])}>{t(BAND_LABEL[band])}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">{t(BAND_DESC[band])}</p>
              <p className="text-[11px] text-muted-foreground/60 mt-3">{t("vehicleHealth.calculated", { date: fmtDate(health.generated_at) })}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("vehicleHealth.glance")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <StatItem icon={Wrench} value={String(stats.servicesCompleted)} label={t("vehicleHealth.completed")} tone="bg-primary/10 text-primary" />
            <StatItem icon={AlertTriangle} value={String(health.urgent_count)} label={t("vehicleHealth.overdue")} tone="bg-danger/10 text-danger" />
            <StatItem icon={Clock} value={String(health.due_soon_count)} label={t("vehicleHealth.soon")} tone="bg-warning/10 text-warning" />
            <StatItem icon={DollarSign} value={`$${stats.totalSpent.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} label={t("vehicleHealth.spent")} tone="bg-success/10 text-success" />
            <StatItem icon={Activity} value={km(stats.kmSinceService)} label={t("vehicleHealth.sinceService")} tone="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
          </CardContent>
        </Card>
      </div>

      {/* Category health */}
      <Card>
        <CardHeader><CardTitle>{t("vehicleHealth.categories")}</CardTitle></CardHeader>
        <CardContent>
          {health.categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("vehicleHealth.noCategories")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {health.categories.map((c) => {
                const b = scoreBand(c.score);
                return (
                  <div key={c.name} className="flex flex-col items-center text-center gap-2 rounded-xl border border-border p-3">
                    <MiniRadial score={c.score} />
                    <div>
                      <p className="text-xs font-medium text-foreground leading-tight">{c.name}</p>
                      <p className={cn("text-[11px] font-medium", BAND_TEXT[b])}>{t(BAND_LABEL[b])}</p>
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
              <CardTitle>{t("vehicleHealth.dueServices")}</CardTitle>
              <Badge variant="warning" size="sm">{dueServices.length} due</Badge>
            </div>
          </CardHeader>
          <CardContent padding="none">
            {dueServices.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("vehicleHealth.allCurrent")}</div>
            ) : (
              <div className="divide-y divide-border">
                {dueServices.slice(0, 8).map((s) => {
                  const d = dueLabel(s);
                  return (
                    <div key={s.service_type} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{s.service_type}</p>
                        <p className="text-xs text-muted-foreground">{remainingText(s)}</p>
                      </div>
                      <Badge variant={d.variant as never} size="sm">{d.text}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>{t("vehicleHealth.recentTimeline")}</CardTitle></CardHeader>
          <CardContent padding="none">
            <TimelineList events={timeline.events.slice(0, 6)} />
          </CardContent>
        </Card>

        <div className="lg:col-span-1 space-y-4">
          <InsightsCard health={health} />
          <Card>
            <CardHeader><CardTitle>{t("vehicleHealth.quickActions")}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <QuickAction icon={Calendar} label="Book Appointment" />
              <QuickAction icon={FileText} label="Service History Report" />
              <QuickAction icon={Printer} label="Print Health Report" onClick={() => window.print()} />
              <QuickAction icon={Download} label="Export Data" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TimelineList({ events }: { events: VehicleTimeline["events"] }) {
  const { t } = useI18n();
  if (events.length === 0) {
    return (
      <EmptyState
        compact
        icon={History}
        title={t("vehicleHealth.noHistory")}
        description="This vehicle hasn't been serviced here. Once you complete an appointment, every service and inspection appears here automatically — building the digital passport."
        action={{ label: "Book first service", href: "/calendar" }}
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
                {fmtDate(e.local_date || e.date)}{e.km != null ? ` · ${e.km.toLocaleString("en-US")} km` : ""}{e.cost != null ? ` · $${e.cost.toLocaleString("en-US")}` : ""}
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
      <CardHeader><CardTitle>{t("vehicleHealth.fullTimeline")}</CardTitle><CardDescription>{timeline.events.length} events</CardDescription></CardHeader>
      <CardContent padding="none"><TimelineList events={timeline.events} /></CardContent>
    </Card>
  );
}

function ServicesTab({ health }: { health: VehicleHealth }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader><CardTitle>{t("vehicleHealth.servicesHistory")}</CardTitle><CardDescription>{t("vehicleHealth.trackedItems")}</CardDescription></CardHeader>
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
                    {s.interval_km ? `Every ${s.interval_km.toLocaleString("en-US")} km` : ""}
                    {s.last_performed_km != null ? ` · last at ${s.last_performed_km.toLocaleString("en-US")} km` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-semibold", BAND_TEXT[b])}>{Math.round(s.health_score)}</p>
                  <p className="text-xs text-muted-foreground">{remainingText(s) || "on track"}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function InsightsCard({ health }: { health: VehicleHealth }) {
  const { t } = useI18n();
  const currentCount = health.services.filter((service) => !service.is_due).length;
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-violet-500/5 to-transparent" />
      <CardHeader>
        <CardTitle>{t("vehicleHealth.summary")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <p className="text-sm text-foreground">{currentCount} {t("vehicleHealth.currentItems")}</p>
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
