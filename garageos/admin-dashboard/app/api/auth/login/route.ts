import { NextResponse } from "next/server";

import { AUTH_COOKIE, apiBaseUrl, accessFingerprint } from "@/lib/api/server";
import { DEMO_COOKIE, AUTH_FINGERPRINT_COOKIE } from '@/lib/api/constants';
import { logoutRequestAllowed } from '@/lib/server-logout';
import { backendRequest, upstreamFailure, unavailableResponse, malformedResponse, validAccessToken } from '@/lib/server-bff';

// BFF login: proxy credentials to the backend, then store the access token in
// an httpOnly cookie so it is never exposed to client JS (XSS-safe).
export async function POST(req: Request) {
  if (!logoutRequestAllowed(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (typeof body?.email !== 'string' || !body.email.trim() || typeof body?.password !== 'string' || !body.password) {
    return NextResponse.json({ error: "email and password are required", code: 'INVALID_LOGIN_INPUT' }, { status: 400 });
  }
  let res: Response;
  try { res = await backendRequest(req, `${apiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
  }); } catch (error) { return unavailableResponse(error); }

  if (!res.ok) {
    return upstreamFailure(res, true);
  }

  const tokens: unknown = await res.json().catch(() => null);
  if (!tokens || typeof tokens !== 'object' || !('access_token' in tokens) || !validAccessToken(tokens.access_token)) return malformedResponse();
  let profile: Response;
  try { profile = await backendRequest(req, `${apiBaseUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store',
  }); } catch (error) { return unavailableResponse(error); }
  if (!profile.ok) return upstreamFailure(profile);
  const user: unknown = await profile.json().catch(() => null);
  if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string' || !user.id ||
      'platform_permissions' in user && (!Array.isArray(user.platform_permissions) || !user.platform_permissions.every(value => typeof value === 'string'))) return malformedResponse();
  const permissions = 'platform_permissions' in user ? user.platform_permissions as string[] : [];
  const role = 'role' in user && typeof user.role === 'string' ? user.role : null;
  const redirectTo = permissions.includes('platform.read') ? '/platform' : role === 'mechanic' ? '/mechanic/work' : '/dashboard';
  const response = NextResponse.json({ ok: true, redirectTo });
  response.cookies.set(AUTH_COOKIE, tokens.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30, // matches backend ACCESS_TOKEN_EXPIRE_MINUTES
  });
  response.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(AUTH_FINGERPRINT_COOKIE, accessFingerprint(tokens.access_token)!, {
    httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 30,
  });
  return response;
}
