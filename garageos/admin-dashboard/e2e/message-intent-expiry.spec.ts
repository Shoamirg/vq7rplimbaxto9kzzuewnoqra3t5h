import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { prepareMini } from "./support/mini-auth";
import { operationCases, storedThread } from "./support/operations";
import { queueLogin, queueOverflow, queueTargets } from "./support/queue";
import { assertAccessible, assertKeyboardFocus, assertTargets } from "./support/accessibility";
import { expireCurrentSession } from "./support/expiring-session";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off" });

for (const surface of ["Inbox", "Operations", "Mini"] as const)
for (const locale of ["uz", "en", "ru"] as Locale[])
for (const width of [360, 390, 1280]) test(`genuine clock expiry ${surface} ${locale} ${width} preserves original receipt and requires deliberate recovery`, async ({ page, baseURL }, info) => {
  const label = (key: string) => translate(locale, key), mini = surface === "Mini";
  let id: string, caseId: string | undefined;
  if (mini) {
    await page.setViewportSize({ width, height: 900 }); await prepareMini(page, baseURL!, locale);
    const created = await page.request.post("/api/mini/proxy/roadside", { data: { description: `QA38 Expiry ${randomUUID()}` } });
    expect(created.ok()).toBeTruthy(); id = (await created.json()).conversation_id;
    await page.goto(`/mini/messages/${id}`);
  } else {
    const { items } = await operationCases(page, baseURL!); caseId = items[1].id;
    if (surface === "Operations") {
      await page.goto(`/operations?case=${caseId}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
    }
    id = (await storedThread(page, caseId)).id;
    await queueLogin(page, baseURL!, locale, width);
    await page.goto(surface === "Inbox" ? `/inbox?c=${id}` : `/operations?case=${caseId}`);
    if (surface === "Operations" && width < 1280) await page.getByRole("button", { name: label("ops.conversation"), exact: true }).click();
  }
  const path = mini ? `/api/mini/proxy/messages/${id}` : `/api/proxy/conversations/${id}/messages`;
  const composer = page.getByRole("textbox", { name: label(mini ? "mini.messages.compose" : "ops.message"), exact: true });
  await expect(composer).toBeEnabled();
  // Replies, notes and announcements remain distinct captured modes in staff.
  const mode = !mini && width === 390 ? "note" : surface === "Inbox" && width === 1280 ? "announcement" : "reply";
  if (mode !== "reply") await page.getByRole("button", { name: label(`message.${mode}`), exact: true }).click();
  const body = `  QA38 Expiry ${surface} ${randomUUID()} O‘tkir Русский <literal> &  `;
  let originalKey: string | undefined, originalPayload: unknown, originalID: string | undefined, posts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(path)) posts++; });
  await page.route(`**${path}`, async route => {
    originalKey = route.request().headers()["idempotency-key"]; originalPayload = route.request().postDataJSON();
    const response = await route.fetch(); expect(response.status()).toBe(mini ? 200 : 201);
    originalID = (await response.json()).id; await route.abort("failed");
  }, { times: 1 });
  await composer.fill(body); await composer.press("Enter");
  const retry = page.getByRole("button", { name: label("message.retry"), exact: true }); await expect(retry).toBeVisible();
  const clock = await expireCurrentSession(page, baseURL!, mini ? "customer" : "staff");
  const verify = page.getByRole("button", { name: label("message.verify"), exact: true });
  // A normal polling401 may already have suspended the view. Otherwise a
  // deliberate retry observes genuine expiry at the current write preflight.
  if (await retry.count()) {
    try { await retry.click({ timeout: 1000 }); }
    catch (error) {
      // Normal polling may replace this control with denial between observation
      // and click. Accept only that already-visible protected denial state.
      if (!await verify.isVisible()) throw error;
    }
  }
  await expect(verify).toBeVisible(); await expect(composer).toHaveCount(0);
  await expect(page.getByText(body, { exact: true })).toHaveCount(0); expect(posts).toBe(1);
  const receipt = await page.evaluate(() => {
    const active = sessionStorage.getItem("garageos.message-intents.v1:actor")!;
    return JSON.parse(sessionStorage.getItem(active)!).intents[0];
  });
  expect(receipt.key).toBe(originalKey); expect(receipt.payload).toEqual(originalPayload);
  expect(["uncertain", "suspended"]).toContain(receipt.status);
  await assertKeyboardFocus(page, verify); await queueOverflow(page);
  if (mini) await assertTargets(page); else await queueTargets(page, page.locator("main"));
  await assertAccessible(page, info, `expired-${surface}-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`expired-${surface}-${locale}-${width}.png`), fullPage: true });
  const proofPath = info.outputPath("clock-expiry-proof.json"); await writeFile(proofPath, JSON.stringify(clock, null, 2));
  await info.attach("clock-expiry-proof", { path: proofPath, contentType: "application/json" });
  if (!mini) await queueLogin(page, baseURL!, locale, width);
  // Mini renews only on this explicit Verify action using genuine signed
  // Telegram launch data; staff must verify its freshly logged-in actor too.
  await verify.click();
  // Operations' normal verified phone entry restores the case detail first.
  // Opening its conversation is a separate deliberate navigation action.
  if (surface === "Operations" && width < 1280)
    await page.getByRole("button", { name: label("ops.conversation"), exact: true }).click();
  await expect(composer).toBeEnabled(); await expect(composer).toHaveValue(body); expect(posts).toBe(1);
  const replay = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(path));
  await assertKeyboardFocus(page, retry); await retry.click();
  const request = await replay; expect(request.headers()["idempotency-key"]).toBe(originalKey); expect(request.postDataJSON()).toEqual(originalPayload);
  await expect(page.getByRole("status").filter({ hasText: label("message.saved") })).toBeVisible();
  await expect(composer).toHaveValue(""); expect(posts).toBe(2);
  const stored = mini ? await (await page.request.get(path)).json() : await storedThread(page, caseId!);
  const matching = stored.messages.filter((message: { body: string }) => message.body === body);
  expect(matching).toHaveLength(1); expect(matching[0].id).toBe(originalID);
  await queueOverflow(page); await assertAccessible(page, info, `recovered-${surface}-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`recovered-${surface}-${locale}-${width}.png`), fullPage: true });
});
