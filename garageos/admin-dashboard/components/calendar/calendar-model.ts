import type { Appointment, CalendarPayload } from "@/lib/api/types";

export type CalendarView = "Day" | "Week" | "Month";
export const START_MIN = 480;
export const END_MIN = 1080;
export const UNASSIGNED = "unassigned";
export const hmToMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
export const minToHm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => isoDay(new Date(new Date(iso + "T00:00:00Z").getTime() + days * 86_400_000));
const monday = (iso: string) => addDays(iso, -((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7));
export function shiftPeriod(iso: string, view: CalendarView, direction: number) {
  if (view !== "Month") return addDays(iso, direction * (view === "Week" ? 7 : 1));
  const date = new Date(iso + "T00:00:00Z");
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + direction);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  return isoDay(date);
}
export function calendarPeriod(date: string, view: CalendarView) {
  const start = view === "Day" ? date : view === "Week" ? monday(date) : monday(date.slice(0, 7) + "-01");
  const nextMonth = shiftPeriod(date.slice(0, 7) + "-01", "Month", 1);
  const end = view === "Month" ? addDays(monday(addDays(nextMonth, -1)), 7) : addDays(start, view === "Week" ? 7 : 1);
  const days: string[] = [];
  for (let day = start; day < end; day = addDays(day, 1)) days.push(day);
  return { start, end, days };
}

export type Lane = { key: string; name: string; userId: string | null; kind: "account" | "legacy" | "unassigned"; ordinal?: number };
export function appointmentLane(appointment: Appointment, roster: CalendarPayload["mechanics"]) {
  if (appointment.mechanic_user_id && roster.some(m => m.id === appointment.mechanic_user_id)) return `account:${appointment.mechanic_user_id}`;
  if (appointment.mechanic_user_id || appointment.mechanic_name) return `legacy:${appointment.mechanic_user_id || appointment.mechanic_name}`;
  return UNASSIGNED;
}
export function calendarLanes(data: CalendarPayload): Lane[] {
  const lanes: Lane[] = data.mechanics.map((m, i, roster) => ({
    key: `account:${m.id}`, name: m.name, userId: m.id, kind: "account",
    ordinal: roster.filter(other => other.name === m.name).length > 1 ? roster.slice(0, i + 1).filter(other => other.name === m.name).length : undefined,
  }));
  for (const appointment of data.appointments) {
    const key = appointmentLane(appointment, data.mechanics);
    if (key !== UNASSIGNED && !lanes.some(lane => lane.key === key)) lanes.push({ key, name: appointment.mechanic_name || "", userId: appointment.mechanic_user_id || null, kind: "legacy" });
  }
  lanes.push({ key: UNASSIGNED, name: "", userId: null, kind: "unassigned" });
  return lanes;
}
export const editable = (appointment: Appointment) => appointment.status === "pending" || appointment.status === "confirmed";
export const outsideGrid = (appointment: Appointment) => hmToMin(appointment.appointment_time) < START_MIN || hmToMin(appointment.appointment_time) + appointment.estimated_duration_minutes > END_MIN;
export function listOnlyAppointments(appointments: Appointment[], roster: CalendarPayload["mechanics"]) {
  const ids = new Set(appointments.filter(outsideGrid).map(a => a.id));
  const lanes = new Map<string, Appointment[]>();
  for (const appointment of appointments) {
    const key = appointmentLane(appointment, roster);
    const rows = lanes.get(key) || [];
    rows.push(appointment); lanes.set(key, rows);
  }
  for (const rows of lanes.values()) {
    rows.sort((a, b) => hmToMin(a.appointment_time) - hmToMin(b.appointment_time));
    let active: Appointment[] = [];
    for (const row of rows) {
      const start = hmToMin(row.appointment_time);
      active = active.filter(previous => hmToMin(previous.appointment_time) + previous.estimated_duration_minutes > start);
      if (active.length) { ids.add(row.id); active.forEach(previous => ids.add(previous.id)); }
      active.push(row);
    }
  }
  return ids;
}
export function assignmentPatch(appointment: Appointment, target: Lane, roster: CalendarPayload["mechanics"]) {
  if (target.key === appointmentLane(appointment, roster)) return {};
  if (target.kind === "unassigned") return { mechanic_name: "" };
  if (target.kind === "account") return { mechanic_user_id: target.userId };
  return null; // A legacy lane is historical presentation, never a new identity.
}
export function calendarConflict(appointments: Appointment[], lane: Lane, day: string, start: number, duration: number, exclude: string) {
  if (lane.kind === "unassigned" || !lane.name.trim()) return null;
  const normalized = (name: string | null) => (name || "").trim().toLowerCase();
  return appointments.find(a => {
    if (a.id === exclude || a.appointment_date.slice(0, 10) !== day || a.status === "cancelled" || a.status === "completed") return false;
    const matches = lane.userId ? a.mechanic_user_id === lane.userId || !a.mechanic_user_id && normalized(a.mechanic_name) === normalized(lane.name) : normalized(a.mechanic_name) === normalized(lane.name);
    const starts = hmToMin(a.appointment_time);
    return matches && start < starts + a.estimated_duration_minutes && start + duration > starts;
  }) || null;
}
export function recordedPhone(value?: string | null) {
  if (!value || !/^\+?[\d\s().-]+$/.test(value.trim())) return null;
  const digits = value.replace(/[^\d+]/g, "");
  return /^\+?\d{3,15}$/.test(digits) ? `tel:${digits}` : null;
}
export function recordedTelegram(value?: string | null) {
  const username = value?.replace(/^@/, "");
  return username && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? `https://t.me/${username}` : null;
}
