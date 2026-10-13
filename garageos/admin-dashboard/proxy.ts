import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE } from "@/lib/api/constants";

// /passport/* is a shareable, public document — no auth required.
// /mini/* is the customer Mini App: a separate principal with its own customer
// token cookie, so it must bypass the staff auth gate entirely.
// The public marketing site + demo entry. "/" is handled as an exact match below.
const PUBLIC_PATHS = ["/login", "/passport", "/invoice", "/mini", "/demo", "/pricing", "/security", "/docs", "/privacy", "/terms", "/session/refresh"];

function accessTokenNeedsRefresh(token: string): boolean {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return true;
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as {
      exp?: unknown;
    };
    return typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000) + 30;
  } catch {
    // This is only a redirect hint. The backend remains the authority for JWT validation.
    return true;
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const accessToken = req.cookies.get(AUTH_COOKIE)?.value;
  const isAuthed = Boolean(accessToken);
  // "/" is the public landing page (exact match, since every path startsWith "/").
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Unauthenticated visitor to a protected page -> login.
  if (!isAuthed && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthed && !isPublic && accessToken && accessTokenNeedsRefresh(accessToken)) {
    const url = req.nextUrl.clone();
    url.pathname = "/session/refresh";
    url.search = "";
    url.searchParams.set("returnTo", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  // Authenticated visitor to login or root -> dashboard.
  if (isAuthed && (pathname === "/login" || pathname === "/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, the API routes, and static assets.
  matcher: [
    "/((?!api/auth|api/demo|api/proxy|api/mini|healthz|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|brand/|marketing/).*)",
  ],
};
