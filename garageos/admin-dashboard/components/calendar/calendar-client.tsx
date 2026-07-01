"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Phone,
  Plus,
  Send,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { Badge, Button, cn } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import type {
  Appointment,
  CalendarPayload,
  DueServices,
  VehicleHealth,
} from "@/lib/api/types";
import { HealthGauge } from "@/components/vehicles/health-gauge";

type View = "Day" | "Week" | "Month";
type Props = { initial: CalendarPayload; initialDate: string };

const START_HOUR = 8;
const END_HOUR = 18;
const SLOT_MIN = 30;
const ROW_H = 56; // px per 30-min row
const ROWS = ((END_HOUR - START_HOUR) * 60) / SLOT_MIN;
const BOARD_H = ROWS * ROW_H;
const UNASSIGNED = "Unassigned";

const STATUS_STYLE: Record<string, { bar: string; chip: string; label: string; variant: string }> = {
  pending: { bar: "border-l-amber-500 bg-amber-500/5", chip: "bg-amber-500", label: "Pending", variant: "warning" },
  confirmed: { bar: "border-l-blue-500 bg-blue-500/5", chip: "bg-blue-500", label: "Confirmed", variant: "info" },
  in_progress: { bar: "border-l-primary bg-primary/5", chip: "bg-primary", label: "In Progress", variant: "primary" },
  completed: { bar: "border-l-emerald-500 bg-emerald-500/5", chip: "bg-emerald-500", label: "Completed", variant: "success" },
  cancelled: { bar: "border-l-red-500 bg-red-500/5 opacity-60", chip: "bg-red-500", label: "Cancelled", variant: "danger" },
  rescheduled: { bar: "border-l-muted-foreground bg-muted/30", chip: "bg-muted-foreground", label: "Rescheduled", variant: "neutral" },
};

function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + (m || 0);
}
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  return isoDay(new Date(new Date(iso + "T00:00:00Z").getTime() + days * 86_400_000));
}
function labelDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long",
  });
}

export function CalendarClient({ initial, initialDate }: Props) {
  const [view, setView] = useState<View>("Day");
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<CalendarPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("just now");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const firstRun = useRef(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const payload = await clientFetch<CalendarPayload>(`/calendar?start=${d}&end=${addDays(d, 1)}`);
      setData(payload);
      setUpdatedAt("just now");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return; // initial data already provided by the server
    }
    if (view === "Day") load(date);
  }, [date, view, load]);

  const todayIso = isoDay(new Date());
  const isToday = date === todayIso;

  // Build lanes from mechanics + any appointment mechanic not in the roster.
  const laneNames = data.mechanics.map((m) => m.name);
  const laneSet = new Set(laneNames);
  let hasUnassigned = false;
  const byLane: Record<string, Appointment[]> = {};
  laneNames.forEach((n) => (byLane[n] = []));
  for (const appt of data.appointments) {
    const lane = appt.mechanic_name && laneSet.has(appt.mechanic_name) ? appt.mechanic_name : UNASSIGNED;
    if (lane === UNASSIGNED) hasUnassigned = true;
    (byLane[lane] ??= []).push(appt);
  }
  const lanes = hasUnassigned ? [...laneNames, UNASSIGNED] : laneNames;

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nowTop = ((nowMin - START_HOUR * 60) / SLOT_MIN) * ROW_H;
  const showNow = isToday && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Calendar</h1>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live · Updated {updatedAt}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {(["Day", "Week", "Month"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setDate(todayIso)}>Today</Button>
            <button onClick={() => setDate(addDays(date, -1))} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Previous day">
              <ChevronLeft className="size-4" />
            </button>
            <button onClick={() => setDate(addDays(date, 1))} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Next day">
              <ChevronRight className="size-4" />
            </button>
          </div>

          <Button size="sm" leftIcon={<Plus className="size-4" />}>Book</Button>
        </div>
      </div>

      <div className="px-4 lg:px-6 py-2 border-b border-border flex items-center gap-2">
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{labelDate(date)}</span>
        {loading && <Loader2 className="size-3.5 text-muted-foreground animate-spin" />}
      </div>

      {view !== "Day" ? (
        <div className="flex-1 grid place-items-center p-10">
          <div className="text-center max-w-sm">
            <div className="mx-auto size-12 rounded-full bg-muted grid place-items-center text-muted-foreground mb-3">
              <CalendarDays className="size-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">{view} view is coming next</p>
            <p className="text-sm text-muted-foreground mt-1">The Day board is the operations hero. Week and Month arrive in the polish pass.</p>
          </div>
        </div>
      ) : lanes.length === 0 ? (
        <div className="flex-1 grid place-items-center p-10 text-sm text-muted-foreground">No mechanics configured for this garage.</div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            {/* Lane headers */}
            <div className="flex sticky top-0 z-10 bg-background border-b border-border">
              <div className="w-16 shrink-0 border-r border-border" />
              {lanes.map((lane) => {
                const appts = byLane[lane] ?? [];
                const bookedMin = appts
                  .filter((a) => a.status !== "cancelled")
                  .reduce((s, a) => s + a.estimated_duration_minutes, 0);
                const pct = Math.min(100, Math.round((bookedMin / ((END_HOUR - START_HOUR) * 60)) * 100));
                return (
                  <div key={lane} className="w-56 shrink-0 border-r border-border px-3 py-2" title={`${appts.length} appointments · ~${(bookedMin / 60).toFixed(1)}h booked`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground truncate">{lane}</span>
                      <span className={cn("text-xs font-medium tabular-nums", pct >= 85 ? "text-danger" : pct >= 50 ? "text-warning" : "text-muted-foreground")}>{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", pct >= 85 ? "bg-danger" : pct >= 50 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grid body */}
            <div className="flex">
              {/* Time gutter */}
              <div className="w-16 shrink-0 border-r border-border relative" style={{ height: BOARD_H }}>
                {Array.from({ length: ROWS + 1 }).map((_, i) => (
                  <div key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums" style={{ top: i * ROW_H }}>
                    {String(START_HOUR + Math.floor(i / 2)).padStart(2, "0")}:{i % 2 === 0 ? "00" : "30"}
                  </div>
                ))}
              </div>

              {/* Lanes */}
              {lanes.map((lane) => {
                const appts = byLane[lane] ?? [];
                return (
                  <div key={lane} className="w-56 shrink-0 border-r border-border relative" style={{ height: BOARD_H }}>
                    {/* gridlines */}
                    {Array.from({ length: ROWS }).map((_, i) => (
                      <div key={i} className={cn("absolute left-0 right-0 border-b", i % 2 === 1 ? "border-border" : "border-border/40")} style={{ top: (i + 1) * ROW_H, height: 0 }} />
                    ))}
                    {appts.length === 0 && (
                      <div className="absolute inset-0 grid place-items-center pointer-events-none">
                        <span className="text-[11px] text-muted-foreground/50">Available</span>
                      </div>
                    )}
                    {showNow && (
                      <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
                        <div className="h-px bg-red-500" />
                        <div className="absolute -left-1 -top-1 size-2 rounded-full bg-red-500" />
                      </div>
                    )}
                    {appts.map((a) => {
                      const startMin = hmToMin(a.appointment_time);
                      const top = ((startMin - START_HOUR * 60) / SLOT_MIN) * ROW_H;
                      const height = Math.max(ROW_H - 6, (a.estimated_duration_minutes / SLOT_MIN) * ROW_H - 6);
                      const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.pending;
                      return (
                        <button
                          key={a.id}
                          onClick={() => setSelected(a)}
                          className={cn(
                            "absolute left-1 right-1 rounded-lg border border-l-4 p-2 text-left overflow-hidden transition-all hover:shadow-md hover:z-30 hover:-translate-y-px bg-card",
                            st.bar
                          )}
                          style={{ top: Math.max(0, top), height }}
                        >
                          <div className="flex items-center gap-1.5">
                            <Wrench className="size-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-semibold text-foreground truncate">{a.service_type ?? "Service"}</span>
                          </div>
                          <p className="text-[11px] text-foreground/80 truncate mt-0.5">{a.vehicle_summary}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{a.customer_name}</p>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                            <Clock className="size-2.5" />
                            {a.appointment_time} · {a.estimated_duration_minutes}m
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <InspectorDrawer
          appointment={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(date); }}
        />
      )}
    </div>
  );
}

function InspectorDrawer({
  appointment, onClose, onChanged,
}: {
  appointment: Appointment;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [health, setHealth] = useState<VehicleHealth | null>(null);
  const [due, setDue] = useState<DueServices | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [h, d] = await Promise.all([
          clientFetch<VehicleHealth>(`/vehicles/${appointment.vehicle_id}/health`),
          clientFetch<DueServices>(`/vehicles/${appointment.vehicle_id}/due-services`),
        ]);
        if (alive) { setHealth(h); setDue(d); }
      } catch { /* health is best-effort in the inspector */ }
    })();
    return () => { alive = false; };
  }, [appointment.vehicle_id]);

  const act = async (action: "confirm" | "cancel" | "complete") => {
    setBusy(action);
    try {
      const init: RequestInit = { method: "PATCH" };
      if (action === "complete") init.body = JSON.stringify({});
      await clientFetch(`/appointments/${appointment.id}/${action}`, init);
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const st = STATUS_STYLE[appointment.status] ?? STATUS_STYLE.pending;
  const canConfirm = appointment.status === "pending";
  const canComplete = ["pending", "confirmed", "in_progress"].includes(appointment.status);
  const canCancel = !["completed", "cancelled"].includes(appointment.status);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-background border-l border-border shadow-xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", st.chip)} />
            <span className="text-sm font-semibold text-foreground">{st.label}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-lg font-bold text-foreground">{appointment.service_type ?? "Service"}</p>
            <p className="text-sm text-muted-foreground">{appointment.vehicle_summary}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Customer" value={appointment.customer_name} />
            <Field label="Mechanic" value={appointment.mechanic_name ?? "Unassigned"} />
            <Field label="Time" value={`${appointment.appointment_time} · ${appointment.estimated_duration_minutes}m`} />
            <Field label="Cost" value={appointment.total_cost != null ? `$${appointment.total_cost.toLocaleString()}` : "—"} />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" leftIcon={<Phone className="size-4" />} className="flex-1">Call</Button>
            <Button variant="outline" size="sm" leftIcon={<Send className="size-4" />} className="flex-1">Telegram</Button>
          </div>

          {/* Vehicle health */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Vehicle Health</p>
              <Link href={`/vehicles/${appointment.vehicle_id}`} className="text-xs text-primary hover:underline">Open →</Link>
            </div>
            {health ? (
              <div className="flex items-center gap-4 mt-2">
                <HealthGauge score={health.overall_score} band={health.band} size={92} stroke={9} />
                <div className="text-sm">
                  <p className="font-medium text-foreground capitalize">{health.band}</p>
                  <p className="text-muted-foreground">{health.urgent_count} overdue · {health.due_soon_count} due soon</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-2">Loading health…</p>
            )}
          </div>

          {due && due.services.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold text-foreground mb-2">Due Services</p>
              <div className="space-y-1.5">
                {due.services.slice(0, 5).map((s) => (
                  <div key={s.service_type} className="flex items-center justify-between text-xs">
                    <span className="text-foreground truncate">{s.service_type}</span>
                    <Badge variant={(s.remaining_km != null && s.remaining_km < 0) ? "danger" : "warning"} size="sm">
                      {(s.remaining_km != null && s.remaining_km < 0) ? "Overdue" : "Due Soon"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Lifecycle actions */}
        <div className="border-t border-border p-4 flex flex-wrap gap-2">
          {canConfirm && (
            <Button size="sm" loading={busy === "confirm"} onClick={() => act("confirm")} leftIcon={<CheckCircle2 className="size-4" />}>Confirm</Button>
          )}
          {canComplete && (
            <Button size="sm" variant="success" loading={busy === "complete"} onClick={() => act("complete")} leftIcon={<CheckCircle2 className="size-4" />}>Complete</Button>
          )}
          {canCancel && (
            <Button size="sm" variant="outline" loading={busy === "cancel"} onClick={() => act("cancel")} leftIcon={<XCircle className="size-4" />}>Cancel</Button>
          )}
        </div>
      </aside>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  );
}
