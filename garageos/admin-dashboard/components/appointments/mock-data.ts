import type { Mechanic, Appointment } from "./types";

// ─── Mechanics ────────────────────────────────────────────────
export const mechanics: Mechanic[] = [
  { id: "mech-1", name: "Ali Hassan",   initials: "AH", specialization: "Engine Specialist",     color: "#2563eb" },
  { id: "mech-2", name: "John Cruz",    initials: "JC", specialization: "Transmission & Drivetrain", color: "#10b981" },
  { id: "mech-3", name: "Mike Okafor",  initials: "MO", specialization: "Brakes & Suspension",   color: "#f59e0b" },
  { id: "mech-4", name: "Sarah Lee",    initials: "SL", specialization: "Electrical & Diagnostics", color: "#8b5cf6" },
  { id: "mech-5", name: "David Kim",    initials: "DK", specialization: "AC & Heating",           color: "#ec4899" },
  { id: "mech-6", name: "Elena Rossi",  initials: "ER", specialization: "General Service",         color: "#06b6d4" },
];

// ─── Service Durations ────────────────────────────────────────
export const serviceDurations: Record<string, number> = {
  "Oil Change": 30,
  "Brake Inspection": 45,
  "Tire Rotation": 30,
  "Brake Pad Replacement": 90,
  "Annual Maintenance": 120,
  "AC System Diagnosis": 60,
  "Transmission Fluid": 60,
  "Engine Diagnostic": 45,
  "Battery Replacement": 30,
  "Wheel Alignment": 60,
  "Timing Belt Replacement": 180,
  "Coolant Flush": 45,
  "Spark Plug Replacement": 60,
  "Fuel System Cleaning": 45,
  "Suspension Repair": 120,
};

// ─── Generate Appointments for a Date ─────────────────────────
export function generateAppointments(date: string): Appointment[] {
  const baseDate = date || "2026-07-01";
  const dayOfWeek = new Date(baseDate).getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Weekend has fewer appointments
  const count = isWeekend ? 8 + Math.floor(Math.random() * 5) : 20 + Math.floor(Math.random() * 15);

  const customers = [
    { name: "Robert Chen",     vehicle: "Tesla Model 3",      plate: "TES-1234" },
    { name: "Sarah Williams",  vehicle: "Ford F-150",         plate: "FRD-5678" },
    { name: "Mike Johnson",    vehicle: "Honda Civic",        plate: "HND-9012" },
    { name: "Emily Davis",     vehicle: "BMW X5",             plate: "BMW-3456" },
    { name: "David Thompson",  vehicle: "Toyota RAV4",        plate: "TYT-7890" },
    { name: "Lisa Martinez",   vehicle: "Chevrolet Tahoe",    plate: "CHV-2345" },
    { name: "James Wilson",    vehicle: "Mercedes C300",      plate: "MRC-6789" },
    { name: "Amanda Brown",    vehicle: "Nissan Altima",      plate: "NSS-0123" },
    { name: "Kevin Park",      vehicle: "Hyundai Tucson",     plate: "HYD-4567" },
    { name: "Rachel Garcia",   vehicle: "Subaru Outback",     plate: "SBR-8901" },
    { name: "Tom Anderson",    vehicle: "Dodge Ram 1500",     plate: "DRM-2345" },
    { name: "Jessica Taylor",  vehicle: "Mazda CX-5",         plate: "MZD-6789" },
    { name: "Brian Clark",     vehicle: "Volkswagen Golf",    plate: "VWG-0123" },
    { name: "Natasha Patel",   vehicle: "Audi Q5",            plate: "AUD-4567" },
    { name: "Frank Murphy",    vehicle: "Jeep Wrangler",      plate: "JEP-8901" },
  ];

  const services = Object.entries(serviceDurations);
  const appointments: Appointment[] = [];
  const usedSlots = new Map<string, Set<string>>(); // mechanicId -> Set of time slots

  // Start at 07:00, end at 18:00
  for (let i = 0; i < count; i++) {
    const customer = customers[i % customers.length];
    const [service, duration] = services[i % services.length];
    const mechanic = mechanics[i % mechanics.length];

    // Find available time slot
    const startHour = 7 + Math.floor(Math.random() * 10); // 07:00 - 16:00
    const startMinute = Math.random() > 0.5 ? 0 : 30;
    const timeKey = `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`;

    if (!usedSlots.has(mechanic.id)) {
      usedSlots.set(mechanic.id, new Set());
    }
    usedSlots.get(mechanic.id)!.add(timeKey);

    const statuses: Appointment["status"][] = ["pending", "confirmed", "in-progress", "completed", "cancelled"];
    // Don't make too many completed or cancelled for "today"
    const status = i < 3 ? "in-progress" : i < 12 ? "confirmed" : i < 18 ? "pending" : statuses[Math.floor(Math.random() * statuses.length)];

    appointments.push({
      id: `apt-${baseDate}-${i}`,
      customerName: customer.name,
      vehicleName: customer.vehicle,
      licensePlate: customer.plate,
      service,
      status: status as Appointment["status"],
      mechanicId: mechanic.id,
      date: baseDate,
      startTime: timeKey,
      durationMinutes: duration,
      notes: Math.random() > 0.7 ? "Customer reported unusual noise" : undefined,
      bay: (i % 4) + 1,
    });
  }

  return appointments.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// ─── Helper: Get appointments for a mechanic on a date ────────
export function getMechanicAppointments(
  appointments: Appointment[],
  mechanicId: string
): Appointment[] {
  return appointments.filter((a) => a.mechanicId === mechanicId);
}

// ─── Helper: Calculate workload hours for a mechanic ──────────
export function calculateWorkload(
  appointments: Appointment[],
  mechanicId: string
): number {
  return appointments
    .filter((a) => a.mechanicId === mechanicId && a.status !== "cancelled" && a.status !== "no-show")
    .reduce((total, a) => total + a.durationMinutes, 0) / 60;
}

// ─── Helper: Check if two appointments conflict ───────────────
export function appointmentsConflict(a: Appointment, b: Appointment): boolean {
  if (a.id === b.id || a.mechanicId !== b.mechanicId) return false;
  const aStart = timeToMinutes(a.startTime);
  const aEnd = aStart + a.durationMinutes;
  const bStart = timeToMinutes(b.startTime);
  const bEnd = bStart + b.durationMinutes;
  return aStart < bEnd && bStart < aEnd;
}

// ─── Helper: Time conversion ──────────────────────────────────
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ─── Helper: Generate time slots ──────────────────────────────
export function generateTimeSlots(): { hour: number; minute: number; label: string }[] {
  const slots: { hour: number; minute: number; label: string }[] = [];
  for (let h = 6; h <= 20; h++) {
    for (const m of [0, 30]) {
      slots.push({
        hour: h,
        minute: m,
        label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      });
    }
  }
  return slots;
}
