import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

/** The helper's token output stays in a private pipe, never a failure message. */
async function issuePrivateSession(token: string, kind: "staff" | "customer") {
  const python = process.env.GARAGEOS_BROWSER_PYTHON;
  const backend = resolve(process.cwd(), "../backend");
  if (!python || !isAbsolute(python) || !existsSync(python)
      || !existsSync(resolve(backend, "tests/support/expiring_session.py"))) {
    throw new Error("Configure the isolated browser Python interpreter; see docs/agents/local-jenkins.md.");
  }
  const output = await new Promise<string>((resolveOutput, reject) => {
    const child = spawn(python, ["-m", "tests.support.expiring_session"], {
      cwd: backend, env: { ...process.env, PYTHONUTF8: "1" }, windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"], timeout: 15_000,
    });
    let data = "";
    const fail = () => reject(new Error("The isolated expiring-session issuer refused or failed."));
    child.on("error", fail); child.stdin.on("error", fail);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { data += chunk; if (data.length > 16384) { child.kill(); fail(); } });
    child.on("close", code => code === 0 ? resolveOutput(data) : fail());
    child.stdin.end(JSON.stringify({ token, kind }));
  });
  try {
    const value = JSON.parse(output) as { token: string; expires: number; actor_id: string; center_id: string };
    if (typeof value.token !== "string" || !value.token || !Number.isSafeInteger(value.expires)
        || typeof value.actor_id !== "string" || typeof value.center_id !== "string") throw new Error();
    return value;
  } catch { throw new Error("Invalid isolated expiring-session receipt."); }
}

export async function expireCurrentSession(page: Page, baseURL: string, kind: "staff" | "customer") {
  const name = kind === "staff" ? "garageos_token" : "garageos_customer_token";
  const mePath = kind === "staff" ? "/api/proxy/auth/me" : "/api/mini/proxy/me";
  const cookies = await page.context().cookies(baseURL), original = cookies.find(cookie => cookie.name === name);
  if (!original) throw new Error("A normally authenticated browser session is required.");
  const reset = cookies.find(cookie => cookie.name === "garageos_message_reset")?.value;
  const short = await issuePrivateSession(original.value, kind);
  // Browser session lifetime deliberately outlives JWT expiry:401 must come
  // from normal API signature/time validation, not cookie deletion.
  await page.context().addCookies([{ ...original, value: short.token, expires: -1 }]);
  const before = Date.now(), valid = await page.request.get(mePath);
  expect(valid.status(), "The genuine signed short session must initially authenticate").toBe(200);
  const me = await valid.json() as { id: string; service_center_id?: string; garage?: { id: string } };
  expect(me.id).toBe(short.actor_id);
  expect(kind === "staff" ? me.service_center_id : me.garage?.id).toBe(short.center_id);
  expect(before).toBeLessThan(short.expires * 1000);
  await expect.poll(async () => ({
    status: (await page.request.get(mePath)).status(),
    clockExpired: Date.now() >= short.expires * 1000,
  }), {
    timeout: 12_000, intervals: [100, 250, 500], message: "Normal API must reject the same signed cookie after real clock expiry",
  }).toEqual({ status: 401, clockExpired: true });
  const after = Date.now(), expiredCookies = await page.context().cookies(baseURL);
  expect(after).toBeGreaterThanOrEqual(short.expires * 1000);
  expect(expiredCookies.find(cookie => cookie.name === name)?.value === short.token,
    "The signed token must still be present; it was neither replaced nor removed").toBe(true);
  expect(expiredCookies.find(cookie => cookie.name === "garageos_message_reset")?.value).toBe(reset);
  // This is safe to archive: no JWT/credentials or protected fixture contents.
  return { kind, valid_http: 200, expired_http: 401, before_utc_ms: before,
    expires_utc_ms: short.expires * 1000, after_utc_ms: after, unchanged_cookie: true, unchanged_logout_epoch: true };
}
