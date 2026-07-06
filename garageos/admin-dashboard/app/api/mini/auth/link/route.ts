import { NextResponse } from "next/server";

import { apiBaseUrl } from "@/lib/api/server";
import { CUSTOMER_COOKIE } from "@/lib/mini/constants";

// Link a Telegram account to a customer by phone (BFF). The client sends the
// Telegram initData (identity) + the phone the garage has on file; the backend
// matches the customer, stamps their telegram_id, and returns a customer token
// which we store in the httpOnly cookie — same as the sign-in route.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const initData: string = typeof body?.init_data === "string" ? body.init_data : "";
  const phone: string = typeof body?.phone === "string" ? body.phone : "";

  const res = await fetch(`${apiBaseUrl()}/customer/auth/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ init_data: initData, phone }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ error: "link failed", detail }, { status: res.status });
  }

  const tokens = (await res.json()) as {
    access_token: string;
    customer: { id: string; full_name: string; service_center_id: string };
  };
  const response = NextResponse.json({ ok: true, customer: tokens.customer });
  response.cookies.set(CUSTOMER_COOKIE, tokens.access_token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });
  return response;
}
