// Node-only BFF transport. Never import this module in a Client Component.
import { isIP } from 'node:net';
import { publicRequestOrigin } from './server-logout';
import { validatedRetryAfter } from './login-feedback';

export class BffUnavailable extends Error {
  constructor(public code: 'TRUSTED_PROXY_UNAVAILABLE' | 'BACKEND_UNAVAILABLE') { super('Backend request unavailable'); }
}

export function canonicalClientIpHeaders(request: Request, environment = {
  nodeEnv: process.env.NODE_ENV, trustCaddyIp: process.env.GARAGEOS_TRUST_CADDY_IP,
}): Record<string, string> {
  if (environment.nodeEnv !== 'production' || environment.trustCaddyIp !== 'true') return {};
  // Opt-in is safe only when dashboard ports are private and Caddy replaces
  // X-Real-IP from its socket peer. Never derive an IP from client-supplied XFF.
  const value = request.headers.get('x-real-ip');
  if (!request.headers.get('x-forwarded-host') || !request.headers.get('x-forwarded-proto') ||
      publicRequestOrigin(request) === null || !value || !/^[a-f0-9:.]+$/i.test(value) || !isIP(value)) {
    throw new BffUnavailable('TRUSTED_PROXY_UNAVAILABLE');
  }
  const canonical = isIP(value) === 6 ? new URL(`http://[${value}]`).hostname.slice(1, -1) : value;
  return { 'X-Real-IP': canonical };
}

export async function backendRequest(request: Request, url: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.delete('X-Forwarded-For'); headers.delete('Forwarded'); headers.delete('X-Real-IP');
  for (const [name, value] of Object.entries(canonicalClientIpHeaders(request))) headers.set(name, value);
  try {
    return await fetch(url, {
      ...init, headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new BffUnavailable('BACKEND_UNAVAILABLE'); }
}

export function unavailableResponse(error: unknown): Response {
  const code = error instanceof BffUnavailable ? error.code : 'BACKEND_UNAVAILABLE';
  return Response.json({ error: 'Service temporarily unavailable', code }, { status: 503 });
}

export function malformedResponse(): Response {
  return Response.json({ error: 'Could not validate server response', code: 'INVALID_BACKEND_RESPONSE' }, { status: 502 });
}

export async function upstreamFailure(response: Response, credentials = false): Promise<Response> {
  const status = response.status >= 400 ? response.status : 502;
  const body = status === 401 && credentials ? await response.json().catch(() => null) : null;
  const rejectedCredentials = body?.error?.code === 'INVALID_CREDENTIALS' || body?.code === 'INVALID_CREDENTIALS';
  const code = status === 429 ? 'RATE_LIMITED' : status === 401 && credentials && rejectedCredentials ? 'INVALID_CREDENTIALS'
    : status === 401 || status === 403 ? 'ACCESS_UNAVAILABLE'
    : status === 400 || status === 422 ? 'INVALID_LOGIN_INPUT' : 'BACKEND_UNAVAILABLE';
  const retry = validatedRetryAfter(response.headers.get('retry-after'));
  return Response.json({ error: 'Could not complete sign-in', code }, { status, headers: retry ? { 'Retry-After': retry } : {} });
}

export function proxyResponseHeaders(response: Response): Headers {
  const headers = new Headers({ 'Content-Type': response.headers.get('content-type') ?? 'application/json' });
  const retry = validatedRetryAfter(response.headers.get('retry-after'));
  if (retry) headers.set('Retry-After', retry);
  return headers;
}

export function validAccessToken(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length < 4096;
}
