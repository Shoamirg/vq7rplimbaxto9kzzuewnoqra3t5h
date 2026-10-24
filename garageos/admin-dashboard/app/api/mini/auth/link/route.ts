import { NextResponse } from "next/server";

import { apiBaseUrl } from "@/lib/api/server";
import { CUSTOMER_COOKIE } from "@/lib/mini/constants";
import { backendRequest, upstreamFailure, unavailableResponse, malformedResponse, validAccessToken } from '@/lib/server-bff';
import { logoutRequestAllowed } from '@/lib/server-logout';

// Mini App linking uses the same verified BFF transport and response validation.
// Exchange the signed Telegram identity and phone at the backend, which keeps
// phone linking behind its explicit feature flag. Store the verified token in
// an httpOnly cookie, matching the existing customer sign-in route.
export async function POST(req: Request) {
  if (!logoutRequestAllowed(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const initData: string = typeof body?.init_data === "string" ? body.init_data : "";
  const phone: string = typeof body?.phone === "string" ? body.phone : "";

  const endpoint = "link";
  const payload = { init_data: initData, phone };

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
