// Client-side fetch through the same-origin proxy (which attaches the token).
// Use from Client Components; server code should use lib/api/server.ts.

export class ClientApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function clientFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
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
