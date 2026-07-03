import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE } from "@/lib/api/constants";

// /passport/* is a shareable, public document — no auth required.
// /mini/* is the customer Mini App: a separate principal with its own customer
// token cookie, so it must bypass the staff auth gate entirely.
const PUBLIC_PATHS = ["/login", "/passport", "/mini"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthed = Boolean(req.cookies.get(AUTH_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Unauthenticated visitor to a protected page -> login.
  if (!isAuthed && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
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
    "/((?!api/auth|api/proxy|api/mini|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|brand/).*)",
  ],
};
