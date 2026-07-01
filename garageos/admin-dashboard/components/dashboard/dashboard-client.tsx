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
} from "lucide-react";
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

import type { Appointment, AppointmentStats } from "@/lib/api/types";

type Props = {
  userName: string;
  stats: AppointmentStats;
  today: Appointment[];
};

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

const vehiclesDue = [
  { id: 1, customer: "Robert Chen", vehicle: "Tesla Model 3", nextService: "Oil Change", dueDate: "Today", urgent: true },
  { id: 2, customer: "Sarah Williams", vehicle: "Ford F-150", nextService: "Brake Inspection", dueDate: "Tomorrow", urgent: false },
  { id: 3, customer: "John Smith", vehicle: "Chevrolet Silverado", nextService: "Transmission Fluid", dueDate: "In 3 days", urgent: false },
];

const STATUS_MAP: Record<string, { label: string; variant: string }> = {
  pending: { label: "Pending", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "info" },
  in_progress: { label: "In Progress", variant: "primary" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "danger" },
  rescheduled: { label: "Rescheduled", variant: "neutral" },
};

function initials(name: string | null): string {
  if (!name) return "—";
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function DemoBadge() {
  return <Badge variant="neutral" size="sm">Demo</Badge>;
}

function AppointmentStatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, variant: "neutral" };
  return <Badge variant={s.variant as never} size="sm" dot>{s.label}</Badge>;
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

export function DashboardClient({ userName, stats, today }: Props) {
  const router = useRouter();
  const activeCount = stats.pending_count + stats.confirmed_count;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, {userName}. Here&apos;s what&apos;s happening at your garage today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<FileText className="size-4" />}>Export</Button>
          <Button variant="ghost" size="sm" leftIcon={<LogOut className="size-4" />} onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </div>

      {/* Stat Cards — live from /appointments/stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Appointments" value={activeCount} subtitle="pending + confirmed" icon={Calendar} color="bg-primary/10 text-primary" />
        <StatCard title="Today" value={stats.today_count} subtitle="scheduled today" icon={Clock} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard title="Completed" value={stats.completed_count} subtitle="all time" icon={CheckCircle2} color="bg-success/10 text-success" />
        <StatCard title="Cancelled" value={stats.cancelled_count} subtitle="all time" icon={XCircle} color="bg-danger/10 text-danger" />
      </div>

      {/* Fleet Health (demo) + Weekly Revenue (demo) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card variant="elevated" className="lg:col-span-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Fleet Health</CardTitle>
                <CardDescription>Overall vehicle health score</CardDescription>
              </div>
              <DemoBadge />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center py-4">
              <div className="relative size-40 mb-4">
                <svg className="size-full" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                  <circle cx="60" cy="60" r="54" fill="none" stroke="#10b981" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${76 * 3.39} ${100 * 3.39}`} transform="rotate(-90 60 60)" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-foreground">76</span>
                  <span className="text-xs font-medium text-success">/100</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">Live fleet health lands with the Vehicle Health API.</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" fullWidth leftIcon={<TrendingUp className="size-4" />}>View Detailed Report</Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Weekly Revenue</CardTitle>
                <CardDescription>Appointment revenue over the last 7 days</CardDescription>
              </div>
              <DemoBadge />
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyRevenue} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]} />
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
                <CardTitle>Today&apos;s Appointments</CardTitle>
                <CardDescription>{today.length} scheduled for today</CardDescription>
              </div>
              <Button variant="outline" size="sm" leftIcon={<Calendar className="size-4" />}>Manage</Button>
            </div>
          </CardHeader>
          <CardContent padding="none">
            {today.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No appointments scheduled for today.
              </div>
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
                      <p className="text-xs text-muted-foreground truncate">{apt.service_type ?? "General Service"}</p>
                    </div>
                    <AppointmentStatusBadge status={apt.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" fullWidth leftIcon={<Calendar className="size-4" />}>View Full Schedule</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Due for Service</CardTitle>
                <CardDescription>Vehicles needing attention</CardDescription>
              </div>
              <DemoBadge />
            </div>
          </CardHeader>
          <CardContent padding="none">
            <div className="divide-y divide-border">
              {vehiclesDue.map((v) => (
                <div key={v.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{v.vehicle}</p>
                        {v.urgent && <AlertTriangle className="size-3.5 text-danger shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{v.customer}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-foreground">{v.nextService}</p>
                      <Badge variant={v.urgent ? "danger" : "warning"} size="sm">{v.dueDate}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" fullWidth leftIcon={<Car className="size-4" />}>View All Vehicles</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
