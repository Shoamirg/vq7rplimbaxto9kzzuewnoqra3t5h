import { NextResponse } from "next/server";
import { cookies } from 'next/headers';

import { DEMO_COOKIE, AUTH_FINGERPRINT_COOKIE } from "@/lib/api/constants";
import { AUTH_COOKIE, apiBaseUrl, accessFingerprint } from "@/lib/api/server";
import { logoutRequestAllowed, revokeServerSession, logoutFingerprintAllowed } from '@/lib/server-logout';
import { MESSAGE_RESET_COOKIE } from "@/lib/message-reset";
import { randomUUID } from "node:crypto";

export async function POST(request: Request) {
  if (!logoutRequestAllowed(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const text = await request.text();
  let expected: unknown;
  try {
    const body: unknown = text ? JSON.parse(text) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    expected = (body as Record<string, unknown>).expected_fingerprint;
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  // Optional for legacy explicit API callers. Supported UI always supplies the
  // render-bound proof; mismatch has no backend or cookie/reset side effects.
  if (!logoutFingerprintAllowed(expected, accessFingerprint(token))) {
    return NextResponse.json({ error: 'Session changed', code: 'AUTH_SESSION_CHANGED' }, { status: 409 });
  }
  const revocation = await revokeServerSession(apiBaseUrl(), token);
  // ok acknowledges local cookie cleanup only. Backend revocation is explicit.
  const response = NextResponse.json({ ok: true, revocation });
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(AUTH_FINGERPRINT_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(MESSAGE_RESET_COOKIE, randomUUID(), { path: "/", sameSite: "lax", httpOnly: false });
  return response;
}
