// Client-side Mini App data access. Ensures a customer session exists (via the
// BFF auth route), then talks to the customer API through the same-origin proxy.
"use client";

import { telegram } from "@/lib/mini/telegram";

export interface CustomerSummary {
  id: string;
  full_name: string;
  service_center_id: string;
}

let sessionPromise: Promise<CustomerSummary> | null = null;
let refreshPromise: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    const refresh = async () => {
      const res = await fetch("/api/mini/auth/refresh", { method: "POST" });
      return res.ok;
    };
    const locks = typeof navigator !== "undefined"
      ? (navigator as unknown as {
          locks?: { request<T>(name: string, callback: () => T | PromiseLike<T>): Promise<T> };
        }).locks
      : undefined;
    const pending: Promise<boolean> = locks
      ? locks.request<boolean>("garageos-customer-refresh", refresh)
      : refresh();
    const tracked = pending.catch(() => false).finally(() => {
      refreshPromise = null;
    });
    refreshPromise = tracked;
    return tracked;
  }
  return refreshPromise;
}

async function signIn(): Promise<CustomerSummary> {
  const initData = telegram()?.initData ?? "";
  const res = await fetch("/api/mini/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ init_data: initData }),
  });
  if (!res.ok) {
    throw new MiniApiError("Sign-in failed", res.status);
  }
  const data = (await res.json()) as { customer: CustomerSummary };
  return data.customer;
}

export function ensureSession(): Promise<CustomerSummary> {
  if (!sessionPromise) {
    sessionPromise = signIn().catch((err) => {
      sessionPromise = null; // allow retry on failure
      throw err;
    });
  }
  return sessionPromise;
}

export class MiniApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "MiniApiError";
  }
}

export async function miniFetch<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureSession();
  const run = () =>
    fetch(`/api/mini/proxy${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });

  let res = await run();
  if (res.status === 401) {
    // First rotate the refresh token; fall back to Telegram sign-in if needed.
    if (await refreshSession()) {
      res = await run();
    } else {
      sessionPromise = null;
      await ensureSession();
      res = await run();
    }
  }
  if (!res.ok) {
    throw new MiniApiError(`${path} responded ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}
