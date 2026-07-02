"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock, CalendarPlus, Check, CheckCheck, ChevronLeft, ChevronRight, Clock,
  MoreHorizontal, QrCode, Search, User, Wrench, X,
} from "lucide-react";
import {
  Badge, Button, cn, useToast,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import type {
  Appointment, AppointmentListResponse, AppointmentStats, AppointmentStatus,
} from "@/lib/api/types";

// Appointments = operational management queue (Calendar owns scheduling). Real
// data, KPI strip, date + status filters, per-row launchpad into every module,
// and bulk actions.
const STATUS_TABS: { key: string; label: string; statKey?: keyof AppointmentStats }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending", statKey: "pending_count" },
  { key: "confirmed", label: "Confirmed", statKey: "confirmed_count" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed", statKey: "completed_count" },
  { key: "cancelled", label: "Cancelled", statKey: "cancelled_count" },
];

type DateFilter = "all" | "today" | "tomorrow" | "week" | "overdue";
const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: "all", label: "All dates" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "overdue", label: "Overdue" },
];

const STATUS_BADGE: Record<AppointmentStatus, "warning" | "info" | "primary" | "success" | "danger" | "neutral"> = {
  pending: "warning", confirmed: "info", in_progress: "primary",
  completed: "success", cancelled: "danger", rescheduled: "neutral",
};

const PAGE_SIZE = 15;

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Returns the query params for the active date quick-filter.
function dateParams(f: DateFilter): Record<string, string> {
  const today = new Date();
  const iso = localISO(today);
  if (f === "today") return { date_from: iso, date_to: iso };
  if (f === "tomorrow") {
    const t = new Date(today); t.setDate(t.getDate() + 1);
    return { date_from: localISO(t), date_to: localISO(t) };
  }
  if (f === "week") {
    const end = new Date(today); end.setDate(end.getDate() + 6);
    return { date_from: iso, date_to: localISO(end) };
  }
  if (f === "overdue") return { overdue: "true" };
  return {};
}

function fmtDuration(min: number): string {
  if (!min) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function plateOf(summary: string): { name: string; plate: string | null } {
  const m = summary.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { name: m[1].trim(), plate: m[2] } : { name: summary, plate: null };
}

export function AppointmentsList() {
  const { toast } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [data, setData] = useState<AppointmentListResponse | null>(null);
  const [stats, setStats] = useState<AppointmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadStats = useCallback(() => {
    clientFetch<AppointmentStats>("/appointments/stats").then(setStats).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), ...dateParams(dateFilter) });
    if (tab !== "all") qs.set("status", tab);
    try {
      setData(await clientFetch<AppointmentListResponse>(`/appointments?${qs.toString()}`));
    } catch { /* keep */ } finally { setLoading(false); }
  }, [tab, page, dateFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { setSelected(new Set()); }, [tab, dateFilter, page]);

  const act = useCallback(async (id: string, action: "confirm" | "cancel") => {
    try {
      await clientFetch(`/appointments/${id}/${action}`, { method: "PATCH", body: JSON.stringify({}) });
      toast({ title: action === "confirm" ? "Appointment confirmed" : "Appointment cancelled", variant: "success" });
      load(); loadStats();
    } catch { toast({ title: "Action failed", variant: "danger" }); }
  }, [load, loadStats, toast]);

  const bulkAct = useCallback(async (action: "confirm" | "cancel") => {
    const ids = [...selected];
    if (!ids.length) return;
    const results = await Promise.allSettled(
      ids.map((id) => clientFetch(`/appointments/${id}/${action}`, { method: "PATCH", body: JSON.stringify({}) })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    toast({ title: `${ok}/${ids.length} ${action === "confirm" ? "confirmed" : "cancelled"}`, variant: ok ? "success" : "danger" });
    setSelected(new Set()); load(); loadStats();
  }, [selected, load, loadStats, toast]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const items = data?.items ?? [];
    if (!s) return items;
    return items.filter((a) =>
      a.customer_name.toLowerCase().includes(s) ||
      a.vehicle_summary.toLowerCase().includes(s) ||
      (a.service_type ?? "").toLowerCase().includes(s));
  }, [q, data]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const KPIS = stats ? [
    { label: "Today", value: stats.today_count, tone: "text-foreground" },
    { label: "Waiting confirmation", value: stats.pending_count, tone: "text-amber-600" },
    { label: "Confirmed", value: stats.confirmed_count, tone: "text-blue-600" },
    { label: "Completed", value: stats.completed_count, tone: "text-emerald-600" },
    { label: "Cancelled", value: stats.cancelled_count, tone: "text-red-600" },
  ] : [];

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground mt-1">Your operational queue — filter, action, and jump into any record.</p>
        </div>
        <Link href="/calendar"><Button size="sm" leftIcon={<CalendarPlus className="size-4" />}>New Appointment</Button></Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {KPIS.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{k.label}</p>
            <p className={cn("text-2xl font-bold mt-1 tabular-nums", k.tone)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          {STATUS_TABS.map((t) => {
            const count = t.statKey && stats ? stats[t.statKey] : undefined;
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
                className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5",
                  tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                {t.label}
                {count != null && <span className={cn("text-[11px] font-bold rounded-full px-1.5", tab === t.key ? "bg-white/20" : "bg-muted")}>{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 ml-auto">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, vehicle, service…"
            className="bg-transparent py-2 text-sm text-foreground outline-none w-56 placeholder:text-muted-foreground" />
        </div>
      </div>

      {/* Quick date filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <CalendarClock className="size-4 text-muted-foreground" />
        {DATE_FILTERS.map((d) => (
          <button key={d.key} onClick={() => { setDateFilter(d.key); setPage(1); }}
            className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
              dateFilter === d.key ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted")}>
            {d.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-semibold text-foreground">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" variant="outline" leftIcon={<CheckCheck className="size-4" />} onClick={() => bulkAct("confirm")}>Confirm</Button>
            <Button size="sm" variant="outline" leftIcon={<X className="size-4" />} onClick={() => bulkAct("cancel")}>Cancel</Button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-[auto_1.3fr_1.4fr_1.1fr_1fr_1fr_auto_auto] gap-3 px-4 py-2.5 border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground items-center">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4 accent-[hsl(var(--primary))]" aria-label="Select all" />
          <span>Customer</span><span>Vehicle</span><span>Service</span><span>When</span><span>Mechanic</span>
          <span className="text-center">Duration</span><span className="text-right pr-1">Status</span>
        </div>

        {loading && (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 px-4 flex items-center"><div className="h-3 w-1/3 rounded bg-muted animate-pulse" /></div>
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="py-16 text-center">
            <CalendarPlus className="size-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No appointments match these filters.</p>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="divide-y divide-border">
            {rows.map((a) => (
              <Row key={a.id} a={a} selected={selected.has(a.id)} onToggle={() => toggleOne(a.id)} onAct={act} router={router} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {data.page} of {data.total_pages} · {data.total} total</p>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-40 hover:bg-muted"><ChevronLeft className="size-4" /></button>
            <button disabled={page >= data.total_pages} onClick={() => setPage((p) => p + 1)} className="grid size-8 place-items-center rounded-lg border border-border disabled:opacity-40 hover:bg-muted"><ChevronRight className="size-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  a, selected, onToggle, onAct, router,
}: {
  a: Appointment;
  selected: boolean;
  onToggle: () => void;
  onAct: (id: string, action: "confirm" | "cancel") => void;
  router: ReturnType<typeof useRouter>;
}) {
  const date = new Date(a.appointment_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const { name: vehName, plate } = plateOf(a.vehicle_summary);
  const canConfirm = a.status === "pending";
  const canCancel = a.status === "pending" || a.status === "confirmed";

  return (
    <div className={cn("grid grid-cols-[auto_1.3fr_1.4fr_1.1fr_1fr_1fr_auto_auto] gap-3 px-4 py-3 items-center transition-colors",
      selected ? "bg-primary/5" : "hover:bg-muted/30")}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="size-4 accent-[hsl(var(--primary))]" aria-label="Select row" />
      <div className="flex items-center gap-2 min-w-0">
        <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">
          {a.customer_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?"}
        </span>
        <Link href={`/customers/${a.customer_id}`} className="text-sm font-medium text-foreground truncate hover:text-primary hover:underline">{a.customer_name || "—"}</Link>
      </div>
      <Link href={`/vehicles/${a.vehicle_id}`} className="min-w-0 group">
        <span className="text-sm text-foreground/90 truncate block group-hover:text-primary group-hover:underline">{vehName || "—"}</span>
        {plate && <span className="text-[11px] font-mono text-muted-foreground">{plate}</span>}
      </Link>
      <span className="text-sm text-muted-foreground truncate flex items-center gap-1.5"><Wrench className="size-3.5 shrink-0 text-muted-foreground/60" />{a.service_type ?? "General service"}</span>
      <span className="text-sm text-foreground/90 flex items-center gap-1.5"><Clock className="size-3.5 shrink-0 text-muted-foreground/60" /><span className="tabular-nums">{date} · {a.appointment_time}</span></span>
      <span className="text-sm text-muted-foreground truncate flex items-center gap-1.5">
        {a.mechanic_name ? <><User className="size-3.5 shrink-0 text-muted-foreground/60" />{a.mechanic_name}</> : <span className="text-muted-foreground/50">Unassigned</span>}
      </span>
      <span className="text-sm text-muted-foreground text-center tabular-nums">{fmtDuration(a.estimated_duration_minutes)}</span>
      <div className="flex items-center justify-end gap-2">
        <Badge variant={STATUS_BADGE[a.status]} size="sm" className="capitalize">{a.status.replace("_", " ")}</Badge>
        <RowActions a={a} canConfirm={canConfirm} canCancel={canCancel} onAct={onAct} router={router} />
      </div>
    </div>
  );
}

function RowActions({
  a, canConfirm, canCancel, onAct, router,
}: {
  a: Appointment;
  canConfirm: boolean;
  canCancel: boolean;
  onAct: (id: string, action: "confirm" | "cancel") => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="grid size-7 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted" aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {canConfirm && <DropdownMenuItem icon={<Check className="size-4" />} onClick={() => onAct(a.id, "confirm")}>Confirm</DropdownMenuItem>}
        {canCancel && <DropdownMenuItem icon={<X className="size-4" />} destructive onClick={() => onAct(a.id, "cancel")}>Cancel</DropdownMenuItem>}
        {(canConfirm || canCancel) && <DropdownMenuSeparator />}
        <DropdownMenuItem icon={<User className="size-4" />} onClick={() => router.push(`/customers/${a.customer_id}`)}>Open Customer 360</DropdownMenuItem>
        <DropdownMenuItem icon={<Wrench className="size-4" />} onClick={() => router.push(`/vehicles/${a.vehicle_id}`)}>Open Vehicle</DropdownMenuItem>
        <DropdownMenuItem icon={<QrCode className="size-4" />} onClick={() => window.open(`/passport/${a.vehicle_id}`, "_blank")}>Open Passport</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<CalendarClock className="size-4" />} onClick={() => router.push("/calendar")}>Reschedule</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
