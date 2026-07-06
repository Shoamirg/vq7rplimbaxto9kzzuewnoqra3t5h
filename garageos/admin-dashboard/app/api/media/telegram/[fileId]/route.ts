import { cookies } from "next/headers";

import { AUTH_COOKIE } from "@/lib/api/constants";

// Binary BFF for Telegram media. The generic /api/proxy route reads responses
// as text (which corrupts binary), so photos/voice notes stream through here:
// forward the staff cookie's token to the backend, which resolves the file_id
// to bytes behind the bot token, and stream them back with the right type.
function backendBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
}

export async function GET(_req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const res = await fetch(`${backendBase()}/telegram/media/${encodeURIComponent(fileId)}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  if (!res.ok) return new Response(null, { status: res.status });

  const body = await res.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
