// Client-side Mini App data access. Ensures a customer session exists (via the
// BFF auth route), then talks to the customer API through the same-origin proxy.
"use client";

import { telegram } from "@/lib/mini/telegram";
import { confirmMessageActor, synchronizeMessageReset, type MessageActor } from "@/lib/message-intents";
import { MESSAGE_LOGOUT_EVENT, messageSessionEpoch } from "@/lib/message-reset";

export interface CustomerSummary {
  id: string;
  full_name: string;
  service_center_id: string;
}

let sessionPromise: Promise<CustomerSummary> | null = null;
let sessionEpoch: string | null = null;
if (typeof window !== "undefined") window.addEventListener(MESSAGE_LOGOUT_EVENT, () => { sessionPromise = null; sessionEpoch = null; });

async function signIn(): Promise<CustomerSummary> {
  const epoch = messageSessionEpoch();
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
  if (epoch !== messageSessionEpoch()) throw new MiniApiError("Customer verification superseded", 401);
  return data.customer;
}

export function ensureSession(): Promise<CustomerSummary> {
  try { synchronizeMessageReset(window.sessionStorage); }
  catch (error) { return Promise.reject(error); }
  const epoch = messageSessionEpoch();
  if (sessionEpoch !== epoch) { sessionPromise = null; sessionEpoch = epoch; }
  if (!sessionPromise) {
    sessionPromise = signIn().catch((err) => {
      if (sessionEpoch === epoch) sessionPromise = null; // an obsolete failure cannot erase a new session
      throw err;
    });
  }
  return sessionPromise;
}

export function renewMiniSession(): Promise<CustomerSummary> {
  sessionPromise = null;
  return ensureSession();
}

export class MiniApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "MiniApiError";
  }
}

export async function miniFetch<T>(path: string, init?: RequestInit, expectedActor?: MessageActor): Promise<T> {
  // Cookie/reset preparation occurs synchronously, before capturing this read/write.
  const session = ensureSession(), epoch = messageSessionEpoch();
  const actor = await session;
  const current = () => { if (epoch !== messageSessionEpoch()) throw new MiniApiError("Customer session superseded", 401); };
  current();
  const matches = (candidate: CustomerSummary) => !expectedActor || (expectedActor.kind === "customer"
    && candidate.id === expectedActor.id && candidate.service_center_id === expectedActor.center);
  const observe = (verified: MessageActor) => {
    try { confirmMessageActor(verified, window.sessionStorage); }
    catch { /* Hide changed-identity UI even when browser storage is unavailable. */ }
  };
  if (!matches(actor)) {
    observe({ center: actor.service_center_id, kind: "customer", id: actor.id });
    throw new MiniApiError("Customer identity changed", 401);
  }
  if (expectedActor && init?.method && init.method.toUpperCase() !== "GET") {
    // Check the current HttpOnly session too: cached Telegram identity alone
    // cannot authorize a restored write. Reauthentication never auto-replays it.
    const verified = await fetch("/api/mini/proxy/me", { cache: "no-store" });
    current();
    if (!verified.ok) {
      if (verified.status === 401) sessionPromise = null;
      throw new MiniApiError("Customer access verification failed", verified.status);
    }
    const me = await verified.json() as { id: string; garage: { id: string } };
    current();
    if (me.id !== expectedActor.id || me.garage.id !== expectedActor.center) {
      observe({ center: me.garage.id, kind: "customer", id: me.id });
      throw new MiniApiError("Customer identity changed", 401);
    }
  }
  const run = () => {
    current();
    return fetch(`/api/mini/proxy${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  };

  let res = await run();
  current();
  if (res.status === 401) {
    // Session expired — re-authenticate once and retry.
    sessionPromise = null;
    if (expectedActor) throw new MiniApiError("Customer session expired", 401);
    const renewed = await ensureSession();
    current();
    if (renewed.id !== actor.id || renewed.service_center_id !== actor.service_center_id) {
      throw new MiniApiError("Customer identity changed", 401);
    }
    res = await run();
    current();
  }
  if (!res.ok) {
    throw new MiniApiError(`${path} responded ${res.status}`, res.status);
  }
  const data = await res.json() as T;
  current();
  return data;
}
