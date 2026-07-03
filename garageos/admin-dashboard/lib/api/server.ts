// Server-side API client. Reads the httpOnly auth cookie and forwards a Bearer
// token to the FastAPI backend. Importing `next/headers` keeps this server-only
// (it throws if pulled into a Client Component).
import { cookies } from "next/headers";

import { AUTH_COOKIE } from "./constants";
import type {
  Appointment,
  AppointmentStats,
  CalendarPayload,
  Customer360,
  CustomerList,
  CurrentUser,
  FleetHealth,
  Passport,
  VehicleHealth,
  VehicleIntelligence,
  VehicleList,
  VehicleTimeline,
} from "./types";

export { AUTH_COOKIE };

export function apiBaseUrl(): string {
  // 127.0.0.1 not localhost: Node may resolve localhost to IPv6 ::1 while the
  // backend binds IPv4 only, causing connection failures in server-side fetch.
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(`${path} responded ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export const getStats = () => apiFetch<AppointmentStats>("/appointments/stats");
export const getTodayAppointments = () => apiFetch<Appointment[]>("/appointments/today");
export const getCurrentUser = () => apiFetch<CurrentUser>("/auth/me");

export const getVehicles = () => apiFetch<VehicleList>("/vehicles");
// Bounded for dashboard responsiveness (fleet health is O(N) over vehicles).
// 120 keeps the sample large enough to be representative of a big fleet while
// staying comfortably under the <1s dashboard budget (~0.7s at this size).
export const getFleetHealth = (limit = 120) => apiFetch<FleetHealth>(`/fleet/health?limit=${limit}`);
export const getVehicleHealth = (id: string) => apiFetch<VehicleHealth>(`/vehicles/${id}/health`);
export const getVehicleTimeline = (id: string) => apiFetch<VehicleTimeline>(`/vehicles/${id}/timeline`);
export const getVehicleIntelligence = (id: string) => apiFetch<VehicleIntelligence>(`/vehicles/${id}/intelligence`);

export const getCalendar = (start: string, end: string) =>
  apiFetch<CalendarPayload>(`/calendar?start=${start}&end=${end}`);

export const getCustomers = (q = "") =>
  apiFetch<CustomerList>(`/customers?q=${encodeURIComponent(q)}`);
export const getCustomer360 = (id: string) => apiFetch<Customer360>(`/customers/${id}`);

/** Public passport fetch — no auth cookie (the document is shareable). Returns
 *  null on 404 so the page can render a clean "not found" instead of throwing. */
export async function getPublicPassport(vehicleId: string): Promise<Passport | null> {
  const res = await fetch(`${apiBaseUrl()}/public/passport/${vehicleId}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(`passport responded ${res.status}`, res.status);
  return (await res.json()) as Passport;
}
