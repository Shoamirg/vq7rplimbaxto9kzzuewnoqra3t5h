// Server-side API client. Reads the httpOnly auth cookie and forwards a Bearer
// token to the FastAPI backend. Importing `next/headers` keeps this server-only
// (it throws if pulled into a Client Component).
import { cookies } from "next/headers";

import { AUTH_COOKIE } from "./constants";
import type { Appointment, AppointmentStats, CurrentUser } from "./types";

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
