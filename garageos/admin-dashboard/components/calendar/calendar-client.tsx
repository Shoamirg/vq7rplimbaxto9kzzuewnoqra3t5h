"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn, Dialog, DialogContent, DialogTitle, useToast } from "@garageos/design-system";
import { clientFetch, ClientApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import type { Appointment, CalendarPayload } from "@/lib/api/types";
import { NewAppointmentModal } from "@/components/appointments/new-appointment-modal";
import { CalendarOverview } from "./calendar-overview";
import { CalendarInspector } from "./calendar-inspector";
import { CalendarDayBoard, ROW_H, SLOT_MIN, GUTTER_W, LANE_W } from "./calendar-day-board";
import { addDays, assignmentPatch, appointmentLane, calendarConflict, calendarLanes, calendarPeriod, editable, END_MIN, hmToMin, isoDay, minToHm, shiftPeriod, START_MIN, type CalendarView, type Lane } from "./calendar-model";

type Drag = { appointment: Appointment; active: boolean; startX: number; startY: number; grabY: number; x: number; y: number; lane: string; start: number; conflict: Appointment | null };
type Resize = { appointment: Appointment; startY: number; duration: number };
type Collision = { appointment: Appointment; lane: Lane; conflict: Appointment; suggestions: number[] };
const CONTROL = "min-h-11 min-w-11 rounded-lg border border-border px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary";

export function CalendarClient({ initial, initialDate }: { initial: CalendarPayload; initialDate: string }) {
  const { t, fmt } = useI18n(); const { toast } = useToast();
  const [view, setView] = useState<CalendarView>("Day"); const [date, setDate] = useState(initialDate);
  const [cancelled, setCancelled] = useState(false); const [data, setData] = useState(initial);
  const [dataKey, setDataKey] = useState(`${initial.start}/${initial.end}/false`);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null); const [booking, setBooking] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null); const [resize, setResize] = useState<Resize | null>(null); const [collision, setCollision] = useState<Collision | null>(null);
  const epoch = useRef(0); const first = useRef(true); const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null); const resizeRef = useRef<Resize | null>(null); const suppressClick = useRef(false);
  const trigger = useRef<HTMLElement | null>(null); const bookRef = useRef<HTMLButtonElement>(null);
  const period = useMemo(() => calendarPeriod(date, view), [date, view]); const key = `${period.start}/${period.end}/${cancelled}`;
  const ready = dataKey === key && !loading && !error; const today = isoDay(new Date());
  const lanes = useMemo(() => calendarLanes(data), [data]);
  const laneLabel = (lane: Lane) => lane.kind === "unassigned" ? t("work.unassigned") : lane.kind === "legacy" ? t("calendar.legacy", { name: lane.name || t("work.unassigned") }) : lane.ordinal ? t("calendar.account_ordinal", { name: lane.name, n: fmt.number(lane.ordinal) }) : lane.name;
  const load = useCallback(async () => {
    const request = ++epoch.current; setLoading(true); setError(false);
    try { const payload = await clientFetch<CalendarPayload>(`/calendar?start=${period.start}&end=${period.end}&include_cancelled=${cancelled}`); if (request === epoch.current) { setData(payload); setDataKey(key); } }
    catch { if (request === epoch.current) setError(true); }
    finally { if (request === epoch.current) setLoading(false); }
  }, [period.start, period.end, cancelled, key]);
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    dragRef.current = null; resizeRef.current = null; setDrag(null); setResize(null); setCollision(null); setSelected(null);
    const requests = epoch;
    void load(); return () => { ++requests.current; };
  }, [load]);
  const returnFocus = () => { if (trigger.current?.isConnected) trigger.current.focus(); else bookRef.current?.focus(); };
  function open(appointment: Appointment) { if (suppressClick.current) { suppressClick.current = false; return; } trigger.current = document.activeElement as HTMLElement; setSelected(appointment); }
  function book(day: string) { trigger.current = document.activeElement as HTMLElement; setBooking(day); }
  async function update(appointment: Appointment, patch: Record<string, unknown>, title: string) {
    if (busy) return; setBusy(true);
    try { const response = await clientFetch<Appointment>(`/appointments/${appointment.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setData(previous => ({ ...previous, appointments: previous.appointments.map(a => a.id === response.id ? response : a) })); toast({ title, variant: "success" }); }
    catch (cause) { toast({ title: t(cause instanceof ClientApiError && cause.code === "APPOINTMENT_CONFLICT" ? "appointment.conflict" : "calendar.move_failed"), variant: "danger" }); }
    finally { setBusy(false); void loadRef.current(); }
  }
  function conflictFor(lane: Lane, start: number, appointment: Appointment) { return calendarConflict(data.appointments, lane, appointment.appointment_local_date || appointment.appointment_date.slice(0, 10), start, appointment.estimated_duration_minutes, appointment.id); }
  function moveTo(appointment: Appointment, lane: Lane, start: number) {
    const assignment = assignmentPatch(appointment, lane, data.mechanics); if (!assignment) return;
    void update(appointment, { appointment_time: minToHm(start), appointment_date: `${appointment.appointment_local_date || appointment.appointment_date.slice(0, 10)}T${minToHm(start)}:00Z`, ...assignment }, t("calendar.moved", { lane: laneLabel(lane), time: minToHm(start) }));
  }
  function onDrag(event: ReactPointerEvent, appointment: Appointment) {
    if (event.button !== 0 || !editable(appointment) || busy) return;
    const box = event.currentTarget.getBoundingClientRect();
    const value: Drag = { appointment, active: false, startX: event.clientX, startY: event.clientY, grabY: event.clientY - box.top, x: event.clientX, y: event.clientY, lane: appointmentLane(appointment, data.mechanics), start: hmToMin(appointment.appointment_time), conflict: null };
    dragRef.current = value; setDrag(value);
  }
  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current; if (!current || !gridRef.current) return;
      if (!current.active && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 4) return;
      const box = gridRef.current.getBoundingClientRect();
      const lane = lanes[Math.max(0, Math.min(lanes.length - 1, Math.floor((event.clientX - box.left - GUTTER_W) / LANE_W)))];
      if (!lane || !assignmentPatch(current.appointment, lane, data.mechanics)) return;
      const start = Math.max(START_MIN, Math.min(END_MIN - current.appointment.estimated_duration_minutes, START_MIN + Math.round((event.clientY - box.top - current.grabY) / ROW_H) * SLOT_MIN));
      const next = { ...current, active: true, x: event.clientX, y: event.clientY, lane: lane.key, start, conflict: conflictFor(lane, start, current.appointment) }; dragRef.current = next; setDrag(next);
    };
    const up = () => {
      const current = dragRef.current; dragRef.current = null; setDrag(null); if (!current?.active) return;
      suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0);
      const lane = lanes.find(l => l.key === current.lane);
      if (!lane || current.lane === appointmentLane(current.appointment, data.mechanics) && current.start === hmToMin(current.appointment.appointment_time)) return;
      if (current.conflict) {
        const suggestions: number[] = []; for (let start = START_MIN; start + current.appointment.estimated_duration_minutes <= END_MIN && suggestions.length < 3; start += SLOT_MIN) if (!conflictFor(lane, start, current.appointment)) suggestions.push(start);
        trigger.current = document.activeElement as HTMLElement; setCollision({ appointment: current.appointment, lane, conflict: current.conflict, suggestions });
      } else moveTo(current.appointment, lane, current.start);
    };
    const cancel = () => { dragRef.current = null; setDrag(null); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
    // The pointer session snapshots its calendar until drop/cancellation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);
  function onResize(event: ReactPointerEvent, appointment: Appointment) { if (event.button !== 0 || busy || !editable(appointment)) return; const value = { appointment, startY: event.clientY, duration: appointment.estimated_duration_minutes }; resizeRef.current = value; setResize(value); }
  useEffect(() => {
    if (!resize) return;
    const move = (event: PointerEvent) => { const current = resizeRef.current; if (!current) return; const duration = Math.max(15, Math.min(480, current.appointment.estimated_duration_minutes + Math.round((event.clientY - current.startY) / ROW_H * SLOT_MIN / 15) * 15)); const next = { ...current, duration }; resizeRef.current = next; setResize(next); };
    const up = () => { const current = resizeRef.current; resizeRef.current = null; setResize(null); if (current && current.duration !== current.appointment.estimated_duration_minutes) void update(current.appointment, { estimated_duration_minutes: current.duration }, t("calendar.duration", { n: fmt.number(current.duration) })); };
    const cancel = () => { resizeRef.current = null; setResize(null); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize !== null]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { const target = event.target as HTMLElement;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || busy || document.querySelector('[role="dialog"]') || target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setDate(day => shiftPeriod(day, view, event.key === "ArrowLeft" ? -1 : 1)); }
      else if (event.key.toLowerCase() === "t") { event.preventDefault(); setDate(today); }
      else if (event.key.toLowerCase() === "n") { event.preventDefault(); trigger.current = target; setBooking(date); }
    }; window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [view, today, date, busy]);
  const periodLabel = view === "Day" ? fmt.date(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : view === "Month" ? fmt.date(date, { month: "long", year: "numeric" }) : `${fmt.date(period.start)} – ${fmt.date(addDays(period.end, -1))}`;
  return <div className="flex flex-col h-full min-w-0">
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background p-3">
      <h1 className="text-xl font-bold mr-auto">{t("nav.calendar")}</h1>
      <div className="flex flex-wrap gap-1">{(["Day", "Week", "Month"] as CalendarView[]).map(mode => <button key={mode} type="button" disabled={busy} aria-pressed={view === mode} onClick={() => setView(mode)} className={cn(CONTROL, view === mode && "bg-primary text-primary-foreground hover:bg-primary/90")}>{t(`calendar.${mode.toLowerCase()}`)}</button>)}</div>
      <button type="button" disabled={busy} className={CONTROL} onClick={() => setDate(today)}>{t("calendar.today")}</button>
      <button type="button" disabled={busy} className={CONTROL} onClick={() => setDate(shiftPeriod(date, view, -1))} aria-label={t("calendar.previous")}><ChevronLeft className="size-4" /></button>
      <button type="button" disabled={busy} className={CONTROL} onClick={() => setDate(shiftPeriod(date, view, 1))} aria-label={t("calendar.next")}><ChevronRight className="size-4" /></button>
      <button type="button" ref={bookRef} className={CONTROL} onClick={() => book(date)}>{t("calendar.book")}</button>
    </div>
    <div className="p-3 border-b border-border flex flex-wrap items-center gap-3">
      <label className="flex flex-wrap items-center gap-2 text-sm">{t("calendar.date")}<input type="date" min="1900-01-01" max="9998-12-31" value={date} disabled={busy} className={cn(CONTROL, "bg-background max-w-full")} onChange={event => { if (event.target.value && event.target.validity.valid) setDate(event.target.value); }} /></label>
      <label className="min-h-11 flex items-center gap-2 text-sm"><input type="checkbox" checked={cancelled} disabled={busy} onChange={event => setCancelled(event.target.checked)} />{t("calendar.show_cancelled")}</label>
      <button type="button" disabled={busy || loading} className={CONTROL} onClick={() => void load()}>{t("calendar.refresh")}</button>
      <p className="w-full font-medium break-words" data-calendar-period>{periodLabel}</p><p className="hidden md:block text-xs text-muted-foreground">{t("calendar.hint")}</p>
    </div>
    {error ? <div role="alert" className="p-4"><p>{t("common.load_failed")}</p><button className={CONTROL} onClick={() => void load()}>{t("common.retry")}</button></div> : !ready ? <p role="status" className="p-4">{t("feedback.loading_calendar")}</p> : view !== "Day" ? <CalendarOverview view={view} date={date} days={period.days} appointments={data.appointments} onOpen={open} onDay={day => { setDate(day); setView("Day"); }} onBook={book} /> : <CalendarDayBoard data={data} date={date} lanes={lanes} laneLabel={laneLabel} gridRef={gridRef} onOpen={open} onDrag={onDrag} onResize={onResize} busy={busy}
      onKeyboardResize={(a, delta) => { const duration = Math.max(15, Math.min(480, a.estimated_duration_minutes + delta)); void update(a, { estimated_duration_minutes: duration }, t("calendar.duration", { n: fmt.number(duration) })); }}
      drag={drag && { id: drag.appointment.id, active: drag.active, lane: drag.lane, start: drag.start, conflict: drag.conflict }} resize={resize && { id: resize.appointment.id, duration: resize.duration }} />}
    {drag?.active && <div className="fixed z-50 pointer-events-none bg-card border border-border rounded-lg p-2 text-xs" style={{ left: drag.x + 8, top: drag.y + 8 }}>{minToHm(drag.start)} · {laneLabel(lanes.find(l => l.key === drag.lane)!)}{drag.conflict && ` · ${t("appointment.conflict")}`}</div>}
    {collision && <Dialog open onOpenChange={open => { if (!open) setCollision(null); }}><DialogContent hideClose aria-describedby={undefined} className="max-h-[90dvh] overflow-auto" onCloseAutoFocus={event => { event.preventDefault(); returnFocus(); }}>
      <div className="flex justify-between items-center gap-2"><DialogTitle>{t("calendar.collision")}</DialogTitle><button className={CONTROL} onClick={() => setCollision(null)} aria-label={t("common.close")}><X className="size-4" /></button></div>
      <p className="mt-3 text-sm break-words">{t("calendar.collision_detail", { lane: laneLabel(collision.lane), service: collision.conflict.service_type || t("common.general_service"), start: collision.conflict.appointment_time, end: minToHm(hmToMin(collision.conflict.appointment_time) + collision.conflict.estimated_duration_minutes) })}</p>
      <p className="mt-4 text-sm font-semibold">{t("calendar.suggestions")}</p>
      <div className="mt-2 space-y-2">{collision.suggestions.map(start => <button key={start} className={cn(CONTROL, "w-full text-left")} onClick={() => { const current = collision; setCollision(null); moveTo(current.appointment, current.lane, start); }}>{minToHm(start)}</button>)}
        <button className={cn(CONTROL, "w-full text-left")} onClick={() => { const a = collision.appointment; const assignment = assignmentPatch(a, collision.lane, data.mechanics); setCollision(null); if (assignment) void update(a, { appointment_time: "09:00", appointment_date: `${addDays(a.appointment_local_date || a.appointment_date.slice(0, 10), 1)}T09:00:00Z`, ...assignment }, t("calendar.moved_tomorrow")); }}>{t("calendar.tomorrow")}</button>
        <button className={cn(CONTROL, "w-full")} onClick={() => setCollision(null)}>{t("calendar.keep")}</button>
      </div>
    </DialogContent></Dialog>}
    {selected && <CalendarInspector key={selected.id} appointment={selected} onClose={() => setSelected(null)} returnFocus={returnFocus} onChanged={action => { setSelected(null); toast({ title: t(action === "complete" ? "work.completed" : action === "cancel" ? "work.cancelled" : action === "start" ? "work.started" : action === "edit" ? "appointment.updated" : "work.confirmed"), variant: "success" }); void loadRef.current(); }} />}
    {booking && <NewAppointmentModal presetDate={booking} onClose={() => { setBooking(null); returnFocus(); }} onCreated={() => void loadRef.current()} />}
  </div>;
}
