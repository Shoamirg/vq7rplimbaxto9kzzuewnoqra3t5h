import { expect, request, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { CUSTOMER_COOKIE } from "../../lib/mini/constants";

/** Normally issued password credential for the SAME existing Telegram customer.
 * Only the credential changes: production messaging policy must still deny403.
 */
export async function usePasswordCustomer(page: Page, baseURL: string) {
  let profile: { email: string; password: string; customer_id: string; center_id: string };
  let apiURL: string;
  try {
    const fixture = JSON.parse(readFileSync(process.env.GARAGEOS_BROWSER_FIXTURE!, "utf8"));
    const origin = new URL(baseURL), api = new URL(process.env.NEXT_PUBLIC_API_URL!);
    profile = fixture.password_customer;
    if (!fixture.qa_only || fixture.base_origin !== origin.origin || origin.protocol !== "http:"
        || !["localhost", "127.0.0.1"].includes(origin.hostname)
        || api.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(api.hostname)
        || api.pathname !== "/api/v1" || api.username || api.password || api.search || api.hash
        || !profile || profile.customer_id !== fixture.customer_id || profile.center_id !== fixture.service_center_id
        || typeof profile.email !== "string" || typeof profile.password !== "string"
        || profile.password.length < 10 || Buffer.byteLength(profile.password) > 72) throw new Error();
    apiURL = api.origin + api.pathname;
  } catch { throw new Error("Prepare the guarded private same-customer password fixture before this gate"); }
  const api = await request.newContext();
  try {
    const login = await api.post(`${apiURL}/customer/auth/login`, { data: { email: profile.email, password: profile.password } });
    expect(login.status()).toBe(200);
    const data = await login.json();
    expect(data.customer.id).toBe(profile.customer_id);
    expect(data.customer.service_center_id).toBe(profile.center_id);
    expect(typeof data.access_token === "string" && data.access_token.length > 20).toBe(true);
    const cookie = (await page.context().cookies(baseURL)).find(item => item.name === CUSTOMER_COOKIE);
    expect(!!cookie && cookie.httpOnly).toBe(true);
    await page.context().addCookies([{ ...cookie!, value: data.access_token }]);
    return { id: profile.customer_id, center: profile.center_id };
  } finally { await api.dispose(); }
}
