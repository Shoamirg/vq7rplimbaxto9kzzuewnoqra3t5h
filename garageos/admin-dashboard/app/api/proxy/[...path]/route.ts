import { cookies } from "next/headers";

import { AUTH_COOKIE } from "@/lib/api/constants";
import { backendRequest, unavailableResponse, proxyResponseHeaders } from '@/lib/server-bff';
import { sameOriginMutationAllowed } from '@/lib/server-logout';

// Same-origin BFF proxy: forwards client requests to the FastAPI backend with
// the httpOnly cookie's token as a Bearer header. Lets Client Components read
// and mutate tenant data without ever seeing the token.
function backendBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
}

async function forward(req: Request, segments: string[], method: string): Promise<Response> {
  if (method !== "GET" && method !== "HEAD" && !sameOriginMutationAllowed(req)) {
    return Response.json({ error: "Origin check failed", code: "CSRF_REJECTED" }, { status: 403 });
  }
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const search = new URL(req.url).search;
  const url = `${backendBase()}/${segments.join("/")}${search}`;
  const hasBody = method !== "GET" && method !== "HEAD";
  const idempotencyKey = req.headers.get("Idempotency-Key");
  try {
    const res = await backendRequest(req, url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey !== null ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    return new Response([204, 205, 304].includes(res.status) ? null : text, {
      status: res.status,
      headers: proxyResponseHeaders(res),
    });
  } catch (error) { return unavailableResponse(error); }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  return forward(req, (await ctx.params).path, "GET");
}
export async function POST(req: Request, ctx: Ctx) {
  return forward(req, (await ctx.params).path, "POST");
}
export async function PATCH(req: Request, ctx: Ctx) {
  return forward(req, (await ctx.params).path, "PATCH");
}

export async function PUT(req: Request, ctx: Ctx) {
  return forward(req, (await ctx.params).path, "PUT");
}

export async function DELETE(req: Request, ctx: Ctx) {
  return forward(req, (await ctx.params).path, "DELETE");
}
