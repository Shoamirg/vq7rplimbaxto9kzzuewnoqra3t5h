import type { ReactNode } from "react";

// ─── Mechanics ────────────────────────────────────────────────
export interface Mechanic {
  id: string;
  name: string;
  initials: string;
  avatar?: string;
  specialization: string;
  color: string; // hex for appointment card accent
}

// ─── Appointment Status ───────────────────────────────────────
export type AppointmentStatus = "pending" | "confirmed" | "in-progress" | "completed" | "cancelled" | "no-show";

export const STATUS_COLORS: Record<AppointmentStatus, { bg: string; text: string; border: string; dot: string }> = {
  pending:    { bg: "bg-warning/10",  text: "text-warning",       border: "border-warning/30",  dot: "bg-warning" },
  confirmed:  { bg: "bg-blue-100 dark:bg-blue-900/20", text: "text-blue-600 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800", dot: "bg-blue-500" },
  "in-progress": { bg: "bg-primary/10", text: "text-primary",    border: "border-primary/30",  dot: "bg-primary" },
  completed:  { bg: "bg-success/10",  text: "text-success",      border: "border-success/30",  dot: "bg-success" },
  cancelled:  { bg: "bg-danger/10",   text: "text-danger",       border: "border-danger/30",   dot: "bg-danger" },
  "no-show":  { bg: "bg-orange-100 dark:bg-orange-900/20", text: "text-orange-600 dark:text-orange-400", border: "border-orange-200 dark:border-orange-800", dot: "bg-orange-500" },
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  "in-progress": "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  "no-show": "No Show",
};

// ─── Appointment ──────────────────────────────────────────────
export interface Appointment {
  id: string;
  customerName: string;
  vehicleName: string;
  licensePlate: string;
  service: string;
  status: AppointmentStatus;
  mechanicId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm (24h)
  durationMinutes: number;
  notes?: string;
  bay?: number;
}

// ─── View Type ────────────────────────────────────────────────
export type CalendarView = "day" | "week" | "month";

// ─── Time Slot ────────────────────────────────────────────────
export interface TimeSlot {
  hour: number; // 0-23
  minute: number; // 0 or 30
  label: string; // "08:00"
}

// ─── Drag State ───────────────────────────────────────────────
export interface DragState {
  appointmentId: string | null;
  startMechanicId: string | null;
  startTime: string | null;
  currentMechanicId: string | null;
  currentTime: string | null;
  isDragging: boolean;
  conflicts: string[]; // appointment IDs that conflict
}

// ─── Conflict ─────────────────────────────────────────────────
export interface ConflictInfo {
  appointmentId: string;
  conflictingWith: string;
  reason: string;
  suggestedSlot?: { mechanicId: string; startTime: string };
}

// ─── Booking Form ─────────────────────────────────────────────
export interface BookingFormData {
  customerName: string;
  vehicleName: string;
  licensePlate: string;
  service: string;
  mechanicId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  notes: string;
}

// ─── Filter State ─────────────────────────────────────────────
export interface FilterState {
  mechanicId: string | null;
  status: AppointmentStatus | null;
  serviceType: string | null;
}
