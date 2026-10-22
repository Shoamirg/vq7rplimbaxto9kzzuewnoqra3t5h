"use client";

import type { PointerEvent } from "react";
import { cn } from "@garageos/design-system";
import { useI18n } from "@/lib/i18n/context";
import type { Appointment, CalendarPayload } from "@/lib/api/types";
import { appointmentLane, editable, hmToMin, minToHm, listOnlyAppointments, START_MIN, END_MIN, type Lane } from "./calendar-model";
import { AppointmentSummary } from "./calendar-overview";

export const ROW_H = 96;
export const SLOT_MIN = 30;
export const LANE_W = 224;
export const GUTTER_W = 64;
const ROWS = (END_MIN - START_MIN) / SLOT_MIN;
export const BOARD_H = ROWS * ROW_H;
export const STATUS_STYLE: Record<string, string> = {
  pending: "border-l-amber-500", confirmed: "border-l-primary-500", in_progress: "border-l-primary",
  completed: "border-l-emerald-500", cancelled: "border-l-red-500", rescheduled: "border-l-muted-foreground",
};

export function CalendarDayBoard({ data, date, lanes, laneLabel, gridRef, onOpen, onDrag, onResize, onKeyboardResize, busy, drag, resize }: {
  data: CalendarPayload; date: string; lanes: Lane[]; laneLabel: (lane: Lane) => string;
  gridRef: React.RefObject<HTMLDivElement | null>; onOpen: (a: Appointment) => void;
  onDrag: (event: PointerEvent, a: Appointment) => void; onResize: (event: PointerEvent, a: Appointment) => void;
  onKeyboardResize: (a: Appointment, delta: number) => void; busy: boolean;
  drag: { id: string; active: boolean; lane: string; start: number; conflict: Appointment | null } | null;
  resize: { id: string; duration: number } | null;
}) {
  const { t, fmt } = useI18n();
  const dayAppointments = data.appointments.filter(a => (a.appointment_local_date || a.appointment_date.slice(0, 10)) === date);
  const listed = listOnlyAppointments(dayAppointments, data.mechanics);
  const outside = dayAppointments.filter(a => listed.has(a.id));
  const now = new Date();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const showNow = now.toISOString().slice(0, 10) === date && nowMin >= START_MIN && nowMin < END_MIN;
  return <div className="flex-1 min-w-0 overflow-auto" data-calendar-board>
    {outside.length > 0 && <section className="p-3 border-b border-border space-y-2" aria-label={t("calendar.additional")}>
      <h2 className="text-sm font-semibold">{t("calendar.additional")}</h2>
      <p className="text-xs text-muted-foreground">{t("calendar.list_reason")}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{outside.map(a => <AppointmentSummary key={a.id} appointment={a} onOpen={() => onOpen(a)} />)}</div>
    </section>}
    <div className="min-w-max">
      <div className="flex sticky top-0 z-10 bg-background border-b border-border">
        <div className="w-16 shrink-0" />
        {lanes.map(lane => {
          const minutes = dayAppointments.filter(a => appointmentLane(a, data.mechanics) === lane.key && a.status !== "cancelled").reduce((sum, a) => sum + a.estimated_duration_minutes, 0);
          return <div key={lane.key} data-calendar-lane={lane.key} className="w-56 shrink-0 border-r border-border p-3 text-sm">
            <h2 className="font-semibold break-words">{laneLabel(lane)}</h2>
            <p className="text-xs text-muted-foreground mt-1">{t("calendar.scheduled_minutes", { n: fmt.number(minutes) })}</p>
          </div>;
        })}
      </div>
      <div ref={gridRef} className="flex">
        <div className="w-16 shrink-0 relative border-r border-border" style={{ height: BOARD_H }}>
          {Array.from({ length: ROWS + 1 }, (_, index) => <span key={index} className="absolute right-2 text-xs text-muted-foreground" style={{ top: Math.max(0, index * ROW_H - 8) }}>{minToHm(START_MIN + index * SLOT_MIN)}</span>)}
        </div>
        {lanes.map(lane => {
          const appointments = dayAppointments.filter(a => appointmentLane(a, data.mechanics) === lane.key && !listed.has(a.id));
          const target = drag?.active && drag.lane === lane.key;
          return <div key={lane.key} data-calendar-lane-grid={lane.key} className={cn("w-56 shrink-0 relative border-r border-border", target && "bg-primary/5")} style={{ height: BOARD_H }}>
            {Array.from({ length: ROWS }, (_, index) => <div key={index} className="absolute left-0 right-0 border-b border-border/50" style={{ top: (index + 1) * ROW_H }} />)}
            {appointments.length === 0 && <p className="absolute left-3 right-3 top-5 text-xs text-muted-foreground">{t("calendar.available_hint")}</p>}
            {showNow && <div aria-hidden className="absolute left-0 right-0 border-t border-red-500 pointer-events-none" style={{ top: (nowMin - START_MIN) / SLOT_MIN * ROW_H }} />}
            {target && <div aria-hidden className={cn("absolute left-0 right-0 border-t-2 z-20 pointer-events-none", drag?.conflict ? "border-red-500" : "border-primary")} style={{ top: (drag!.start - START_MIN) / SLOT_MIN * ROW_H }} />}
            {appointments.map(a => {
              const duration = resize?.id === a.id ? resize.duration : a.estimated_duration_minutes;
              const height = Math.max(44, duration / SLOT_MIN * ROW_H - 4);
              const label = `${a.appointment_time} · ${a.customer_name} · ${a.vehicle_summary} · ${a.service_type || t("common.general_service")} · ${t(`status.${a.status}`)}`;
              return <div key={a.id} className={cn("absolute left-1 right-1 rounded-lg border border-l-4 bg-card", STATUS_STYLE[a.status], drag?.active && drag.id === a.id && "opacity-40")} style={{ top: (hmToMin(a.appointment_time) - START_MIN) / SLOT_MIN * ROW_H, height }}>
                <button type="button" data-testid={`calendar-appointment-${a.id}`} aria-label={label} disabled={busy}
                  onPointerDown={event => onDrag(event, a)} onClick={() => onOpen(a)}
                  className={cn("absolute inset-0 w-full rounded-lg p-2 text-left overflow-hidden focus-visible:ring-2 focus-visible:ring-primary", editable(a) && "cursor-grab active:cursor-grabbing touch-none")}>
                  <span className="block text-xs font-semibold truncate pr-10">{a.service_type || t("common.general_service")}</span>
                  {height >= 70 && <><span className="block text-xs truncate">{a.vehicle_summary}</span><span className="block text-xs truncate">{a.customer_name}</span></>}
                  {height >= 100 && <span className="block text-xs text-muted-foreground">{a.appointment_time} · {t("appointment.minutes", { n: fmt.number(duration) })}</span>}
                  <span className="sr-only">{t(`status.${a.status}`)}</span>
                </button>
                {editable(a) && <button type="button" disabled={busy} aria-label={`${t("calendar.resize")}: ${a.customer_name}`} data-calendar-resize={a.id}
                  onPointerDown={event => { event.stopPropagation(); onResize(event, a); }} onClick={event => event.stopPropagation()}
                  onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); onKeyboardResize(a, event.key === "ArrowUp" ? -15 : 15); } }}
                  className="absolute bottom-0 right-0 min-h-11 min-w-11 rounded-lg cursor-ns-resize touch-none text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
                  <span aria-hidden>↕</span>
                </button>}
              </div>;
            })}
          </div>;
        })}
      </div>
    </div>
  </div>;
}
