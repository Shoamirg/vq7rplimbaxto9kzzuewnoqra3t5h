import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { apiBaseUrl } from "@/lib/api/server";
import { CUSTOMER_COOKIE, CUSTOMER_REFRESH_COOKIE } from "@/lib/mini/constants";
import { isSameOriginRequest } from "@/lib/api/request-security";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "same-origin request required" }, { status: 403 });
  }
  const refreshToken = (await cookies()).get(CUSTOMER_REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${apiBaseUrl()}/customer/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    }).catch(() => null);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CUSTOMER_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(CUSTOMER_REFRESH_COOKIE, "", { path: "/api/mini/auth", maxAge: 0 });
  return response;
}
