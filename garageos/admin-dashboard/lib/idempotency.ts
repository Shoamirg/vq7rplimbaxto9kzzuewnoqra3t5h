"use client";

export type PendingIdempotencyKey = { key: string; storageKey: string };
export type PendingPaymentIntent = { amount: number; method: string; key: string; storageKey: string };

/** Reuse the same request key after a page reload when a write's outcome is unknown. */
export async function pendingIdempotencyKey(
  scope: string,
  fingerprint: unknown,
): Promise<PendingIdempotencyKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(fingerprint)),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const storageKey = `garageos:idempotency:${scope}:${hash}`;
  const saved = window.sessionStorage.getItem(storageKey);
  if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return { key: saved, storageKey };
  const key = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, key);
  return { key, storageKey };
}

export function clearPendingIdempotencyKey(storageKey: string): void {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // The saved key remains safe to replay if browser cleanup is blocked.
  }
}

function pendingPaymentStorageKey(invoiceId: string): string {
  return `garageos:pending-payment:${invoiceId}`;
}

export function readPendingPaymentIntent(invoiceId: string): PendingPaymentIntent | null {
  const raw = window.sessionStorage.getItem(pendingPaymentStorageKey(invoiceId));
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Invalid saved payment request");
  const candidate = value as Partial<PendingPaymentIntent>;
  if (typeof candidate.amount !== "number" || !Number.isFinite(candidate.amount) || candidate.amount <= 0
    || typeof candidate.method !== "string" || !["cash", "card", "bank_transfer", "online"].includes(candidate.method)
    || typeof candidate.key !== "string" || !/^[0-9a-f-]{36}$/i.test(candidate.key)
    || typeof candidate.storageKey !== "string" || !/^garageos:idempotency:invoice-payment:[0-9a-f]{64}$/.test(candidate.storageKey)) {
    throw new Error("Invalid saved payment request");
  }
  return { amount: candidate.amount, method: candidate.method, key: candidate.key, storageKey: candidate.storageKey };
}

export function savePendingPaymentIntent(invoiceId: string, intent: PendingPaymentIntent): void {
  window.sessionStorage.setItem(pendingPaymentStorageKey(invoiceId), JSON.stringify(intent));
}

export function clearPendingPaymentIntent(invoiceId: string): void {
  try {
    window.sessionStorage.removeItem(pendingPaymentStorageKey(invoiceId));
  } catch {
    // Retaining the intent is safer than inviting a second payment.
  }
}
