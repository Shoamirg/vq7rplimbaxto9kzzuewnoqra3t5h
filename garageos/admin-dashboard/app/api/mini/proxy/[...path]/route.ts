import { cookies } from "next/headers";

import { apiBaseUrl } from "@/lib/api/server";
import { CUSTOMER_COOKIE } from "@/lib/mini/constants";

// Same-origin BFF proxy for the customer Mini App: forwards to the backend's
// /customer/* API with the httpOnly customer token as a Bearer header. The Mini
// App can read/mutate its own data without ever seeing the token.
async function forward(req: Request, segments: string[], method: string): Promise<Response> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) {
    return new Response(JSON.stringify({ error: "no session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const search = new URL(req.url).search;
  const url = `${apiBaseUrl()}/customer/${segments.join("/")}${search}`;
  const hasBody = method !== "GET" && method !== "HEAD";
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: hasBody ? await req.text() : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  return forward(req, (await ctx.params).path, "GET");
}
export async function POST(req: Request, ctx: Ctx) {
  return forward(req, (await ctx.params).path, "POST");
}
