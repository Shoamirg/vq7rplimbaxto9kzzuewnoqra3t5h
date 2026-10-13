/** Reject browser mutations initiated from a different site. Non-browser clients
 * without Fetch Metadata or Origin headers remain supported. */
export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  const requestUrl = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    requestUrl.protocol.slice(0, -1);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() ??
    request.headers.get("host") ??
    requestUrl.host;
  try {
    return new URL(origin).origin === new URL(`${proto}://${host}`).origin;
  } catch {
    return false;
  }
}
