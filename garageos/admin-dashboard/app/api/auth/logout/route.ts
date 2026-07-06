import { NextResponse } from "next/server";

import { DEMO_COOKIE } from "@/lib/api/constants";
import { AUTH_COOKIE } from "@/lib/api/server";

// POST: explicit sign-out from the UI.
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

// GET: used to break the stale-cookie redirect loop. When a page has a cookie
// that the backend rejects (401), it redirects here; we CLEAR the cookie and
// send the user to a clean /login. Without clearing, middleware would see the
// still-present (invalid) cookie and bounce /login back to /dashboard forever.
export async function GET(req: Request) {
  const response = NextResponse.redirect(new URL("/login", req.url));
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
