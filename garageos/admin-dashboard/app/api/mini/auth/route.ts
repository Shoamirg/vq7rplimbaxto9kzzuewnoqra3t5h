import { NextResponse } from "next/server";

import { apiBaseUrl } from "@/lib/api/server";
import { CUSTOMER_COOKIE } from "@/lib/mini/constants";

// Mini App sign-in (BFF): take Telegram initData from the client, exchange it
// at the backend for a customer token, and store that token in an httpOnly
// cookie so client JS never touches it (XSS-safe). When initData is absent and
// we're in development, fall back to the DEBUG-only dev sign-in so the Mini App
// is usable in a plain browser / Playwright.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const initData: string = typeof body?.init_data === "string" ? body.init_data : "";
  const isDev = process.env.NODE_ENV !== "production";

  const endpoint = initData ? "telegram" : isDev ? "dev" : "telegram";
  const payload = initData ? { init_data: initData } : {};

  const res = await fetch(`${apiBaseUrl()}/customer/auth/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ error: "sign-in failed", detail }, { status: res.status });
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
