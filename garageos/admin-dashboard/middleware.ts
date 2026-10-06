import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE } from "@/lib/api/constants";

// /passport/* is a shareable, public document — no auth required.
// /mini/* is the customer Mini App: a separate principal with its own customer
// token cookie, so it must bypass the staff auth gate entirely.
// The public marketing site + demo entry. "/" is handled as an exact match below.
const PUBLIC_PATHS = ["/login", "/passport", "/invoice", "/mini", "/demo", "/pricing", "/security", "/docs", "/privacy", "/terms"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthed = Boolean(req.cookies.get(AUTH_COOKIE)?.value);
  // "/" is the public landing page (exact match, since every path startsWith "/").
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Unauthenticated visitor to a protected page -> login.
  if (!isAuthed && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Root/current login returns use the server-verified app landing.
  // A server-rejected stale cookie must reach login instead of looping back.
  if (isAuthed && (pathname === "/" || (pathname === "/login" && !req.nextUrl.searchParams.has("reauth")))) {
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
