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
    throw new ClientApiError(`${path} responded ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}
