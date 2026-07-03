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
  health_score?: number | null;
  health_band?: HealthBand | null;
  billing?: AppointmentBilling | null;
}

export interface AppointmentBilling {
  id: string;
  code: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  total: number;
  balance: number;
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
  id?: string;
  severity?: NotificationSeverity;
  category?: string;
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

// ─── Operations Center ───────────────────────────────────────
export type CaseType = "emergency" | "support" | "towing" | "warranty" | "vip";
export type CaseStatus =
  | "new" | "acknowledged" | "assigned" | "en_route" | "in_progress"
  | "waiting_customer" | "resolved" | "closed";
export type CaseSeverity = "critical" | "high" | "medium" | "low";

export interface CaseListItem {
  id: string;
  code: string;
  case_type: CaseType;
  status: CaseStatus;
  severity: CaseSeverity;
  title: string;
  channel: string | null;
  customer_name: string | null;
  vehicle_label?: string | null;
  assigned_user_id: string | null;
  location_text: string | null;
  sla_response_minutes: number;
  elapsed_seconds: number;
  sla_breached: boolean;
  is_open: boolean;
  created_at: string;
}

export interface CaseDetail extends Omit<CaseListItem, "customer_name" | "vehicle_label"> {
  description: string | null;
  customer_id: string;
  vehicle_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  assigned_mechanic?: string | null;
  vehicle?: { id: string; label: string | null; score: number; band: HealthBand } | null;
  timeline: { title: string; detail: string | null; date: string; severity: CaseSeverity; category: string }[];
}

export interface CaseList {
  items: CaseListItem[];
  active_count: number;
}

export interface CaseMechanic {
  id: string;
  name: string;
}

// ─── Notifications ───────────────────────────────────────────
export type NotificationSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface NotificationItem {
  id: string;
  category: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread_count: number;
}

// ─── Global Search ───────────────────────────────────────────
export interface SearchResults {
  query: string;
  customers: { id: string; name: string; phone: string | null; email: string | null }[];
  vehicles: { id: string; label: string; license_plate: string | null; year: number }[];
  mechanics: { id: string; name: string; role: string }[];
}

// ─── Customer 360 ────────────────────────────────────────────
export interface CustomerListItem {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  vehicle_count: number;
  lifetime_value: number;
  tier: string;
  last_visit: string | null;
}

export interface CustomerList {
  items: CustomerListItem[];
  count: number;
}

export interface Customer360Vehicle {
  id: string;
  label: string;
  brand: string;
  model: string;
  year: number;
  license_plate: string | null;
  current_km: number;
  score: number;
  band: HealthBand;
  passport_code: string;
}

export interface Customer360Appointment {
  id: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  mechanic_name: string | null;
  duration: number;
  vehicle_id: string;
  total_cost: number | null;
}

export interface Customer360 {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  since: string | null;
  has_telegram: boolean;
  loyalty_points: number;
  tier: { label: string; stars: number };
  stats: {
    vehicle_count: number;
    lifetime_value: number;
    health_avg: number;
    health_band: HealthBand;
    outstanding: number;
    emergency_count: number;
    last_visit: string | null;
    next_booking: string | null;
  };
  financial?: CustomerFinancial;
  vehicles: Customer360Vehicle[];
  appointments: Customer360Appointment[];
  timeline: TimelineEvent[];
  ai_summary: string;
}

export interface CommercialHealth {
  score: number;
  stars: number;
  band: string;
  label: string;
  risk: string;
}

export interface CustomerFinancialDoc {
  id: string; code: string; kind: InvoiceKind; status: InvoiceStatus;
  total: number; balance: number; due_date: string | null; created_at: string | null;
}

export interface CustomerFinancial {
  lifetime_spend: number;
  refunds: number;
  outstanding: number;
  overdue_amount: number;
  overdue_count: number;
  avg_days_to_pay: number | null;
  invoice_count: number;
  estimate_count: number;
  open_estimate_count: number;
  payment_count: number;
  preferred_method: PaymentMethodT | null;
  approval_rate: number | null;
  last_payment: { amount: number; method: string; date: string } | null;
  commercial_health: CommercialHealth;
  invoices: CustomerFinancialDoc[];
  estimates: CustomerFinancialDoc[];
  payments: PaymentRow[];
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

// ─── Unified Communications Platform (Inbox) ──────────────────
export type ConvType = "emergency" | "support" | "warranty" | "vip" | "general";
export type ConvStatus =
  | "open" | "waiting_customer" | "waiting_technician" | "waiting_approval" | "snoozed" | "resolved";
export type ConvPriority = "high" | "medium" | "low";
export type Channel = "telegram" | "web" | "phone" | "email" | "sms" | "internal";

export interface InboxItem {
  id: string;
  subject: string | null;
  conv_type: ConvType;
  status: ConvStatus;
  status_label: string;
  priority: ConvPriority;
  last_channel: Channel | null;
  last_message_at: string | null;
  last_activity_at: string | null;
  last_message_preview: string | null;
  last_sender_role: string | null;
  unread_messages: number;
  unread_activity: number;
  ai_summary: string | null;
  is_open: boolean;
  assigned_user_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  case_id: string | null;
  created_at: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  vehicle_label?: string | null;
  assigned_name?: string | null;
  case_code?: string | null;
  sla_elapsed_seconds?: number;
  sla_response_minutes?: number;
  sla_breached?: boolean;
}

export interface InboxCounts {
  needs_reply: number;
  assigned_me: number;
  waiting_customer: number;
  waiting_technician: number;
  waiting_approval: number;
  unread: number;
  resolved: number;
}

export interface InboxResponse {
  items: InboxItem[];
  counts: InboxCounts;
  view: string;
}

export interface ConvAttachment {
  id: string;
  kind: string;
  label: string;
  url: string | null;
  meta: Record<string, unknown> | null;
}

export interface ConvMessage {
  id: string;
  kind: "text" | "note" | "announcement";
  channel: Channel;
  is_internal: boolean;
  author_role: string;
  author_name: string | null;
  body: string | null;
  delivery_status: string;
  mentions: string[];
  created_at: string | null;
  attachments: ConvAttachment[];
}

export interface ConvParticipant {
  id: string;
  role: string;
  display_name: string;
  is_online: boolean;
  is_typing: boolean;
  is_following: boolean;
  active_channel: string | null;
}

export interface LinkedCard {
  kind: "case" | "vehicle" | "customer" | "passport";
  title: string;
  subtitle: string;
  link: string;
  score?: number;
  band?: HealthBand;
  phone?: string;
}

export interface ActivityItem {
  type: "event" | "message";
  title: string;
  detail: string | null;
  date: string | null;
  severity: string;
  category?: string;
  author_role?: string;
  channel?: string;
}

export interface ThreadDetail extends InboxItem {
  messages: ConvMessage[];
  participants: ConvParticipant[];
  activity: ActivityItem[];
  linked: LinkedCard[];
  pinned_notes: string[];
  is_following: boolean;
  followers: number;
}

export interface AppointmentListResponse {
  items: Appointment[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ─── Commercial Operations (Billing) ──────────────────────────
export type InvoiceKind = "estimate" | "invoice";
export type InvoiceStatus =
  | "draft" | "sent" | "viewed" | "approved" | "rejected" | "changes_requested" | "expired"
  | "issued" | "partial" | "paid" | "overdue" | "void" | "refunded";
export type LineKind = "part" | "labor" | "fee" | "discount";
export type PaymentMethodT = "cash" | "card" | "bank_transfer" | "online";
export type PaymentKindT = "payment" | "refund" | "deposit";
export type PaymentSourceT = "manual" | "terminal" | "telegram" | "stripe" | "bank" | "cash";

export interface InvoiceListItem {
  id: string;
  code: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  currency: string;
  tax_rate: number;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  balance: number;
  notes: string | null;
  customer_id: string;
  vehicle_id: string | null;
  appointment_id: string | null;
  case_id: string | null;
  source_estimate_id: string | null;
  issued_at: string | null;
  due_date: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string | null;
  is_overdue: boolean;
  customer_name?: string | null;
  vehicle_label?: string | null;
}

export interface InvoiceLineItemRow {
  id: string;
  kind: LineKind;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  taxable: boolean;
}

export interface PaymentRow {
  id: string;
  kind: PaymentKindT;
  method: PaymentMethodT;
  source: PaymentSourceT;
  amount: number;
  reference: string | null;
  note: string | null;
  received_at: string | null;
}

export interface InvoiceDoc extends InvoiceListItem {
  customer?: { id: string; name: string; phone: string | null; email: string | null } | null;
  line_items: InvoiceLineItemRow[];
  payments: PaymentRow[];
  timeline: { title: string; detail: string | null; date: string; severity: string }[];
}

export interface BillingCounts {
  invoices: number; estimates: number; overdue: number;
  awaiting: number; drafts: number; payments: number; recurring: number;
}

export interface BillingKpis {
  outstanding: number; overdue: number; paid_this_month: number;
}

export interface BillingResponse {
  items: InvoiceListItem[];
  counts: BillingCounts;
  kpis: BillingKpis;
  view: string;
}

// ─── Reports & Analytics ──────────────────────────────────────
export interface ReportDelta { pct: number | null; dir: "up" | "down" | "flat"; raw?: number; }
export interface ReportKpi {
  key: string;
  label: string;
  value: number | string;
  format: "money" | "pct" | "int" | "days" | "text";
  drill: string;
  delta: ReportDelta | null;
  series: number[] | null;
  tone: "danger" | "success" | "warning" | null;
}
export interface ReportInsight { tone: string; label: string; text: string; drill?: string; }
export interface ReportQuestion { q: string; drill: string; }
export interface ReportGroup { title: string; kpis: ReportKpi[]; }
export interface ReportSection {
  title: string;
  kind: "area" | "donut" | "funnel" | "bars";
  drill: string;
  span: number;
  data: any;
}
export interface ReportReconciliation {
  ledger_entries: number;
  checks: { label: string; ok: boolean }[];
  status: string;
  debit: number;
  credit: number;
  outstanding: number;
}
export interface ReportResponse {
  report: string;
  title: string;
  period: { key: string; start: string; end: string };
  questions: ReportQuestion[];
  insights: ReportInsight[];
  groups: ReportGroup[];
  sections: ReportSection[];
  reconciliation: ReportReconciliation | null;
}

// ─── Vehicle Intelligence Center ────────────────────────────────────────────
export interface VehicleIntelligence {
  identity: {
    id: string; brand: string; model: string; year: number | null;
    plate: string | null; vin: string | null; mileage: number | null;
    color: string | null; engine: string | null; transmission: string | null;
    owner_name: string | null; band: string;
  };
  health: {
    overall_score: number; band: string; urgent_count: number; due_soon_count: number;
    subsystems: { name: string; score: number }[];
  };
  passport: {
    code: string; tier: string | null; compliance: number;
    vitals: { services_completed: number; overdue_items: number; total_spent: number; ownership_years: number; last_service: string | null };
    highlights: { label: string; ok: boolean }[];
  };
  commercial: {
    score: number; stars: number; band: string; label: string;
    outstanding: number; lifetime_value: number; avg_days_to_pay: number | null;
    preferred_method: string | null; spend_tier: string | null;
  } | null;
  predictions: { tone: string; icon: string; title: string; detail: string }[];
  maintenance: { service_type: string; status: string | null; priority: string | null; remaining_days: number | null; remaining_km: number | null }[];
  timeline: { type: string; title: string; date: string; detail?: string | null; cost?: number | null; km?: number | null; severity?: string }[];
  owner_context: { id: string | null; name: string | null; vehicle_count: number; spend_tier: string | null } | null;
}
