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

export interface Branding {
  name: string;
  tagline: string | null;
  monogram: string;
  primary_color: string;
  accent_color: string;
  slug: string | null;
}

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  role: string | null;
  service_center_id: string;
  is_super_admin: boolean;
  branding: Branding | null;
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
  color?: string | null;
  transmission?: string | null;
  engine_type?: string | null;
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

export interface CertifiedVehicle {
  vehicle_id: string;
  summary: string;
  score: number;
  band: HealthBand;
  owner_name: string | null;
}

export interface FleetHealth {
  evaluated_count: number;
  average_score: number;
  band: HealthBand;
  distribution: { excellent: number; good: number; fair: number; poor: number };
  needs_attention: { vehicle_id: string; summary: string; score: number; urgent_count: number }[];
  certified: CertifiedVehicle[];
}

// ─── Calendar ────────────────────────────────────────────────
export interface CalendarMechanic {
  id: string;
  name: string;
  role: string | null;
}

export interface CalendarSlot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  mechanic: string | null;
  status: string;
  duration: number;
  appointment_id: string | null;
}

export interface CalendarPayload {
  start: string;
  end: string;
  mechanics: CalendarMechanic[];
  appointments: Appointment[];
  slots: CalendarSlot[];
  blocked: CalendarSlot[];
}

export interface DueServices {
  vehicle_id: string;
  due_count: number;
  services: HealthService[];
}

// ─── Certified Vehicle Passport ──────────────────────────────
export type PassportStatus = "on_track" | "due_soon" | "overdue";

export interface PassportUpcoming {
  service_type: string;
  status: PassportStatus;
  remaining_km: number | null;
  remaining_days: number | null;
}

export interface PassportHistory {
  service_type: string;
  date: string;
  km: number | null;
  cost: number | null;
}

export interface Passport {
  code: string;
  issued_at: string;
  vehicle: VehicleHealthVehicle;
  owner_name: string | null;
  health: {
    score: number;
    band: HealthBand;
    compliance: number;
    urgent_count: number;
    due_soon_count: number;
  };
  vitals: {
    services_completed: number;
    overdue_items: number;
    total_spent: number;
    ownership_years: number;
    last_service: string | null;
  };
  upcoming: PassportUpcoming[];
  history: PassportHistory[];
  highlights: { label: string; ok: boolean }[];
  garage: {
    name: string;
    address: string | null;
    phone: string | null;
    monogram?: string;
    tagline?: string | null;
    primary_color?: string;
    accent_color?: string;
    slug?: string | null;
  };
}
