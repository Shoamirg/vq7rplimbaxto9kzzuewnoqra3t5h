import { expect, request, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { prepareMini } from "./support/mini-auth";
import { usePasswordCustomer } from "./support/password-customer";
import { operationCases, storedThread } from "./support/operations";
import { queueProfiles, queueOverflow, queueTargets } from "./support/queue";
import { assertAccessible, assertKeyboardFocus, assertTargets } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";
import { AUTH_COOKIE } from "../lib/api/constants";
import { CUSTOMER_COOKIE } from "../lib/mini/constants";

test.use({ trace: "off" });

for (const surface of ["Inbox", "Operations", "Mini"] as const)
for (const locale of ["uz", "en", "ru"] as Locale[])
for (const width of [360, 390, 1280]) test(`real permission denial ${surface} ${locale} ${width} suspends the same actor receipt until deliberate recovery`, async ({ page, baseURL }, info) => {
  const label = (key: string) => translate(locale, key), mini = surface === "Mini";
  let id: string, caseId: string | undefined, actor: { id: string; center: string };
  const owner = mini ? null : await request.newContext({ baseURL });
  try {
    if (mini) {
      await page.setViewportSize({ width, height: 900 }); await prepareMini(page, baseURL!, locale);
      const created = await page.request.post("/api/mini/proxy/roadside", { data: { description: `QA38 Permission ${randomUUID()}` } });
      expect(created.status()).toBe(200); id = (await created.json()).conversation_id;
      await page.goto(`/mini/messages/${id}`);
    } else {
      const { items } = await operationCases(page, baseURL!); caseId = items[1].id;
      if (surface === "Operations") {
        await page.goto(`/operations?case=${caseId}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
      }
      id = (await storedThread(page, caseId)).id;
      const profile = queueProfiles(baseURL!).owners[0];
      expect((await owner!.post("/api/auth/login", { data: { email: profile.email, password: profile.password } })).status()).toBe(200);
      const email = `qa38-policy-${randomUUID()}@example.com`, password = `QA38-${randomUUID()}`;
      const employee = await owner!.post("/api/proxy/staff", { data: { full_name: "QA38 policy employee", email, password, role: "receptionist" } });
      expect(employee.status()).toBe(201); const user = await employee.json();
      expect((await page.request.post("/api/auth/login", { data: { email, password } })).status()).toBe(200);
      await page.setViewportSize({ width, height: 900 });
      await page.context().addCookies([{ name: "garageos_locale", value: locale, url: baseURL! }]);
      const me = await (await page.request.get("/api/proxy/auth/me")).json();
      expect(me.id).toBe(user.id); expect(me.service_center_id).toBe(profile.center_id);
      actor = { id: user.id, center: profile.center_id };
      await page.goto(surface === "Inbox" ? `/inbox?c=${id}` : `/operations?case=${caseId}`);
      if (surface === "Operations" && width < 1280) await page.getByRole("button", { name: label("ops.conversation"), exact: true }).click();
    }
    const path = mini ? `/api/mini/proxy/messages/${id}` : `/api/proxy/conversations/${id}/messages`;
    const mePath = mini ? "/api/mini/proxy/me" : "/api/proxy/auth/me";
    const composer = page.getByRole("textbox", { name: label(mini ? "mini.messages.compose" : "ops.message"), exact: true });
    await expect(composer).toBeEnabled();
    const me = await (await page.request.get(mePath)).json();
    actor = { id: me.id, center: mini ? me.garage.id : me.service_center_id };
    const mode = !mini && width === 390 ? "note" : surface === "Inbox" && width === 1280 ? "announcement" : "reply";
    if (mode !== "reply") await page.getByRole("button", { name: label(`message.${mode}`), exact: true }).click();
    const body = `  QA38 Permission ${surface} ${randomUUID()} O‘tkir Русский <literal> &  `;
    let key: string | undefined, payload: unknown, originalID: string | undefined, posts = 0;
    page.on("request", req => { if (req.method() === "POST" && req.url().endsWith(path)) posts++; });
    await page.route(`**${path}`, async route => {
      key = route.request().headers()["idempotency-key"]; payload = route.request().postDataJSON();
      const response = await route.fetch(); expect(response.status()).toBe(mini ? 200 : 201);
      originalID = (await response.json()).id; await route.abort("failed");
    }, { times: 1 });
    await composer.fill(body); await composer.press("Enter");
    const retry = page.getByRole("button", { name: label("message.retry"), exact: true }); await expect(retry).toBeVisible();
    const epoch = (await page.context().cookies(baseURL)).find(cookie => cookie.name === "garageos_message_reset")?.value;
    expect(typeof epoch === "string").toBe(true);
    if (mini) expect(await usePasswordCustomer(page, baseURL!)).toEqual(actor);
    else expect((await owner!.patch(`/api/proxy/staff/${actor.id}`, { data: { role: "mechanic" } })).status()).toBe(200);
    const cookieName = mini ? CUSTOMER_COOKIE : AUTH_COOKIE;
    const credential = (await page.context().cookies(baseURL)).find(cookie => cookie.name === cookieName)?.value;
    expect(typeof credential === "string").toBe(true);
    const current = await page.request.get(mePath); expect(current.status()).toBe(200);
    const principal = await current.json(); expect(principal.id).toBe(actor.id);
    expect(mini ? principal.garage.id : principal.service_center_id).toBe(actor.center);
    const deniedRead = await page.request.get(mini ? path : `/api/proxy/conversations/${id}`);
    expect(deniedRead.status()).toBe(403);
    const deniedReplay = await page.request.post(path, { data: payload, headers: { "Idempotency-Key": key! } });
    expect(deniedReplay.status()).toBe(403);
    expect(JSON.stringify(await deniedReplay.json()).includes(body)).toBe(false);
    const verify = page.getByRole("button", { name: label("message.verify"), exact: true });
    if (await retry.count()) {
      try { await retry.click({ timeout: 1000 }); }
      catch (error) { if (!await verify.isVisible()) throw error; }
    }
    await expect(verify).toBeVisible(); await expect(composer).toHaveCount(0);
    await expect(page.getByText(body, { exact: true })).toHaveCount(0);
    // APIRequestContext calls above are not page events; only Mini's genuine
    // browser write reaches the server403 after its same-UUID /me preflight.
    const suspendedPosts = mini ? 2 : 1; expect(posts).toBe(suspendedPosts);
    const receipt = await page.evaluate(() => {
      const active = sessionStorage.getItem("garageos.message-intents.v1:actor")!;
      return JSON.parse(sessionStorage.getItem(active)!).intents[0];
    });
    expect(receipt.key).toBe(key); expect(receipt.payload).toEqual(payload);
    expect(["uncertain", "suspended"]).toContain(receipt.status);
    const cookies = await page.context().cookies(baseURL);
    expect(cookies.find(cookie => cookie.name === cookieName)?.value === credential).toBe(true);
    expect(cookies.find(cookie => cookie.name === "garageos_message_reset")?.value === epoch).toBe(true);
    await assertKeyboardFocus(page, verify); await queueOverflow(page);
    if (mini) await assertTargets(page); else await queueTargets(page, page.locator("main"));
    await assertAccessible(page, info, `denied-${surface}-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`denied-${surface}-${locale}-${width}.png`), fullPage: true });
    const proof = info.outputPath("permission-denial-proof.json");
    await writeFile(proof, JSON.stringify({ kind: mini ? "customer" : "staff", same_actor: true,
      current_identity_http: 200, denied_read_http: 403, denied_replay_http: 403,
      unchanged_denied_cookie: true, unchanged_logout_epoch: true }, null, 2));
    await info.attach("permission-denial-proof", { path: proof, contentType: "application/json" });
    if (!mini) expect((await owner!.patch(`/api/proxy/staff/${actor.id}`, { data: { role: "receptionist" } })).status()).toBe(200);
    await verify.click();
    if (surface === "Operations" && width < 1280) await page.getByRole("button", { name: label("ops.conversation"), exact: true }).click();
    await expect(composer).toBeEnabled(); await expect(composer).toHaveValue(body); expect(posts).toBe(suspendedPosts);
    const replay = page.waitForRequest(req => req.method() === "POST" && req.url().endsWith(path));
    await assertKeyboardFocus(page, retry); await retry.click(); const req = await replay;
    expect(req.headers()["idempotency-key"]).toBe(key); expect(req.postDataJSON()).toEqual(payload);
    await expect(page.getByRole("status").filter({ hasText: label("message.saved") })).toBeVisible();
    await expect(composer).toHaveValue(""); expect(posts).toBe(suspendedPosts + 1);
    const saved = mini ? await (await page.request.get(path)).json() : await storedThread(page, caseId!);
    const matching = saved.messages.filter((message: { body: string }) => message.body === body);
    expect(matching).toHaveLength(1); expect(matching[0].id).toBe(originalID);
    await queueOverflow(page); await assertAccessible(page, info, `permission-recovered-${surface}-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`permission-recovered-${surface}-${locale}-${width}.png`), fullPage: true });
  } finally { await owner?.dispose(); }
});
