"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  Calendar,
  Users,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  LogOut,
  CalendarCheck,
  BadgeCheck,
  QrCode,
} from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@garageos/design-system/ui/card";
import { Badge, Avatar, Button, cn } from "@garageos/design-system";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

import Link from "next/link";

import type { Appointment, AppointmentStats, FleetHealth, HealthBand } from "@/lib/api/types";
import { HealthGauge } from "@/components/vehicles/health-gauge";
import { useI18n } from "@/lib/i18n/context";
import { logoutMessageSession } from "@/lib/message-intents";
import { authTransitionFailureKey, captureAuthOwnership } from '@/lib/auth-transition';

type Props = {
  userName: string;
  authFingerprint: string | null;
  stats: AppointmentStats;
  today: Appointment[];
  fleet: FleetHealth;
};

const FLEET_BAND_TEXT: Record<HealthBand, string> = {
  excellent: "text-emerald-600 dark:text-emerald-400",
  good: "text-green-600 dark:text-green-400",
  fair: "text-amber-600 dark:text-amber-400",
  poor: "text-red-600 dark:text-red-400",
};
function FleetBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-16">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-6 text-right tabular-nums">{count}</span>
    </div>
  );
}

// ─── Demo-only data (endpoints pending: revenue reporting, vehicle health,
//     audit log). Marked in the UI so it's never mistaken for live data. ─────
const weeklyRevenue = [
  { day: "Mon", revenue: 3200 },
  { day: "Tue", revenue: 4100 },
  { day: "Wed", revenue: 2800 },
  { day: "Thu", revenue: 5300 },
  { day: "Fri", revenue: 4600 },
  { day: "Sat", revenue: 2100 },
  { day: "Sun", revenue: 1800 },
];

const STATUS_VARIANT: Record<string, string> = {
  pending: "warning",
  confirmed: "info",
  in_progress: "primary",
  completed: "success",
  cancelled: "danger",
  rescheduled: "neutral",
};

function initials(name: string | null): string {
  if (!name) return "—";
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function DemoBadge() {
  const { t } = useI18n();
  return <Badge variant="neutral" size="sm">{t("common.demo")}</Badge>;
}

function AppointmentStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const variant = STATUS_VARIANT[status] ?? "neutral";
  return <Badge variant={variant as never} size="sm" dot>{t(`status.${status}`)}</Badge>;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card variant="default" className="relative overflow-hidden">
      <CardContent padding="md">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className={cn("p-3 rounded-xl", color)}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardClient({ userName, authFingerprint, stats, today, fleet }: Props) {
  const router = useRouter();
  const [logoutError, setLogoutError] = React.useState<string | null>(null);
  const [logoutOwner] = React.useState(captureAuthOwnership);
  const { t, fmt } = useI18n();
  const activeCount = stats.pending_count + stats.confirmed_count;
  const chartData = weeklyRevenue.map((d) => ({ ...d, label: t(`day.${d.day.toLowerCase()}`) }));

  async function handleLogout() {
    setLogoutError(null);
    try {
      await logoutMessageSession(destination => { router.replace(destination); router.refresh(); }, logoutOwner, authFingerprint);
    } catch (error) { setLogoutError(authTransitionFailureKey(error)); }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {logoutError && <p role="alert" className="text-sm">{t(logoutError)}</p>}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("nav.dashboard")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dash.welcome", { name: userName })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<FileText className="size-4" />}>{t("common.export")}</Button>
          <Button variant="ghost" size="sm" leftIcon={<LogOut className="size-4" />} onClick={handleLogout}>
            {t("common.signout")}
          </Button>
        </div>
      </div>

      {/* Stat Cards — live from /appointments/stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("dash.stat.active")} value={activeCount} subtitle={t("dash.stat.active_sub")} icon={Calendar} color="bg-primary/10 text-primary" />
        <StatCard title={t("dash.stat.today")} value={stats.today_count} subtitle={t("dash.stat.today_sub")} icon={Clock} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard title={t("dash.stat.completed")} value={stats.completed_count} subtitle={t("dash.stat.completed_sub")} icon={CheckCircle2} color="bg-success/10 text-success" />
        <StatCard title={t("dash.stat.cancelled")} value={stats.cancelled_count} subtitle={t("dash.stat.cancelled_sub")} icon={XCircle} color="bg-danger/10 text-danger" />
      </div>

      {/* Fleet Health (demo) + Weekly Revenue (demo) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card variant="elevated" className="lg:col-span-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-transparent" />
          <CardHeader>
            <CardTitle>{t("dash.fleet.title")}</CardTitle>
            <CardDescription>{t("dash.fleet.avg", { count: fleet.evaluated_count })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center py-2">
              <HealthGauge score={fleet.average_score} band={fleet.band} size={148} />
              <p className={cn("mt-2 text-sm font-semibold", FLEET_BAND_TEXT[fleet.band])}>
                {t(`band.${fleet.band}`)}
              </p>
              <div className="w-full mt-4 space-y-2">
                <FleetBar label={t("band.excellent")} count={fleet.distribution.excellent} total={fleet.evaluated_count} color="bg-emerald-500" />
                <FleetBar label={t("band.good")} count={fleet.distribution.good} total={fleet.evaluated_count} color="bg-green-500" />
                <FleetBar label={t("band.fair")} count={fleet.distribution.fair} total={fleet.evaluated_count} color="bg-amber-500" />
                <FleetBar label={t("band.poor")} count={fleet.distribution.poor} total={fleet.evaluated_count} color="bg-red-500" />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/vehicles" className="w-full">
              <Button variant="ghost" size="sm" fullWidth leftIcon={<TrendingUp className="size-4" />}>
                {t("dash.fleet.need_attention", { count: fleet.needs_attention.length })}
              </Button>
            </Link>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("dash.revenue.title")}</CardTitle>
                <CardDescription>{t("dash.revenue.sub")}</CardDescription>
              </div>
              <DemoBadge />
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [fmt.money(value), t("dash.revenue.label")]} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revenueGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Appointments (live) + Vehicles Due (demo) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("dash.today.title")}</CardTitle>
                <CardDescription>{t("dash.today.sub", { count: today.length })}</CardDescription>
              </div>
              <Button variant="outline" size="sm" leftIcon={<Calendar className="size-4" />}>{t("common.manage")}</Button>
            </div>
          </CardHeader>
          <CardContent padding="none">
            {today.length === 0 ? (
              <EmptyState
                compact
                icon={CalendarCheck}
                title={t("dash.today.empty_title")}
                description={t("dash.today.empty_desc")}
                action={{ label: t("action.new_appointment"), href: "/calendar" }}
                secondary={{ label: t("nav.calendar"), href: "/calendar" }}
              />
            ) : (
              <div className="divide-y divide-border">
                {today.map((apt) => (
                  <div key={apt.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="text-center min-w-[52px]">
                      <p className="text-xs font-medium text-foreground">{apt.appointment_time}</p>
                    </div>
                    <Avatar size="sm" fallback={initials(apt.mechanic_name)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{apt.customer_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{apt.vehicle_summary}</p>
                    </div>
                    <div className="hidden md:block text-right min-w-[140px]">
                      <p className="text-xs text-muted-foreground truncate">{apt.service_type ?? t("common.general_service")}</p>
                    </div>
                    <AppointmentStatusBadge status={apt.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" fullWidth leftIcon={<Calendar className="size-4" />}>{t("dash.today.view_schedule")}</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("dash.certified.title")}</CardTitle>
                <CardDescription>{t("dash.certified.sub")}</CardDescription>
              </div>
              <span className="grid size-8 place-items-center rounded-lg bg-success/10 text-success">
                <BadgeCheck className="size-4" />
              </span>
            </div>
          </CardHeader>
          <CardContent padding="none">
            {fleet.certified.length === 0 ? (
              <EmptyState compact icon={BadgeCheck} title={t("dash.certified.empty_title")}
                description={t("dash.certified.empty_desc")} />
            ) : (
              <div className="divide-y divide-border">
                {fleet.certified.map((v) => (
                  <Link key={v.vehicle_id} href={`/passport/${v.vehicle_id}`} target="_blank"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                    <span className="grid size-9 place-items-center rounded-full bg-success/10 text-success shrink-0 text-xs font-bold">
                      {Math.round(v.score)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{v.summary}</p>
                      <p className="text-xs text-muted-foreground truncate">{v.owner_name ?? "—"}</p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                      <QrCode className="size-3.5" /> {t("dash.passport")}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Link href="/vehicles" className="w-full">
              <Button variant="ghost" size="sm" fullWidth leftIcon={<Car className="size-4" />}>{t("dash.view_all_vehicles")}</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
