"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Phone,
  Plus,
  QrCode,
  Send,
  Users,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { Badge, Button, cn, useToast } from "@garageos/design-system";

import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { NewAppointmentButton } from "@/components/appointments/new-appointment-modal";
import { CompleteWorkModal } from "@/components/appointments/complete-work-modal";
import { EmptyState } from "@/components/states/empty-state";
import type { Appointment, CalendarPayload, DueServices, VehicleHealth } from "@/lib/api/types";
import { HealthGauge } from "@/components/vehicles/health-gauge";

type View = "Day" | "Week" | "Month";
type Props = { initial: CalendarPayload; initialDate: string };

const START_HOUR = 8;
const END_HOUR = 18;
const SLOT_MIN = 30;
const ROW_H = 56;
const GUTTER_W = 64;
const LANE_W = 224;
const ROWS = ((END_HOUR - START_HOUR) * 60) / SLOT_MIN;
const BOARD_H = ROWS * ROW_H;
const UNASSIGNED = "Unassigned";
const DRAG_THRESHOLD = 4;

const STATUS_STYLE: Record<string, { bar: string; chip: string }> = {
  pending: { bar: "border-l-amber-500 bg-amber-500/5", chip: "bg-amber-500" },
  confirmed: { bar: "border-l-blue-500 bg-blue-500/5", chip: "bg-blue-500" },
  in_progress: { bar: "border-l-primary bg-primary/5", chip: "bg-primary" },
  completed: { bar: "border-l-emerald-500 bg-emerald-500/5", chip: "bg-emerald-500" },
  cancelled: { bar: "border-l-red-500 bg-red-500/5 opacity-60", chip: "bg-red-500" },
  rescheduled: { bar: "border-l-muted-foreground bg-muted/30", chip: "bg-muted-foreground" },
};

const hmToMin = (hm: string): number => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const minToHm = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (iso: string, days: number): string =>
  isoDay(new Date(new Date(iso + "T00:00:00Z").getTime() + days * 86_400_000));
const labelDate = (iso: string): string =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

type DragSession = {
  apptId: string;
  appt: Appointment;
  active: boolean;
  startClientX: number;
  startClientY: number;
  grabX: number;
  grabY: number;
  cardW: number;
  cardH: number;
  pointerX: number;
  pointerY: number;
  targetLane: string;
  targetStartMin: number;
  conflict: Appointment | null;
};
type ResizeSession = { apptId: string; startClientY: number; startDur: number; dur: number };
type Collision = { appt: Appointment; lane: string; dur: number; conflict: Appointment; suggestions: number[] };

export function CalendarClient({ initial, initialDate }: Props) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [view, setView] = useState<View>("Day");
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<CalendarPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [drag, setDrag] = useState<DragSession | null>(null);
  const [resize, setResize] = useState<ResizeSession | null>(null);
  const [collision, setCollision] = useState<Collision | null>(null);
  const [exitingId, setExitingId] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const resizeRef = useRef<ResizeSession | null>(null);
  const firstRun = useRef(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      setData(await clientFetch<CalendarPayload>(`/calendar?start=${d}&end=${addDays(d, 1)}`));
    } catch {
      toast({ title: t("common.load_failed"), variant: "danger" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (view === "Day") load(date);
  }, [date, view, load]);

  const todayIso = isoDay(new Date());
  const isToday = date === todayIso;

  const { lanes, byLane } = useMemo(() => {
    const names = data.mechanics.map((m) => m.name);
    const set = new Set(names);
    const buckets: Record<string, Appointment[]> = {};
    names.forEach((n) => (buckets[n] = []));
    let unassigned = false;
    for (const a of data.appointments) {
      const lane = a.mechanic_name && set.has(a.mechanic_name) ? a.mechanic_name : UNASSIGNED;
      if (lane === UNASSIGNED) unassigned = true;
      (buckets[lane] ??= []).push(a);
    }
    return { lanes: unassigned ? [...names, UNASSIGNED] : names, byLane: buckets };
  }, [data]);

  const laneOf = useCallback(
    (a: Appointment) => (a.mechanic_name && lanes.includes(a.mechanic_name) ? a.mechanic_name : UNASSIGNED),
    [lanes]
  );

  const findConflict = useCallback(
    (lane: string, startMin: number, dur: number, excludeId: string): Appointment | null => {
      for (const a of byLane[lane] ?? []) {
        if (a.id === excludeId || a.status === "cancelled" || a.status === "completed") continue;
        const s = hmToMin(a.appointment_time);
        const e = s + a.estimated_duration_minutes;
        if (startMin < e && startMin + dur > s) return a;
      }
      return null;
    },
    [byLane]
  );

  // ── Persist a move / resize (optimistic + PATCH) ────────────────────────
  const applyUpdate = useCallback(
    async (appt: Appointment, patch: Partial<Appointment>, toastMsg: string) => {
      setData((prev) => ({
        ...prev,
        appointments: prev.appointments.map((a) => (a.id === appt.id ? { ...a, ...patch } : a)),
      }));
      try {
        const body: Record<string, unknown> = {};
        if (patch.appointment_time !== undefined) {
          body.appointment_time = patch.appointment_time;
          body.appointment_date = `${date}T${patch.appointment_time}:00Z`;
        }
        if (patch.mechanic_name !== undefined) body.mechanic_name = patch.mechanic_name ?? "";
        if (patch.estimated_duration_minutes !== undefined) body.estimated_duration_minutes = patch.estimated_duration_minutes;
        await clientFetch(`/appointments/${appt.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: toastMsg, variant: "success" });
      } catch (error) {
        toast({ title: t(error instanceof ClientApiError && error.code === "APPOINTMENT_CONFLICT" ? "appointment.conflict" : "calendar.move_failed"), variant: "danger" });
        load(date);
      }
    },
    [date, load, toast, t]
  );

  // ── Drag to move ─────────────────────────────────────────────────────────
  const onCardPointerDown = (e: React.PointerEvent, appt: Appointment) => {
    if (appt.status === "completed" || appt.status === "cancelled") return; // locked
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const s: DragSession = {
      apptId: appt.id, appt, active: false,
      startClientX: e.clientX, startClientY: e.clientY,
      grabX: e.clientX - rect.left, grabY: e.clientY - rect.top,
      cardW: rect.width, cardH: rect.height,
      pointerX: e.clientX, pointerY: e.clientY,
      targetLane: laneOf(appt), targetStartMin: hmToMin(appt.appointment_time), conflict: null,
    };
    dragRef.current = s;
    setDrag(s);
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const s = dragRef.current;
      if (!s || !gridRef.current) return;
      if (!s.active) {
        if (Math.hypot(e.clientX - s.startClientX, e.clientY - s.startClientY) < DRAG_THRESHOLD) return;
        s.active = true;
      }
      const rect = gridRef.current.getBoundingClientRect();
      const topRel = e.clientY - rect.top - s.grabY;
      let startMin = START_HOUR * 60 + Math.round(topRel / ROW_H) * SLOT_MIN;
      const dur = s.appt.estimated_duration_minutes;
      startMin = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - dur, startMin));
      const laneIdx = Math.max(0, Math.min(lanes.length - 1, Math.floor((e.clientX - rect.left - GUTTER_W) / LANE_W)));
      const targetLane = lanes[laneIdx] ?? s.targetLane;
      const conflict = findConflict(targetLane, startMin, dur, s.apptId);
      const ns = { ...s, pointerX: e.clientX, pointerY: e.clientY, targetLane, targetStartMin: startMin, conflict };
      dragRef.current = ns;
      setDrag(ns);
    };
    const up = () => {
      const s = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!s) return;
      if (!s.active) { setSelected(s.appt); return; } // it was a click
      const originLane = laneOf(s.appt);
      const originStart = hmToMin(s.appt.appointment_time);
      if (s.targetLane === originLane && s.targetStartMin === originStart) return;
      if (s.conflict) {
        setCollision({
          appt: s.appt, lane: s.targetLane, dur: s.appt.estimated_duration_minutes, conflict: s.conflict,
          suggestions: suggestFree(s.targetLane, s.appt.estimated_duration_minutes, s.apptId),
        });
        return;
      }
      applyUpdate(
        s.appt,
        { appointment_time: minToHm(s.targetStartMin), mechanic_name: s.targetLane === UNASSIGNED ? null : s.targetLane },
        `Moved to ${s.targetLane} · ${minToHm(s.targetStartMin)}`
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const suggestFree = useCallback(
    (lane: string, dur: number, excludeId: string): number[] => {
      const out: number[] = [];
      for (let m = START_HOUR * 60; m + dur <= END_HOUR * 60 && out.length < 3; m += SLOT_MIN) {
        if (!findConflict(lane, m, dur, excludeId)) out.push(m);
      }
      return out;
    },
    [findConflict]
  );

  // ── Resize ───────────────────────────────────────────────────────────────
  const onResizePointerDown = (e: React.PointerEvent, appt: Appointment) => {
    e.stopPropagation();
    const s: ResizeSession = { apptId: appt.id, startClientY: e.clientY, startDur: appt.estimated_duration_minutes, dur: appt.estimated_duration_minutes };
    resizeRef.current = s;
    setResize(s);
  };
  useEffect(() => {
    if (!resize) return;
    const move = (e: PointerEvent) => {
      const s = resizeRef.current;
      if (!s) return;
      const deltaMin = Math.round((e.clientY - s.startClientY) / ROW_H * SLOT_MIN / 15) * 15;
      const dur = Math.max(15, Math.min(240, s.startDur + deltaMin));
      const ns = { ...s, dur };
      resizeRef.current = ns;
      setResize(ns);
    };
    const up = () => {
      const s = resizeRef.current;
      resizeRef.current = null;
      setResize(null);
      if (!s || s.dur === s.startDur) return;
      const appt = data.appointments.find((a) => a.id === s.apptId);
      if (appt) applyUpdate(appt, { estimated_duration_minutes: s.dur }, `Duration set to ${s.dur} min`);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize !== null]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") { setSelected(null); setCollision(null); }
      else if (e.key === "ArrowLeft") setDate((d) => addDays(d, -1));
      else if (e.key === "ArrowRight") setDate((d) => addDays(d, 1));
      else if (e.key.toLowerCase() === "t") setDate(todayIso);
      else if (e.key.toLowerCase() === "n") toast({ title: "Quick booking", description: "The ⌘K booking flow is coming next.", variant: "info" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [todayIso, toast]);

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nowTop = ((nowMin - START_HOUR * 60) / SLOT_MIN) * ROW_H;
  const showNow = isToday && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;

  const onSuggestion = (min: number) => {
    if (!collision) return;
    const { appt, lane } = collision;
    setCollision(null);
    applyUpdate(appt, { appointment_time: minToHm(min), mechanic_name: lane === UNASSIGNED ? null : lane }, `Moved to ${lane} · ${minToHm(min)}`);
  };
  const onTomorrow = () => {
    if (!collision) return;
    const { appt } = collision;
    setCollision(null);
    setData((prev) => ({ ...prev, appointments: prev.appointments.filter((a) => a.id !== appt.id) }));
    clientFetch(`/appointments/${appt.id}`, {
      method: "PATCH",
      body: JSON.stringify({ appointment_time: "09:00", appointment_date: `${addDays(date, 1)}T09:00:00Z` }),
    }).then(() => toast({ title: t("calendar.moved_tomorrow"), variant: "success" })).catch((error) => {
      toast({ title: t(error instanceof ClientApiError && error.code === "APPOINTMENT_CONFLICT" ? "appointment.conflict" : "calendar.move_failed"), variant: "danger" });
      load(date);
    });
  };

  const handleInspectorChanged = (action: string) => {
    if (action === "complete" && selected) {
      const id = selected.id;
      setSelected(null);
      setExitingId(id);
      toast({ title: t("work.completed"), variant: "success" });
      setTimeout(() => { setExitingId(null); load(date); }, 340);
    } else {
      setSelected(null);
      toast({ title: t(action === "cancel" ? "work.cancelled" : action === "start" ? "work.started" : "work.confirmed"), variant: action === "cancel" ? "warning" : "success" });
      load(date);
    }
  };

  return (
    <div className="flex flex-col h-full select-none">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Calendar</h1>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {(["Day", "Week", "Month"] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setDate(todayIso)}>Today</Button>
            <button onClick={() => setDate(addDays(date, -1))} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Previous day"><ChevronLeft className="size-4" /></button>
            <button onClick={() => setDate(addDays(date, 1))} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Next day"><ChevronRight className="size-4" /></button>
          </div>
          <NewAppointmentButton label="Book" presetDate={date} leftIcon={<Plus className="size-4" />} onCreated={() => load(date)} />
        </div>
      </div>

      <div className="px-4 lg:px-6 py-2 border-b border-border flex items-center gap-2">
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{labelDate(date)}</span>
        {loading && <Loader2 className="size-3.5 text-muted-foreground animate-spin" />}
        <span className="ml-auto text-[11px] text-muted-foreground/70 hidden md:inline">Drag to move · resize edge · <kbd className="px-1 rounded bg-muted">←</kbd>/<kbd className="px-1 rounded bg-muted">→</kbd> day · <kbd className="px-1 rounded bg-muted">T</kbd> today</span>
      </div>

      {view !== "Day" ? (
        <PlaceholderView view={view} />
      ) : lanes.length === 0 ? (
        <div className="flex-1">
          <EmptyState
            icon={Users}
            title="No mechanics to schedule yet"
            description="The board is organised into a lane per mechanic. Add your team, then appointments can be assigned and dragged between them."
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="min-w-max">
            {/* Lane headers */}
            <div className="flex sticky top-0 z-10 bg-background border-b border-border">
              <div className="w-16 shrink-0 border-r border-border" />
              {lanes.map((lane) => {
                const appts = byLane[lane] ?? [];
                const booked = appts.filter((a) => a.status !== "cancelled").reduce((s, a) => s + a.estimated_duration_minutes, 0);
                const pct = Math.min(100, Math.round((booked / ((END_HOUR - START_HOUR) * 60)) * 100));
                const heat = pct >= 85 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-emerald-500";
                return (
                  <div key={lane} className="w-56 shrink-0 border-r border-border px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", heat)} />
                      <span className="text-sm font-semibold text-foreground truncate flex-1">{lane === UNASSIGNED ? t("work.unassigned") : lane}</span>
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-500", heat)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grid body */}
            <div ref={gridRef} className="flex">
              <div className="w-16 shrink-0 border-r border-border relative" style={{ height: BOARD_H }}>
                {Array.from({ length: ROWS + 1 }).map((_, i) => (
                  <div key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums" style={{ top: i * ROW_H }}>
                    {String(START_HOUR + Math.floor(i / 2)).padStart(2, "0")}:{i % 2 === 0 ? "00" : "30"}
                  </div>
                ))}
              </div>

              {lanes.map((lane) => {
                const appts = byLane[lane] ?? [];
                const isTarget = !!drag && drag.active && drag.targetLane === lane;
                return (
                  <div
                    key={lane}
                    className={cn("w-56 shrink-0 border-r border-border relative transition-colors", isTarget && (drag?.conflict ? "bg-red-500/5" : "bg-emerald-500/5"))}
                    style={{ height: BOARD_H }}
                  >
                    {Array.from({ length: ROWS }).map((_, i) => (
                      <div key={i} className={cn("absolute left-0 right-0 border-b", i % 2 === 1 ? "border-border" : "border-border/40")} style={{ top: (i + 1) * ROW_H }} />
                    ))}
                    {appts.length === 0 && !isTarget && (
                      <div className="absolute inset-0 grid place-items-center pointer-events-none"><span className="text-[11px] text-muted-foreground/50">Available</span></div>
                    )}
                    {/* drop indicator */}
                    {isTarget && (
                      <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: ((drag!.targetStartMin - START_HOUR * 60) / SLOT_MIN) * ROW_H }}>
                        <div className={cn("h-0.5 rounded", drag?.conflict ? "bg-red-500" : "bg-emerald-500")} />
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
                      const dragging = !!drag && drag.active && drag.apptId === a.id;
                      const resizing = resize?.apptId === a.id;
                      const dur = resizing ? resize!.dur : a.estimated_duration_minutes;
                      const top = ((startMin - START_HOUR * 60) / SLOT_MIN) * ROW_H;
                      const height = Math.max(ROW_H - 6, (dur / SLOT_MIN) * ROW_H - 6);
                      const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.pending;
                      const locked = a.status !== "pending" && a.status !== "confirmed";
                      return (
                        <div
                          key={a.id}
                          data-testid={`calendar-appointment-${a.id}`}
                          onPointerDown={(e) => onCardPointerDown(e, a)}
                          className={cn(
                            "absolute left-1 right-1 rounded-lg border border-l-4 p-2 text-left overflow-hidden bg-card group",
                            st.bar,
                            locked ? "cursor-default" : "cursor-grab active:cursor-grabbing hover:shadow-md hover:z-30",
                            dragging && "opacity-30 border-dashed",
                            exitingId === a.id && "scale-90 opacity-0",
                            "transition-[transform,opacity,box-shadow] duration-300"
                          )}
                          style={{ top: Math.max(0, top), height }}
                        >
                          <div className="flex items-center gap-1.5">
                            <Wrench className="size-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-semibold text-foreground truncate flex-1">{a.service_type ?? "Service"}</span>
                            <span className={cn("size-1.5 rounded-full shrink-0", st.chip)} />
                          </div>
                          <p className="text-[11px] text-foreground/80 truncate mt-0.5">{a.vehicle_summary}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{a.customer_name}</p>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                            <Clock className="size-2.5" />{a.appointment_time} · {dur}m
                          </div>
                          {!locked && (
                            <div
                              onPointerDown={(e) => onResizePointerDown(e, a)}
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize flex items-end justify-center opacity-0 group-hover:opacity-100"
                            >
                              <div className="w-8 h-1 rounded-full bg-muted-foreground/40 mb-0.5" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Floating drag preview */}
      {drag && drag.active && (
        <div
          className="fixed z-60 pointer-events-none rounded-lg border border-l-4 bg-card p-2 shadow-2xl rotate-2"
          style={{
            left: drag.pointerX - drag.grabX, top: drag.pointerY - drag.grabY,
            width: drag.cardW, height: drag.cardH,
            borderLeftColor: drag.conflict ? "#ef4444" : "#10b981",
          }}
        >
          <div className="flex items-center gap-1.5">
            <Wrench className="size-3 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground truncate">{drag.appt.service_type ?? "Service"}</span>
          </div>
          <p className="text-[11px] text-foreground/80 truncate mt-0.5">{drag.appt.vehicle_summary}</p>
          <p className={cn("text-[10px] mt-1 font-medium", drag.conflict ? "text-red-500" : "text-emerald-600")}>
            {drag.conflict ? "Conflict" : `→ ${drag.targetLane} · ${minToHm(drag.targetStartMin)}`}
          </p>
        </div>
      )}

      {collision && (
        <CollisionPopover collision={collision} onPick={onSuggestion} onTomorrow={onTomorrow} onClose={() => setCollision(null)} />
      )}

      {selected && (
        <InspectorDrawer appointment={selected} onClose={() => setSelected(null)} onChanged={handleInspectorChanged} />
      )}
    </div>
  );
}

function PlaceholderView({ view }: { view: View }) {
  return (
    <div className="flex-1 grid place-items-center p-10">
      <div className="text-center max-w-sm">
        <div className="mx-auto size-12 rounded-full bg-muted grid place-items-center text-muted-foreground mb-3"><CalendarDays className="size-6" /></div>
        <p className="text-sm font-semibold text-foreground">{view} view is coming next</p>
        <p className="text-sm text-muted-foreground mt-1">The Day board is the operations hero. Week and Month arrive in the polish pass.</p>
      </div>
    </div>
  );
}

function CollisionPopover({ collision, onPick, onTomorrow, onClose }: { collision: Collision; onPick: (min: number) => void; onTomorrow: () => void; onClose: () => void }) {
  const c = collision.conflict;
  const end = minToHm(hmToMin(c.appointment_time) + c.estimated_duration_minutes);
  return (
    <>
      <div className="fixed inset-0 z-70 bg-black/20" onClick={onClose} />
      <div className="fixed z-71 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-80 rounded-2xl border border-border bg-background shadow-2xl p-5 animate-fade-in">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-5" />
          <p className="text-sm font-semibold">Mechanic unavailable</p>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          <span className="font-medium text-foreground">{collision.lane}</span> already has {c.service_type ?? "a job"} from{" "}
          <span className="font-medium text-foreground">{c.appointment_time}–{end}</span>.
        </p>
        <p className="text-xs font-medium text-foreground mt-4 mb-2">Suggested times</p>
        <div className="space-y-1.5">
          {collision.suggestions.map((m) => (
            <button key={m} onClick={() => onPick(m)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 transition-all text-sm">
              <span className="font-medium text-foreground">{minToHm(m)}</span>
              <span className="text-xs text-muted-foreground">{collision.lane}</span>
            </button>
          ))}
          <button onClick={onTomorrow} className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 transition-all text-sm">
            <span className="font-medium text-foreground">Tomorrow 09:00</span>
            <span className="text-xs text-muted-foreground">next day</span>
          </button>
        </div>
        <Button variant="ghost" size="sm" fullWidth className="mt-3" onClick={onClose}>Keep original</Button>
      </div>
    </>
  );
}

function InspectorDrawer({ appointment, onClose, onChanged }: { appointment: Appointment; onClose: () => void; onChanged: (action: string) => void }) {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const [health, setHealth] = useState<VehicleHealth | null>(null);
  const [due, setDue] = useState<DueServices | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [h, d] = await Promise.all([
          clientFetch<VehicleHealth>(`/vehicles/${appointment.vehicle_id}/health`),
          clientFetch<DueServices>(`/vehicles/${appointment.vehicle_id}/due-services`),
        ]);
        if (alive) { setHealth(h); setDue(d); }
      } catch { /* best effort */ }
    })();
    return () => { alive = false; };
  }, [appointment.vehicle_id]);

  const act = async (action: "confirm" | "start" | "cancel" | "complete") => {
    if (action === "complete") {
      setShowComplete(true);
      return;
    }
    if (action === "start" && !appointment.mechanic_name?.trim()) {
      toast({ title: t("work.assign_first"), variant: "warning" });
      return;
    }
    setBusy(action);
    try {
      await clientFetch(`/appointments/${appointment.id}/${action}`, { method: "PATCH" });
      onChanged(action);
    } catch {
      toast({ title: t("work.failed"), variant: "danger" });
      setBusy(null);
    }
  };

  const st = STATUS_STYLE[appointment.status] ?? STATUS_STYLE.pending;
  const canConfirm = appointment.status === "pending";
  const canStart = appointment.status === "confirmed";
  const canComplete = appointment.status === "in_progress";
  const canCancel = appointment.status === "pending" || appointment.status === "confirmed";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-background border-l border-border shadow-xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", st.chip)} /><span className="text-sm font-semibold text-foreground">{t(`status.${appointment.status}`)}</span></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-lg font-bold text-foreground">{appointment.service_type ?? t("common.general_service")}</p>
            <p className="text-sm text-muted-foreground">{appointment.vehicle_summary}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label={t("work.customer")} value={appointment.customer_name} />
            <Field label={t("work.mechanic")} value={appointment.mechanic_name ?? t("work.unassigned")} />
            <Field label={t("work.when")} value={`${appointment.appointment_time} · ${appointment.estimated_duration_minutes}m`} />
            <Field label={t("work.billing")} value={appointment.total_cost != null ? fmt.money(appointment.total_cost, "UZS") : "—"} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" leftIcon={<Phone className="size-4" />} className="flex-1">Call</Button>
            <Button variant="outline" size="sm" leftIcon={<Send className="size-4" />} className="flex-1">Telegram</Button>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Vehicle Health</p>
              <Link href={`/vehicles/${appointment.vehicle_id}`} className="text-xs text-primary hover:underline">Open →</Link>
            </div>
            {health ? (
              <div className="flex items-center gap-4 mt-2">
                <HealthGauge score={health.overall_score} band={health.band} size={92} stroke={9} />
                <div className="text-sm"><p className="font-medium text-foreground capitalize">{health.band}</p><p className="text-muted-foreground">{health.urgent_count} overdue · {health.due_soon_count} due soon</p></div>
              </div>
            ) : <p className="text-xs text-muted-foreground mt-2">Loading health…</p>}
            <Link href={`/passport/${appointment.vehicle_id}`} target="_blank" className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-border py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-muted/40 transition-colors">
              <QrCode className="size-3.5" /> View Certified Passport
            </Link>
          </div>
          {due && due.services.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold text-foreground mb-2">Due Services</p>
              <div className="space-y-1.5">
                {due.services.slice(0, 5).map((s) => (
                  <div key={s.service_type} className="flex items-center justify-between text-xs">
                    <span className="text-foreground truncate">{s.service_type}</span>
                    <Badge variant={(s.remaining_km != null && s.remaining_km < 0) ? "danger" : "warning"} size="sm">{(s.remaining_km != null && s.remaining_km < 0) ? "Overdue" : "Due Soon"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-border p-4 flex flex-wrap gap-2">
          {canConfirm && <Button size="sm" loading={busy === "confirm"} onClick={() => act("confirm")} leftIcon={<CheckCircle2 className="size-4" />}>{t("work.confirm")}</Button>}
          {canStart && <Button size="sm" loading={busy === "start"} onClick={() => act("start")} leftIcon={<Wrench className="size-4" />}>{t("work.start")}</Button>}
          {canComplete && <Button size="sm" variant="success" loading={busy === "complete"} onClick={() => act("complete")} leftIcon={<CheckCircle2 className="size-4" />}>{t("work.complete")}</Button>}
          {canCancel && <Button size="sm" variant="outline" loading={busy === "cancel"} onClick={() => act("cancel")} leftIcon={<XCircle className="size-4" />}>{t("work.cancel")}</Button>}
        </div>
      </aside>
      {showComplete && <CompleteWorkModal appointment={appointment}
        onClose={() => setShowComplete(false)}
        onCompleted={() => { setShowComplete(false); onChanged("complete"); }} />}
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
