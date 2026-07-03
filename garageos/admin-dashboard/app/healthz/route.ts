import { NextResponse } from "next/server";

// Lightweight liveness probe for uptime monitoring / load balancers.
// No auth, no DB — just confirms the Next server is serving.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", service: "garageos-dashboard" });
}
