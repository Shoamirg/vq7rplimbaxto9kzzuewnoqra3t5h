export type RevocationOutcome = 'confirmed' | 'unconfirmed' | 'none';

export function logoutFingerprintAllowed(expected: unknown, actual: string | null): boolean {
  return expected === undefined || (typeof expected === 'string' && /^[a-f0-9]{64}$/.test(expected) && expected === actual);
}

export function publicRequestOrigin(request: Request): string | null {
  const host = request.headers.get('x-forwarded-host');
  const proto = request.headers.get('x-forwarded-proto');
  if (host === null && proto === null) return new URL(request.url).origin;
  // Production exposes only Caddy. It preserves Host and replaces both
  // forwarded headers; never accept a forwarded host that disagrees with Host.
  // https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults
  const authority = request.headers.get('host');
  if (!host || !authority || !['http', 'https'].includes(proto ?? '') ||
      !/^[a-z0-9.:[\]-]+$/i.test(host) || host.toLowerCase() !== authority.toLowerCase()) return null;
  try {
    const url = new URL(`${proto}://${host}`);
    return url.host === host.toLowerCase() && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

/** Cookie authentication is never forwarded by a cross-site browser logout. */
export function logoutRequestAllowed(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  const expected = publicRequestOrigin(request);
  return expected !== null && (!origin || origin === expected);
}

export async function revokeServerSession(
  base: string, token: string | undefined, transport: typeof fetch = fetch,
): Promise<RevocationOutcome> {
  if (!token) return 'none';
  try {
    const response = await transport(`${base}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    return response.status === 200 && body?.ok === true ? 'confirmed' : 'unconfirmed';
  } catch { return 'unconfirmed'; }
}
