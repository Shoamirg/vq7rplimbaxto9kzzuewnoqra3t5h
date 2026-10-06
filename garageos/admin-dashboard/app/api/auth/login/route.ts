import { NextResponse } from "next/server";

import { AUTH_COOKIE, apiBaseUrl } from "@/lib/api/server";

// BFF login: proxy credentials to the backend, then store the access token in
// an httpOnly cookie so it is never exposed to client JS (XSS-safe).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const res = await fetch(`${apiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const tokens = (await res.json()) as { access_token: string };
  const profile = await fetch(`${apiBaseUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store',
  });
  if (!profile.ok) return NextResponse.json({ error: 'Could not validate account access' }, { status: 401 });
  const user = await profile.json() as { platform_permissions?: string[] };
  const response = NextResponse.json({ ok: true, redirectTo: user.platform_permissions?.includes('platform.read') ? '/platform' : '/dashboard' });
  response.cookies.set(AUTH_COOKIE, tokens.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30, // matches backend ACCESS_TOKEN_EXPIRE_MINUTES
  });
  return response;
}
