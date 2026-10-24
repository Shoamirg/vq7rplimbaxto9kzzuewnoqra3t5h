import { cookies } from "next/headers";

import { AUTH_COOKIE } from "@/lib/api/constants";
import { apiBaseUrl } from "@/lib/api/server";
import { backendRequest, unavailableResponse } from "@/lib/server-bff";

// Binary BFF for Telegram media. The generic /api/proxy route reads responses
// as text (which corrupts binary), so photos/voice notes stream through here:
// forward the staff cookie's token to the backend, which resolves the file_id
// to bytes behind the bot token, and stream them back with the right type.
export async function GET(req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  let res: Response;
  try { res = await backendRequest(req, `${apiBaseUrl()}/telegram/media/${encodeURIComponent(fileId)}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  }); } catch (error) { return unavailableResponse(error); }
  if (!res.ok) return new Response(null, { status: res.status });

  const body = await res.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
