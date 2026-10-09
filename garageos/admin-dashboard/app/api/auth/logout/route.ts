import { NextResponse } from "next/server";

import { DEMO_COOKIE } from "@/lib/api/constants";
import { AUTH_COOKIE } from "@/lib/api/server";
import { MESSAGE_RESET_COOKIE } from "@/lib/message-reset";
import { randomUUID } from "node:crypto";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(MESSAGE_RESET_COOKIE, randomUUID(), { path: "/", sameSite: "lax", httpOnly: false });
  return response;
}
