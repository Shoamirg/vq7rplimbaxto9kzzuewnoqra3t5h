import { NextResponse } from "next/server";

import { DEMO_COOKIE, AUTH_FINGERPRINT_COOKIE } from "@/lib/api/constants";
import { AUTH_COOKIE, apiBaseUrl, accessFingerprint } from "@/lib/api/server";
import { logoutRequestAllowed, publicRequestOrigin } from '@/lib/server-logout';
import { backendRequest, upstreamFailure, unavailableResponse, malformedResponse, validAccessToken } from '@/lib/server-bff';

// Zero-friction entry into the read-only public demo: log into the demo tenant
// server-side, set the session cookies, and drop the visitor on the dashboard.
// The token carries a `demo` claim so the backend rejects any write.
export async function POST(req: Request) {
  if (!logoutRequestAllowed(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let res: Response;
  try { res = await backendRequest(req, `${apiBaseUrl()}/auth/demo`, { method: "POST" }); }
  catch (error) { return unavailableResponse(error); }
  if (!res.ok) {
    return upstreamFailure(res);
  }

  const tokens: unknown = await res.json().catch(() => null);
  if (!tokens || typeof tokens !== 'object' || !('access_token' in tokens) || !validAccessToken(tokens.access_token)) return malformedResponse();
  const response = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  const opts = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 60 * 30 };
  response.cookies.set(AUTH_COOKIE, tokens.access_token, opts);
  response.cookies.set(DEMO_COOKIE, "1", opts);
  response.cookies.set(AUTH_FINGERPRINT_COOKIE, accessFingerprint(tokens.access_token)!, { ...opts, httpOnly: false });
  return response;
}

// Legacy bookmarks go through the coordinated UI. GET never changes identity.
export async function GET(req: Request) {
  const origin = publicRequestOrigin(req);
  if (!origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.redirect(`${origin}/demo`);
}
