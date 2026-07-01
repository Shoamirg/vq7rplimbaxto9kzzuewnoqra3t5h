// Types mirroring the GarageOS backend API responses.

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rescheduled";

export interface AppointmentStats {
  today_count: number;
  pending_count: number;
  confirmed_count: number;
  completed_count: number;
  cancelled_count: number;
}

export interface Appointment {
  id: string;
  customer_id: string;
  customer_name: string;
  vehicle_id: string;
  vehicle_summary: string;
  appointment_date: string; // ISO
  appointment_time: string; // HH:MM
  mechanic_name: string | null;
  status: AppointmentStatus;
  maintenance_rule_id: string | null;
  service_type: string | null;
  estimated_duration_minutes: number;
  total_cost: number | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  role: string | null;
  service_center_id: string;
  is_super_admin: boolean;
}
