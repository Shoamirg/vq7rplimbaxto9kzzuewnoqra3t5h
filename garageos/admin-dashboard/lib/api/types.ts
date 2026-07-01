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

// ─── Vehicle Health ──────────────────────────────────────────
export type HealthBand = "excellent" | "good" | "fair" | "poor";

export interface HealthCategory {
  name: string;
  score: number;
}

export interface HealthService {
  service_type: string;
  description: string | null;
  status: string;
  priority: string;
  is_due: boolean;
  health_score: number;
  remaining_km: number | null;
  remaining_days: number | null;
  interval_km: number | null;
  interval_months: number | null;
  last_performed_km: number | null;
  last_performed_date: string | null;
  estimated_cost: number | null;
}

export interface VehicleHealthVehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  license_plate: string | null;
  vin: string | null;
  current_km: number;
  customer_id: string;
  customer_name: string | null;
}

export interface VehicleHealth {
  vehicle: VehicleHealthVehicle;
  overall_score: number;
  band: HealthBand;
  urgent_count: number;
  due_soon_count: number;
  categories: HealthCategory[];
  services: HealthService[];
  generated_at: string;
}

export interface TimelineEvent {
  type: string;
  title: string;
  date: string;
  detail: string | null;
  km?: number;
  cost?: number | null;
  id: string;
}

export interface VehicleTimeline {
  vehicle_id: string;
  events: TimelineEvent[];
}

export interface VehicleListItem {
  id: string;
  brand: string;
  model: string;
  year: number;
  license_plate: string | null;
  current_km: number;
}

export interface VehicleList {
  items: VehicleListItem[];
  count: number;
}

export interface FleetHealth {
  evaluated_count: number;
  average_score: number;
  band: HealthBand;
  distribution: { excellent: number; good: number; fair: number; poor: number };
  needs_attention: { vehicle_id: string; summary: string; score: number; urgent_count: number }[];
}
