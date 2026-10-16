import { webcrypto } from "node:crypto";
import { expect, test } from "@playwright/test";

import {
  clearPendingIdempotencyKey,
  clearPendingPaymentIntent,
  pendingIdempotencyKey,
  readPendingPaymentIntent,
  savePendingPaymentIntent,
} from "../lib/idempotency";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("booking idempotency key survives page reload and clears after acknowledgement", async () => {
  const storage = new MemoryStorage();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage: storage } });
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  try {
    const request = { vehicle_id: "vehicle-1", date: "2032-10-02", time: "10:00" };
    const first = await pendingIdempotencyKey("mini-booking", request);
    const afterReload = await pendingIdempotencyKey("mini-booking", request);
    expect(afterReload.key).toBe(first.key);
    clearPendingIdempotencyKey(first.storageKey);
    expect((await pendingIdempotencyKey("mini-booking", request)).key).not.toBe(first.key);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});

test("uncertain payment intent is restored with the original key and exact request", () => {
  const storage = new MemoryStorage();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage: storage } });
  try {
    const invoiceId = "invoice-1";
    const intent = {
      amount: 25000,
      method: "cash",
      key: "2cfad090-7cf0-4f65-90ab-395a7414e881",
      storageKey: `garageos:idempotency:invoice-payment:${"a".repeat(64)}`,
    };
    savePendingPaymentIntent(invoiceId, intent);
    expect(readPendingPaymentIntent(invoiceId)).toEqual(intent);
    clearPendingPaymentIntent(invoiceId);
    expect(readPendingPaymentIntent(invoiceId)).toBeNull();
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
