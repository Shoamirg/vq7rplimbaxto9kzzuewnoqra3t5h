import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { AUTH_COOKIE, DEMO_COOKIE, REFRESH_COOKIE } from "@/lib/api/constants";
import { apiBaseUrl } from "@/lib/api/server";
import { isSameOriginRequest } from "@/lib/api/request-security";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "same-origin request required" }, { status: 403 });
  }
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${apiBaseUrl()}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    }).catch(() => null);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { path: "/api/auth", maxAge: 0 });
  return response;
}
