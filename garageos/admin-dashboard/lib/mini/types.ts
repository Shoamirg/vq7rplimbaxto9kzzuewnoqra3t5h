// Customer-facing DTOs, mirroring backend app/schemas/customer_portal.py.

export interface GarageIdentity {
  id: string;
  name: string;
  tagline?: string | null;
  phone?: string | null;
}

export interface MeResponse {
  id: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  loyalty_points: number;
  member_since?: string | null;
  vehicle_count: number;
  garage: GarageIdentity;
}

export interface ActivityItem {
  title: string;
  detail?: string | null;
  category?: string | null;
  severity: string;
  date?: string | null;
}

export interface HomeAppointment {
  id: string;
  date: string;
  time?: string | null;
  service_type?: string | null;
  status: string;
  vehicle_label?: string | null;
}

export interface HomeInvoice {
  currency: string;
  id: string;
  code: string;
  balance: number;
}

export interface HomeMessage {
  id: string;
  subject?: string | null;
  preview?: string | null;
  last_message_at?: string | null;
  awaiting_you: boolean;
}

export interface HomeVehicle {
  id: string;
  label: string;
  health_score: number;
  band: string;
  passport_tier?: string | null;
}

export interface HomeResponse {
  balance_currency: string;
  balances_by_currency: Record<string, number>;
  greeting: string;
  garage: GarageIdentity;
  sos_available: boolean;
  outstanding_balance: number;
  outstanding_invoice?: HomeInvoice | null;
  next_appointment?: HomeAppointment | null;
  latest_message?: HomeMessage | null;
  primary_vehicle?: HomeVehicle | null;
  activity: ActivityItem[];
}

export interface VehicleCard {
  id: string;
  label: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  plate?: string | null;
  mileage?: number | null;
  health_score: number;
  band: string;
}

export interface VehiclesResponse {
  vehicles: VehicleCard[];
}

export interface BillingDoc {
  currency: string;
  id: string;
  code: string;
  kind: string;
  status: string;
  total: number;
  balance: number;
  due_date?: string | null;
  created_at?: string | null;
}

export interface BillingReceipt {
  currency: string;
  id: string;
  amount: number;
  method?: string | null;
  date?: string | null;
}

export interface BillingResponse {
  balance_currency: string;
  balances_by_currency: Record<string, number>;
  has_balance: boolean;
  balance_due: number;
  primary_invoice?: BillingDoc | null;
  invoices: BillingDoc[];
  estimates: BillingDoc[];
  receipts: BillingReceipt[];
}

export interface ConversationCard {
  id: string;
  subject?: string | null;
  status: string;
  preview?: string | null;
  last_message_at?: string | null;
  awaiting_you: boolean;
}

export interface MessagesResponse {
  conversations: ConversationCard[];
  activity: ActivityItem[];
}

export interface ThreadAttachment {
  id: string;
  kind: string;
  label: string;
  url?: string | null;
}

export interface ThreadMessage {
  id: string;
  from_me: boolean;
  author_name?: string | null;
  body?: string | null;
  created_at?: string | null;
  attachments: ThreadAttachment[];
}

export interface ThreadResponse {
  id: string;
  subject?: string | null;
  status: string;
  messages: ThreadMessage[];
}

export interface PassportResponse {
  code: string;
  issued_at: string;
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year?: number | null;
    license_plate?: string | null;
    current_km?: number | null;
    color?: string | null;
    vin?: string | null;
  };
  owner_name?: string | null;
  health: {
    score: number;
    band: string;
    compliance: number;
    urgent_count: number;
    due_soon_count: number;
  };
  vitals: {
    services_completed: number;
    overdue_items: number;
    total_spent: number;
    total_spent_by_currency?: Record<string, number>;
    ownership_years: number;
    last_service?: string | null;
  };
  upcoming: {
    service_type: string;
    status: string;
    remaining_km?: number | null;
    remaining_days?: number | null;
  }[];
  history: { service_type: string; date: string; km?: number | null; cost?: number | null; currency?: string }[];
  highlights: { label: string; ok: boolean }[];
  garage: { name: string; monogram?: string | null; primary_color?: string | null } & Record<string, unknown>;
}

export interface RoadsideStatusStep {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
}

export interface RoadsideCase {
  id: string;
  code: string;
  status: string;
  title: string;
  severity: string;
  created_at?: string | null;
  vehicle_id?: string | null;
  conversation_id?: string | null;
  steps: RoadsideStatusStep[];
}
