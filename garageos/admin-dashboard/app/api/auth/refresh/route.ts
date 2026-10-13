import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, REFRESH_COOKIE } from "@/lib/api/constants";
import { apiBaseUrl } from "@/lib/api/server";
import { isSameOriginRequest } from "@/lib/api/request-security";

type Tokens = { access_token: string; refresh_token: string };

const accessCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 30,
};

function applyTokens(response: NextResponse, tokens: Tokens) {
  response.cookies.set(AUTH_COOKIE, tokens.access_token, accessCookie);
  response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    ...accessCookie,
    path: "/api/auth",
    maxAge: 60 * 60 * 24 * 7,
  });
}

function clearTokens(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, "", { ...accessCookie, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", {
    ...accessCookie,
    path: "/api/auth",
    maxAge: 0,
  });
}

async function exchangeRefreshToken(): Promise<Tokens | null> {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;
  const response = await fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json()) as Tokens;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "same-origin request required" }, { status: 403 });
  }
  const tokens = await exchangeRefreshToken();
  if (!tokens) {
    const response = NextResponse.json({ error: "session expired" }, { status: 401 });
    clearTokens(response);
    return response;
  }
  const response = NextResponse.json({ ok: true });
  applyTokens(response, tokens);
  return response;
}
