import { NextResponse } from "next/server";

import { DEMO_COOKIE, REFRESH_COOKIE } from "@/lib/api/constants";
import { AUTH_COOKIE, apiBaseUrl } from "@/lib/api/server";

// Zero-friction entry into the read-only public demo: log into the demo tenant
// server-side, set the session cookies, and drop the visitor on the dashboard.
// The token carries a `demo` claim so the backend rejects any write.
export async function GET(req: Request) {
  // Build the redirect target from the request's real host so cookies land on the
  // same origin the visitor is using. Behind Caddy the public host arrives in
  // X-Forwarded-Host; `new URL(req.url)` would give the internal host instead.
  const proto = req.headers.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const origin = `${proto}://${host}`;

  const res = await fetch(`${apiBaseUrl()}/auth/demo`, { method: "POST" });
  if (!res.ok) {
    // Demo disabled or the demo tenant isn't seeded — fall back to the marketing page.
    return NextResponse.redirect(`${origin}/?demo=unavailable`);
  }

  const tokens = (await res.json()) as { access_token: string; refresh_token: string };
  const response = NextResponse.redirect(`${origin}/dashboard`);
  const secure = process.env.NODE_ENV === "production";
  const opts = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 60 * 30 };
  response.cookies.set(AUTH_COOKIE, tokens.access_token, opts);
  response.cookies.set(DEMO_COOKIE, "1", opts);
  response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    ...opts,
    path: "/api/auth",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
