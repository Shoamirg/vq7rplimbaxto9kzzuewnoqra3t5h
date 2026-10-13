import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { apiBaseUrl } from "@/lib/api/server";
import { isSameOriginRequest } from "@/lib/api/request-security";
import { CUSTOMER_COOKIE, CUSTOMER_REFRESH_COOKIE } from "@/lib/mini/constants";

type Tokens = { access_token: string; refresh_token: string };

function applyTokens(response: NextResponse, tokens: Tokens) {
  response.cookies.set(CUSTOMER_COOKIE, tokens.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });
  response.cookies.set(CUSTOMER_REFRESH_COOKIE, tokens.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/mini/auth",
    maxAge: 60 * 60 * 24 * 7,
  });
}

function clearTokens(response: NextResponse) {
  response.cookies.set(CUSTOMER_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(CUSTOMER_REFRESH_COOKIE, "", { path: "/api/mini/auth", maxAge: 0 });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "same-origin request required" }, { status: 403 });
  }
  const refreshToken = (await cookies()).get(CUSTOMER_REFRESH_COOKIE)?.value;
  const backend = refreshToken
    ? await fetch(`${apiBaseUrl()}/customer/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      }).catch(() => null)
    : null;

  if (!backend?.ok) {
    const response = NextResponse.json({ error: "session expired" }, { status: 401 });
    clearTokens(response);
    return response;
  }

  const tokens = (await backend.json()) as Tokens;
  const response = NextResponse.json({ ok: true });
  applyTokens(response, tokens);
  return response;
}
