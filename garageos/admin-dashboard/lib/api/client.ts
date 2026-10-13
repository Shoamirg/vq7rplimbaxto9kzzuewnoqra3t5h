// Client-side fetch through the same-origin proxy (which attaches the token).
// Use from Client Components; server code should use lib/api/server.ts.

export class ClientApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ClientApiError";
  }
}

let refreshPromise: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    const refresh = async () => {
      const res = await fetch("/api/auth/refresh", { method: "POST" });
      return res.ok;
    };
    const locks = typeof navigator !== "undefined"
      ? (navigator as unknown as {
          locks?: { request<T>(name: string, callback: () => T | PromiseLike<T>): Promise<T> };
        }).locks
      : undefined;
    const pending: Promise<boolean> = locks
      ? locks.request<boolean>("garageos-staff-refresh", refresh)
      : refresh();
    const tracked = pending.catch(() => false).finally(() => {
      refreshPromise = null;
    });
    refreshPromise = tracked;
    return tracked;
  }
  return refreshPromise;
}

export async function clientFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const run = () =>
    fetch(`/api/proxy${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  let res = await run();
  if (res.status === 401) {
    if (await refreshSession()) {
      // A 401 happens before protected endpoints mutate data, so retrying once is safe.
      res = await run();
    }
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("garageos:auth-expired"));
    }
  }
  if (!res.ok) {
    // A write blocked by the read-only demo guard — surface it as a friendly toast
    // (the DemoBanner listens) instead of a silent failure.
    if (res.status === 403 && typeof window !== "undefined") {
      const body = await res.clone().json().catch(() => null);
      if (body?.error?.code === "DEMO_READ_ONLY") {
        window.dispatchEvent(new CustomEvent("garageos:demo-blocked"));
      }
    }
    throw new ClientApiError(`${path} responded ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}
