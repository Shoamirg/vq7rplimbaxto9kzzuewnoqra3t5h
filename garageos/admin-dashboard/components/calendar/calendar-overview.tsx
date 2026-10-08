"use client";

import { cn } from "@garageos/design-system";
import { useI18n } from "@/lib/i18n/context";
import type { Appointment } from "@/lib/api/types";
import type { CalendarView } from "./calendar-model";

export function AppointmentSummary({ appointment, onOpen }: { appointment: Appointment; onOpen: () => void }) {
  const { t, fmt } = useI18n();
  return <button type="button" data-testid={`calendar-appointment-${appointment.id}`} onClick={onOpen}
    className="min-h-11 w-full rounded-lg border border-border bg-card p-2 text-left text-xs hover:border-primary focus-visible:ring-2 focus-visible:ring-primary">
    <span className="block font-semibold break-words">{appointment.appointment_time} · {appointment.service_type || t("common.general_service")}</span>
    <span className="block break-words">{appointment.vehicle_summary}</span>
    <span className="block break-words">{appointment.customer_name}</span>
    <span className="block text-muted-foreground break-words">{appointment.mechanic_name || t("work.unassigned")} · {t(`status.${appointment.status}`)}</span>
    <span className="block text-muted-foreground">{t("appointment.minutes", { n: fmt.number(appointment.estimated_duration_minutes) })}</span>
  </button>;
}

export function CalendarOverview({ view, date, days, appointments, onOpen, onDay, onBook }: {
  view: CalendarView; date: string; days: string[]; appointments: Appointment[];
  onOpen: (a: Appointment) => void; onDay: (date: string) => void; onBook: (date: string) => void;
}) {
  const { t, fmt } = useI18n();
  return <div className="flex-1 min-w-0 overflow-auto p-3" data-calendar-overview={view}>
    <div className={cn("grid gap-2", view === "Month" ? "grid-cols-7 min-w-[840px]" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-7")}>
      {days.map(day => {
        const rows = appointments.filter(a => a.appointment_date.slice(0, 10) === day);
        const label = fmt.date(day, { weekday: "short", day: "numeric", month: "short" });
        const shown = view === "Month" ? rows.slice(0, 3) : rows;
        return <section key={day} data-calendar-day={day} aria-label={label}
          className={cn("min-w-0 rounded-xl border border-border p-2 space-y-2", day === date && "border-primary", view === "Month" && day.slice(0, 7) !== date.slice(0, 7) && "bg-muted/40")}>
          <button type="button" onClick={() => onDay(day)} className="min-h-11 w-full text-left text-sm font-semibold rounded-lg hover:bg-muted" aria-label={t("calendar.open_day", { date: label })}>{label}</button>
          {shown.map(a => <AppointmentSummary key={a.id} appointment={a} onOpen={() => onOpen(a)} />)}
          {rows.length === 0 && <p className="text-xs text-muted-foreground">{t("calendar.empty_day")}</p>}
          {shown.length < rows.length && <button type="button" className="min-h-11 w-full text-left text-xs text-primary rounded-lg hover:bg-muted" onClick={() => onDay(day)}>{t("calendar.more", { n: fmt.number(rows.length) })}</button>}
          <button type="button" onClick={() => onBook(day)} aria-label={t("calendar.book_day", { date: label })} className="min-h-11 w-full rounded-lg border border-border text-xs text-primary hover:bg-muted">{t("calendar.book")}</button>
        </section>;
      })}
    </div>
  </div>;
}
