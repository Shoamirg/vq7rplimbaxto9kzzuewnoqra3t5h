import type { Appointment } from "@/lib/api/types";

export type DateFilter = "all" | "today" | "tomorrow" | "week" | "overdue";
export type QueueAction = "confirm" | "start" | "complete" | "cancel";
export type BulkAction = "confirm" | "cancel";

function localISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Preserve the queue's browser-local dates and inclusive API bounds. This is
// a rolling seven-day quick filter, independently of the calendar's week view.
export function dateParams(filter: DateFilter): Record<string, string> {
  const today = new Date();
  if (filter === "overdue") return { overdue: "true" };
  if (filter === "all") return {};
  const end = new Date(today);
  if (filter === "tomorrow") end.setDate(end.getDate() + 1);
  if (filter === "week") end.setDate(end.getDate() + 6);
  return { date_from: localISO(filter === "tomorrow" ? end : today), date_to: localISO(end) };
}

export function eligible(appointment: Appointment, action: QueueAction) {
  if (action === "confirm") return appointment.status === "pending";
  if (action === "cancel") return appointment.status === "pending" || appointment.status === "confirmed";
  if (action === "start") return appointment.status === "confirmed";
  return appointment.status === "in_progress";
}

export function durationLabel(minutes: number, t: (key: string, params?: Record<string, string | number>) => string, number: (n: number) => string) {
  if (!Number.isFinite(minutes) || minutes <= 0) return t("queue.unknown");
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  if (!hours) return t("appointment.minutes", { n: number(minutes) });
  return t(remainder ? "queue.hours_minutes" : "queue.hours", { h: number(hours), m: number(remainder) });
}
