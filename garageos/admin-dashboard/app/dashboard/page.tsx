"use client";

import React from "react";
import {
  Car,
  Calendar,
  DollarSign,
  Users,
  Wrench,
  AlertTriangle,
  Clock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Search,
  FileText,
  Bell,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@garageos/design-system/ui/card";
import { Badge, Avatar, Button, cn } from "@garageos/design-system";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";

// ─── Mock Data ───────────────────────────────────────────────
const weeklyRevenue = [
  { day: "Mon", revenue: 3200, appointments: 8 },
  { day: "Tue", revenue: 4100, appointments: 11 },
  { day: "Wed", revenue: 2800, appointments: 7 },
  { day: "Thu", revenue: 5300, appointments: 14 },
  { day: "Fri", revenue: 4600, appointments: 12 },
  { day: "Sat", revenue: 2100, appointments: 5 },
  { day: "Sun", revenue: 1800, appointments: 3 },
];

const todayAppointments = [
  {
    id: 1,
    time: "09:00 AM",
    customer: "Robert Chen",
    vehicle: "2021 Tesla Model 3",
    service: "Annual Maintenance",
    status: "in-progress",
    mechanic: { initials: "JM", name: "Juan Martinez" },
  },
  {
    id: 2,
    time: "10:30 AM",
    customer: "Sarah Williams",
    vehicle: "2019 Ford F-150",
    service: "Oil Change & Filter",
    status: "confirmed",
    mechanic: { initials: "AK", name: "Alex Kim" },
  },
  {
    id: 3,
    time: "11:00 AM",
    customer: "Mike Johnson",
    vehicle: "2022 Honda Civic",
    service: "Brake Pad Replacement",
    status: "confirmed",
    mechanic: { initials: "SL", name: "Sarah Lee" },
  },
  {
    id: 4,
    time: "01:30 PM",
    customer: "Emily Davis",
    vehicle: "2020 BMW X5",
    service: "Tire Rotation & Balance",
    status: "pending",
    mechanic: { initials: "JM", name: "Juan Martinez" },
  },
  {
    id: 5,
    time: "03:00 PM",
    customer: "David Thompson",
    vehicle: "2018 Toyota RAV4",
    service: "AC System Diagnosis",
    status: "pending",
    mechanic: { initials: "AK", name: "Alex Kim" },
  },
];

const vehiclesDue = [
  {
    id: 1,
    customer: "Robert Chen",
    vehicle: "Tesla Model 3",
    vin: "5YJ3E1EA7MF123456",
    nextService: "Oil Change",
    dueDate: "Today",
    urgent: true,
  },
  {
    id: 2,
    customer: "Sarah Williams",
    vehicle: "Ford F-150",
    vin: "1FTFW1E53MFA12345",
    nextService: "Brake Inspection",
    dueDate: "Tomorrow",
    urgent: false,
  },
  {
    id: 3,
    customer: "John Smith",
    vehicle: "Chevrolet Silverado",
    vin: "2GCEC19V241123456",
    nextService: "Transmission Fluid",
    dueDate: "In 3 days",
    urgent: false,
  },
];

const recentActivity = [
  {
    id: 1,
    action: "Appointment completed",
    detail: "Oil Change — 2019 Ford F-150",
    time: "12 min ago",
    type: "completed",
  },
  {
    id: 2,
    action: "New customer registered",
    detail: "Emily Davis — 2020 BMW X5",
    time: "45 min ago",
    type: "customer",
  },
  {
    id: 3,
    action: "Vehicle health report generated",
    detail: "2021 Tesla Model 3 — Score: 87%",
    time: "1 hour ago",
    type: "report",
  },
  {
    id: 4,
    action: "Invoice paid",
    detail: "Robert Chen — $1,247.00",
    time: "2 hours ago",
    type: "payment",
  },
  {
    id: 5,
    action: "Part order placed",
    detail: "Brake pads (x4) — NAPA Auto Parts",
    time: "3 hours ago",
    type: "order",
  },
];

const upcomingBookings = [
  { day: "Today", count: 8, trend: "up" },
  { day: "Tomorrow", count: 11, trend: "up" },
  { day: "Wed", count: 6, trend: "down" },
  { day: "Thu", count: 14, trend: "up" },
  { day: "Fri", count: 9, trend: "up" },
  { day: "Sat", count: 4, trend: "down" },
  { day: "Sun", count: 2, trend: "down" },
];

const quickActions = [
  { label: "New Appointment", icon: Calendar, color: "bg-primary/10 text-primary", onClick: () => {} },
  { label: "Add Vehicle", icon: Car, color: "bg-success/10 text-success", onClick: () => {} },
  { label: "New Customer", icon: Users, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400", onClick: () => {} },
  { label: "Place Order", icon: Wrench, color: "bg-warning/10 text-warning", onClick: () => {} },
];

// ─── Status Badge Helper ──────────────────────────────────────
function AppointmentStatus({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; variant: string }> = {
    pending: { label: "Pending", variant: "warning" },
    confirmed: { label: "Confirmed", variant: "info" },
    "in-progress": { label: "In Progress", variant: "primary" },
    completed: { label: "Completed", variant: "success" },
    cancelled: { label: "Cancelled", variant: "danger" },
  };
  const s = statusMap[status] || { label: status, variant: "neutral" };
  return <Badge variant={s.variant as any} size="sm" dot>{s.label}</Badge>;
}

// ─── Stat Card ────────────────────────────────────────────────
function StatCard({
  title,
  value,
  change,
  trend,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
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
            <div className="flex items-center gap-1">
              {trend === "up" ? (
                <ArrowUpRight className="size-3.5 text-success" />
              ) : (
                <ArrowDownRight className="size-3.5 text-danger" />
              )}
              <span className={cn(
                "text-xs font-medium",
                trend === "up" ? "text-success" : "text-danger"
              )}>
                {change}
              </span>
              <span className="text-xs text-muted-foreground">vs last week</span>
            </div>
          </div>
          <div className={cn("p-3 rounded-xl", color)}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────
export default function DashboardPage() {
  const [isLoading] = React.useState(false);

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, John. Here&apos;s what&apos;s happening at your garage today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<FileText className="size-4" />}>
            Export
          </Button>
          <Button size="sm" leftIcon={<Plus className="size-4" />}>
            New Appointment
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value="$9,670"
          change="+12.5%"
          trend="up"
          icon={DollarSign}
          color="bg-success/10 text-success"
        />
        <StatCard
          title="Active Appointments"
          value="12"
          change="+8.3%"
          trend="up"
          icon={Calendar}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          title="Vehicles in Shop"
          value="8"
          change="-3.2%"
          trend="down"
          icon={Car}
          color="bg-warning/10 text-warning"
        />
        <StatCard
          title="Customers Today"
          value="24"
          change="+18.7%"
          trend="up"
          icon={Users}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
      </div>

      {/* Fleet Health + Weekly Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Fleet Health Hero Widget */}
        <Card variant="elevated" className="lg:col-span-1 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
          <CardHeader>
            <CardTitle>Fleet Health</CardTitle>
            <CardDescription>Overall vehicle health score</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center py-4">
              {/* Health Gauge */}
              <div className="relative size-40 mb-4">
                <svg className="size-full" viewBox="0 0 120 120">
                  {/* Background circle */}
                  <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                  {/* Score arc — 76% */}
                  <circle
                    cx="60" cy="60" r="54" fill="none"
                    stroke="#10b981" strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${76 * 3.39} ${100 * 3.39}`}
                    transform="rotate(-90 60 60)"
                    className="drop-shadow-sm"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-foreground">76</span>
                  <span className="text-xs font-medium text-success">/100</span>
                  <Badge variant="success" size="sm" dot className="mt-1">Good</Badge>
                </div>
              </div>

              {/* Health Breakdown */}
              <div className="w-full space-y-2 mt-2">
                <HealthBar label="Engine & Drivetrain" score={82} color="bg-success" />
                <HealthBar label="Brakes & Suspension" score={71} color="bg-warning" />
                <HealthBar label="Electrical Systems" score={88} color="bg-success" />
                <HealthBar label="Tires & Wheels" score={65} color="bg-danger" />
                <HealthBar label="Fluids & Filters" score={73} color="bg-warning" />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" fullWidth leftIcon={<TrendingUp className="size-4" />}>
              View Detailed Report
            </Button>
          </CardFooter>
        </Card>

        {/* Weekly Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Weekly Revenue</CardTitle>
                <CardDescription>Appointment revenue over the last 7 days</CardDescription>
              </div>
              <Badge variant="success" size="sm" dot>+12.5%</Badge>
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
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#revenueGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <span className="text-xs text-muted-foreground">Total this week: $23,900</span>
            <Button variant="ghost" size="sm">
              View All → {">"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Appointments + Vehicles Due */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's Appointments */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Today&apos;s Appointments</CardTitle>
                <CardDescription>5 appointments scheduled for today</CardDescription>
              </div>
              <Button variant="outline" size="sm" leftIcon={<Calendar className="size-4" />}>
                Manage
              </Button>
            </div>
          </CardHeader>
          <CardContent padding="none">
            <div className="divide-y divide-border">
              {todayAppointments.map((apt) => (
                <div key={apt.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="text-center min-w-[60px]">
                    <p className="text-xs font-medium text-foreground">{apt.time}</p>
                  </div>
                  <Avatar size="sm" fallback={apt.mechanic.initials} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{apt.customer}</p>
                    <p className="text-xs text-muted-foreground truncate">{apt.vehicle}</p>
                  </div>
                  <div className="hidden md:block text-right min-w-[140px]">
                    <p className="text-xs text-muted-foreground truncate">{apt.service}</p>
                  </div>
                  <AppointmentStatus status={apt.status} />
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" fullWidth leftIcon={<Calendar className="size-4" />}>
              View Full Schedule
            </Button>
          </CardFooter>
        </Card>

        {/* Vehicles Due for Service */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Due for Service</CardTitle>
                <CardDescription>Vehicles needing attention</CardDescription>
              </div>
              <Badge variant="warning" size="sm" dot>3 due</Badge>
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
                      <p className="text-xs text-muted-foreground font-mono truncate">VIN: {v.vin}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-foreground">{v.nextService}</p>
                      <Badge
                        variant={v.urgent ? "danger" : "warning"}
                        size="sm"
                      >
                        {v.dueDate}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" fullWidth>
              View All Vehicles
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Bottom Row: Activity + Upcoming Bookings + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest actions across your garage</CardDescription>
          </CardHeader>
          <CardContent padding="none">
            <div className="divide-y divide-border">
              {recentActivity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className={cn(
                    "size-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    a.type === "completed" && "bg-success/10 text-success",
                    a.type === "customer" && "bg-primary/10 text-primary",
                    a.type === "report" && "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
                    a.type === "payment" && "bg-success/10 text-success",
                    a.type === "order" && "bg-warning/10 text-warning",
                  )}>
                    {a.type === "completed" && <Wrench className="size-4" />}
                    {a.type === "customer" && <Users className="size-4" />}
                    {a.type === "report" && <FileText className="size-4" />}
                    {a.type === "payment" && <DollarSign className="size-4" />}
                    {a.type === "order" && <Clock className="size-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{a.action}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.detail}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" fullWidth>
              View All Activity
            </Button>
          </CardFooter>
        </Card>

        {/* Upcoming Bookings Timeline */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Upcoming Bookings</CardTitle>
            <CardDescription>Appointment volume for the week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingBookings.map((b) => (
                <div key={b.day} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground w-16">{b.day}</span>
                  <div className="flex-1 h-6 bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        b.count >= 10 ? "bg-primary" : b.count >= 6 ? "bg-primary/60" : "bg-muted-foreground/30"
                      )}
                      style={{ width: `${Math.min((b.count / 14) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-foreground min-w-[24px] text-right">{b.count}</span>
                  {b.trend === "up" ? (
                    <ArrowUpRight className="size-3.5 text-success" />
                  ) : (
                    <ArrowDownRight className="size-3.5 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" fullWidth leftIcon={<Calendar className="size-4" />}>
              Open Calendar
            </Button>
          </CardFooter>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks at your fingertips</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/50 transition-all duration-150 group"
                >
                  <div className={cn("p-3 rounded-xl transition-colors", action.color)}>
                    <action.icon className="size-5" />
                  </div>
                  <span className="text-xs font-medium text-foreground text-center">{action.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" size="sm" fullWidth leftIcon={<Search className="size-4" />}>
              Command Palette (⌘K)
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

// ─── Health Bar Component ─────────────────────────────────────
function HealthBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium text-foreground">{score}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
