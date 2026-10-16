import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueLogin, queueOverflow, queueTargets } from "./support/queue";
import { assertAccessible, assertKeyboardFocus } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off" });

async function createThread(page: Page) {
  const subject = `QA39 Read ${randomUUID()}`;
  const response = await page.request.post("/api/proxy/conversations", { data: { subject } });
  expect(response.status()).toBe(201);
  return { id: (await response.json()).id as string, subject };
}
async function incoming(page: Page, id: string) {
  const response = await page.request.post(`/api/proxy/conversations/${id}/messages`, {
    headers: { "Idempotency-Key": randomUUID() }, data: { body: `Recorded arrival ${randomUUID()}`, author_role: "customer" },
  });
  expect(response.status()).toBe(201); return (await response.json()).id as string;
}
async function stored(page: Page, id: string) {
  const response = await page.request.get(`/api/proxy/conversations/${id}`);
  expect(response.status()).toBe(200); return response.json();
}
async function selectRecordedQueueThread(page: Page, target: { id: string; subject: string }, previousSubject: string) {
  // Queue priority/history may put this record beyond the first fifty rows.
  // Use the actual literal server search without changing the selected thread.
  const searched = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === "/api/proxy/conversations"
      && url.searchParams.get("q") === target.subject && url.searchParams.get("offset") === "0";
  });
  await page.getByRole("textbox", { name: translate("en", "inbox.search"), exact: true }).fill(target.subject);
  const response = await searched; expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.total).toBe(1); expect(result.offset).toBe(0);
  expect(result.items.map((item: { id: string; subject: string }) => ({ id: item.id, subject: item.subject }))).toEqual([target]);
  await expect(page.getByRole("heading", { name: previousSubject, exact: true })).toBeVisible();
  const row = page.getByRole("region", { name: translate("en", "message.conversations"), exact: true }).getByRole("button")
    .filter({ has: page.getByText(target.subject, { exact: true }) });
  await expect(row).toHaveCount(1);
  const opened = page.waitForResponse(response => response.request().method() === "GET"
    && new URL(response.url()).pathname === `/api/proxy/conversations/${target.id}`);
  await row.click();
  const detail = await opened; expect(detail.status()).toBe(200);
  const snapshot = await detail.json();
  expect({ id: snapshot.id, subject: snapshot.subject }).toEqual(target);
  await expect(page.getByRole("heading", { name: target.subject, exact: true })).toBeVisible();
  return snapshot;
}

const acknowledgement = (page: Page, locale: Locale) => page.getByRole("status").filter({ hasText: translate(locale, "inbox.read.acknowledged") });

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  test(`Inbox observed GET retains a later arrival ${locale}/${width}`, async ({ page, baseURL }, info) => {
    await queueLogin(page, baseURL!, locale, width);
    await page.setViewportSize({ width, height: 640 });
    const target = await createThread(page), first = await incoming(page, target.id);
    const path = `/api/proxy/conversations/${target.id}`;
    let observation = "", newer = "", postedObservation = "";
    await page.route(`**${path}`, async route => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch(); expect(response.status()).toBe(200);
      const snapshot = await response.json(); observation = snapshot.read_observation;
      expect(snapshot.messages.map((row: { id: string }) => row.id)).toContain(first);
      newer = await incoming(page, target.id);
      await route.fulfill({ response });
    }, { times: 1 });
    page.on("request", request => { if (request.method() === "PATCH" && request.url().endsWith(path)) postedObservation = request.postDataJSON().read_observation; });
    await page.goto(`/inbox?c=${target.id}`);
    await expect(acknowledgement(page, locale)).toBeVisible();
    expect(postedObservation).toBe(observation);
    const current = await stored(page, target.id);
    expect(current.unread_messages).toBe(1); expect(current.messages.map((row: { id: string }) => row.id)).toContain(newer);
    await queueOverflow(page); await queueTargets(page, page.locator("main"));
    await assertAccessible(page, info, `read-observed-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`read-observed-${locale}-${width}.png`), fullPage: true });
  });

  for (const outcome of ["rejected", "lost"] as const) {
    test(`Inbox ${outcome} ACK reconciles a fresh observed boundary ${locale}/${width}`, async ({ page, baseURL }, info) => {
      await queueLogin(page, baseURL!, locale, width);
      await page.setViewportSize({ width, height: 640 });
      const target = await createThread(page); await incoming(page, target.id);
      const path = `/api/proxy/conversations/${target.id}`, receipts: string[] = [];
      page.on("request", request => { if (request.method() === "PATCH" && request.url().endsWith(path)) receipts.push(request.postDataJSON().read_observation); });
      await page.route(`**${path}`, async route => {
        if (route.request().method() !== "PATCH") return route.continue();
        if (outcome === "lost") {
          const response = await route.fetch(); expect(response.status()).toBe(200);
          await route.abort("failed");
        } else {
          // The real upstream owning boundary rejects an unknown observation;
          // auth, transaction and response are never replaced with a fake API.
          const response = await route.fetch({ postData: JSON.stringify({ ...route.request().postDataJSON(), read_observation: randomUUID() }) });
          expect(response.status()).toBe(422); await route.fulfill({ response });
        }
        await page.unroute(`**${path}`);
      });
      await page.goto(`/inbox?c=${target.id}`);
      const label = (key: string) => translate(locale, key);
      const error = page.getByRole("alert").filter({ hasText: label(outcome === "lost" ? "inbox.read.uncertain" : "inbox.read.error") });
      await expect(error).toBeVisible();
      const composer = page.getByRole("textbox", { name: label("ops.message"), exact: true });
      const draft = `Private draft ${randomUUID()}`; await composer.fill(draft);
      await incoming(page, target.id);
      const current = await stored(page, target.id);
      expect(current.unread_messages).toBe(outcome === "lost" ? 1 : 2);
      expect(receipts).toHaveLength(1);
      const retry = error.getByRole("button", { name: label("inbox.read.retry"), exact: true });
      await assertKeyboardFocus(page, retry); await queueTargets(page, error); await queueOverflow(page);
      await assertAccessible(page, info, `read-${outcome}-${locale}-${width}`);
      await page.screenshot({ path: info.outputPath(`read-${outcome}-${locale}-${width}.png`), fullPage: true });
      await retry.click(); await expect(acknowledgement(page, locale)).toBeVisible();
      expect(receipts).toHaveLength(2); expect(receipts[1]).not.toBe(receipts[0]);
      await expect(composer).toHaveValue(draft);
      expect((await stored(page, target.id)).unread_messages).toBe(0);
    });
  }
}

test("Inbox late A ACK is captured while B and a newer A observation remain independent", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1920);
  const a = await createThread(page), b = await createThread(page);
  await incoming(page, a.id); await incoming(page, b.id);
  const path = `/api/proxy/conversations/${a.id}`;
  let release!: () => void, held = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const receipts: string[] = [];
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    receipts.push(route.request().postDataJSON().read_observation);
    if (receipts.length === 1) { held = true; await gate; }
    const response = await route.fetch(); expect(response.status()).toBe(200); await route.fulfill({ response });
  });
  try {
    await page.goto(`/inbox?c=${a.id}`);
    await expect.poll(() => held).toBe(true);
    await selectRecordedQueueThread(page, b, a.subject);
    await expect(acknowledgement(page, "en")).toBeVisible();
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    const draft = `B captured draft ${randomUUID()}`; await composer.fill(draft);
    await incoming(page, a.id);
    await expect(composer).toHaveValue(draft);
    const snapshot = await selectRecordedQueueThread(page, a, b.subject); expect(snapshot.unread_messages).toBe(2);
    await expect(page.getByRole("status").filter({ hasText: "Acknowledging viewed history…" })).toBeVisible();
    expect(receipts).toHaveLength(1); // returning A cannot dispatch around its synchronous pending lock
    const firstACK = page.waitForResponse(response => response.request().method() === "PATCH" && response.url().endsWith(path)
      && response.request().postDataJSON().read_observation === receipts[0]);
    const secondACK = page.waitForResponse(response => response.request().method() === "PATCH" && response.url().endsWith(path)
      && response.request().postDataJSON().read_observation === snapshot.read_observation);
    release();
    const firstResult = await firstACK; expect(firstResult.status()).toBe(200);
    expect((await firstResult.json()).unread_messages).toBe(1);
    expect((await secondACK).status()).toBe(200);
    await expect(acknowledgement(page, "en")).toBeVisible();
    expect(receipts).toHaveLength(2);
    expect(receipts[1]).not.toBe(receipts[0]);
    expect((await stored(page, a.id)).unread_messages).toBe(0);
    await selectRecordedQueueThread(page, b, a.subject);
    await expect(composer).toHaveValue(draft);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Inbox committed ACK stays acknowledged when the subsequent queue read fails", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const target = await createThread(page); await incoming(page, target.id);
  let acknowledged = false;
  await page.route(`**/api/proxy/conversations?**`, async route => {
    if (acknowledged) return route.abort("failed");
    return route.continue();
  });
  await page.route(`**/api/proxy/conversations/${target.id}`, async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    const response = await route.fetch(); expect(response.status()).toBe(200);
    acknowledged = true; await route.fulfill({ response });
  });
  await page.goto(`/inbox?c=${target.id}`);
  await expect(acknowledgement(page, "en")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "ops.stale") })).toBeVisible();
  expect((await stored(page, target.id)).unread_messages).toBe(0);
  await expect(page.getByRole("button", { name: "Reload and acknowledge viewed history", exact: true })).toHaveCount(0);
});
