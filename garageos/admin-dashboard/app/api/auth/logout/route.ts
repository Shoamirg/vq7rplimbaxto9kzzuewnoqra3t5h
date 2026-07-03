import { NextResponse } from "next/server";

import { DEMO_COOKIE } from "@/lib/api/constants";
import { AUTH_COOKIE } from "@/lib/api/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
