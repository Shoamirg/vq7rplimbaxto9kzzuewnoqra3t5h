import { NextResponse } from "next/server";

import { apiBaseUrl } from "@/lib/api/server";
import { CUSTOMER_COOKIE } from "@/lib/mini/constants";
import { backendRequest, upstreamFailure, unavailableResponse, malformedResponse, validAccessToken } from '@/lib/server-bff';
import { logoutRequestAllowed } from '@/lib/server-logout';

// Mini App sign-in (BFF): take Telegram initData from the client, exchange it
// at the backend for a customer token, and store that token in an httpOnly
// cookie so client JS never touches it (XSS-safe). When initData is absent and
// we're in development, fall back to the DEBUG-only dev sign-in so the Mini App
// is usable in a plain browser / Playwright.
export async function POST(req: Request) {
  if (!logoutRequestAllowed(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const initData: string = typeof body?.init_data === "string" ? body.init_data : "";
  const isDev = process.env.NODE_ENV !== "production";

  const endpoint = initData ? "telegram" : isDev ? "dev" : "telegram";
  const payload = initData ? { init_data: initData } : {};

  let res: Response;
  try { res = await backendRequest(req, `${apiBaseUrl()}/customer/auth/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  }); } catch (error) { return unavailableResponse(error); }

  if (!res.ok) {
    return upstreamFailure(res);
  }

  const tokens: unknown = await res.json().catch(() => null);
  if (!tokens || typeof tokens !== 'object' || !('access_token' in tokens) || !validAccessToken(tokens.access_token) || !('customer' in tokens)) return malformedResponse();
  const customer = tokens.customer;
  if (!customer || typeof customer !== 'object' || !('id' in customer) || typeof customer.id !== 'string' || !customer.id ||
      !('full_name' in customer) || typeof customer.full_name !== 'string' ||
      !('service_center_id' in customer) || typeof customer.service_center_id !== 'string') return malformedResponse();
  const response = NextResponse.json({ ok: true, customer: tokens.customer });
  response.cookies.set(CUSTOMER_COOKIE, tokens.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });
  return response;
}
