import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prepareMini } from "./support/mini-auth";
import { assertAccessible, assertKeyboardFocus, assertTargets } from "./support/accessibility";
import { queueOverflow } from "./support/queue";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off" });
for (const locale of ["uz", "en", "ru"] as Locale[])
for (const width of [360, 390, 1280]) test(`Mini cold recovery ${locale} ${width} exposes actionable storage failure without protected restoration`, async ({ page, baseURL }, info) => {
  const label = (key: string) => translate(locale, key);
  await page.setViewportSize({ width, height: 900 }); await prepareMini(page, baseURL!, locale);
  const created = await page.request.post("/api/mini/proxy/roadside", { data: { description: `QA38 Startup ${randomUUID()}` } });
  expect(created.ok()).toBeTruthy(); const id = (await created.json()).conversation_id as string, path = `/api/mini/proxy/messages/${id}`;
  await page.goto(`/mini/messages/${id}`);
  const composer = page.getByRole("textbox", { name: label("mini.messages.compose"), exact: true }); await expect(composer).toBeEnabled();
  const body = `  QA38 Startup ${randomUUID()} O‘tkir & Русский  `; let key: string | undefined, messageID: string | undefined, posts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(path)) posts++; });
  await page.route(`**${path}`, async route => {
    key = route.request().headers()["idempotency-key"]; const saved = await route.fetch(); expect(saved.status()).toBe(200);
    messageID = (await saved.json()).id; await route.abort("failed");
  }, { times: 1 });
  await composer.fill(body); await composer.press("Enter"); await expect(page.getByRole("button", { name: label("message.retry"), exact: true })).toBeVisible();
  const blockedCookie = width === 360;
  if (blockedCookie) await page.evaluate(() => { document.cookie = "garageos_message_reset=; Path=/; Max-Age=0"; });
  await page.addInitScript(blockCookie => {
    const get = Storage.prototype.getItem, descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
    if (blockCookie) Object.defineProperty(document, "cookie", { configurable: true,
      get() { return descriptor.get!.call(document); },
      set(value: string) { if (value.startsWith("garageos_message_reset=")) throw new Error("QA cold reset blocked"); descriptor.set!.call(document, value); } });
    else Storage.prototype.getItem = function(name) { if (name.startsWith("garageos.message")) throw new Error("QA cold recovery storage blocked"); return get.call(this, name); };
    (window as unknown as { restoreColdMessageStorage: () => void }).restoreColdMessageStorage = () => {
      Storage.prototype.getItem = get; if (blockCookie) delete (document as unknown as { cookie?: string }).cookie;
    };
  }, blockedCookie);
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: label("message.storage") })).toBeVisible();
  await expect(composer).toHaveCount(0); await expect(page.getByText(body, { exact: true })).toHaveCount(0); expect(posts).toBe(1);
  const retryStorage = page.getByRole("button", { name: label("message.storage_retry"), exact: true });
  await assertKeyboardFocus(page, retryStorage); await assertTargets(page); await queueOverflow(page);
  await assertAccessible(page, info, `mini-cold-storage-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`mini-cold-storage-${locale}-${width}.png`), fullPage: true });
  await page.evaluate(() => (window as unknown as { restoreColdMessageStorage: () => void }).restoreColdMessageStorage());
  await retryStorage.click(); await expect(composer).toBeEnabled(); expect(posts).toBe(1);
  const retry = page.getByRole("button", { name: label("message.retry"), exact: true });
  if (blockedCookie) {
    // An unavailable/missing epoch cannot authorize legacy private receipts.
    // Fresh normal ownership may show the durable server message, not its draft.
    await expect(composer).toHaveValue(""); await expect(retry).toHaveCount(0);
  } else {
    await expect(composer).toHaveValue(body);
    const replay = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(path));
    await assertKeyboardFocus(page, retry); await retry.click(); expect((await replay).headers()["idempotency-key"]).toBe(key);
    await expect(page.getByRole("status").filter({ hasText: label("message.saved") })).toBeVisible(); expect(posts).toBe(2);
  }
  const messages = (await (await page.request.get(path)).json()).messages.filter((message: { body: string }) => message.body === body);
  expect(messages).toHaveLength(1); expect(messages[0].id).toBe(messageID);
});
