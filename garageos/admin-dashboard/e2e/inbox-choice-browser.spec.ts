import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueLogin, queueOverflow, queueTargets, switchQueueLocale } from "./support/queue";
import { assertAccessible } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

// Source-only preparation: these contracts require a genuine normal-auth runtime RED.
test.use({ trace: "off" });
const choicesPath = "/api/proxy/conversations/choices";
const t = (locale: Locale, key: string) => translate(locale, key);
const form = (page: Page, locale: Locale) => page.getByRole("dialog", { name: t(locale, "inbox.create.title"), exact: true });
const picker = (page: Page, locale: Locale) => page.getByRole("dialog").filter({
  has: page.getByRole("textbox", { name: t(locale, "inbox.choice.search"), exact: true }),
});
async function openCustomer(page: Page, locale: Locale) {
  await form(page, locale).getByRole("button", { name: t(locale, "inbox.choice.customer"), exact: true }).click();
  const root = picker(page, locale); await expect(root).toBeVisible(); return root;
}
async function customer(page: Page, fullName: string) {
  const response = await page.request.post("/api/proxy/customers", { data: {
    full_name: fullName,
    phone: `+998${parseInt(randomUUID().replaceAll("-", "").slice(0, 8), 16).toString().padStart(10, "0")}`,
  } });
  expect(response.status()).toBe(201); return (await response.json()).id as string;
}
const option = (page: Page, root: Locator, id: string) => root.getByRole("button").filter({ has: page.getByText(id, { exact: true }) });

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  test(`Inbox same-name choices beyond page one retain UUID and unrelated form ${locale}/${width}`, async ({ page, baseURL }, info) => {
    await queueLogin(page, baseURL!, locale, width); await page.setViewportSize({ width, height: 568 });
    const name = `QA39 picker ${randomUUID()} O‘tkir Очень длинный <literal>`;
    const ids: string[] = [];
    for (let index = 0; index < 103; index++) ids.push(await customer(page, name));
    ids.sort(); // documented UUID tie-break for identical recorded labels
    const expectedId = ids[102], subject = `Retained subject ${randomUUID()}`;
    await page.goto("/inbox");
    await page.getByRole("button", { name: t(locale, "inbox.create.title"), exact: true }).click();
    await form(page, locale).getByRole("textbox", { name: t(locale, "inbox.create.subject"), exact: true }).fill(subject);
    let root = await openCustomer(page, locale);
    const searched = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === choicesPath && url.searchParams.get("kind") === "customer"
        && url.searchParams.get("q") === name && Number(url.searchParams.get("offset") || "0") === 0;
    });
    await root.getByRole("textbox", { name: t(locale, "inbox.choice.search"), exact: true }).fill(name);
    const firstResponse = await searched; expect(firstResponse.status()).toBe(200);
    const first = await firstResponse.json();
    expect(first).toMatchObject({ kind: "customer", total: 103, offset: 0, has_more: true });
    expect(first.items.length).toBe(first.limit); expect(first.limit).toBeLessThan(103);
    await expect(option(page, root, expectedId)).toHaveCount(0);
    let current = first;
    while (current.has_more) {
      const expectedOffset = current.offset + current.limit;
      expect(expectedOffset).toBeLessThan(103);
      const nextPage = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === choicesPath && url.searchParams.get("kind") === "customer"
          && url.searchParams.get("q") === name && Number(url.searchParams.get("offset")) === expectedOffset;
      });
      await root.getByRole("button", { name: t(locale, "inbox.choice.next"), exact: true }).click();
      const response = await nextPage; expect(response.status()).toBe(200); current = await response.json();
      expect(current.total).toBe(103); expect(current.offset).toBe(expectedOffset);
    }
    await expect(option(page, root, expectedId)).toHaveCount(1);
    await queueOverflow(page); await queueTargets(page, root);
    await assertAccessible(page, info, `choices-second-page-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`choices-second-page-${locale}-${width}.png`), fullPage: true });
    await option(page, root, expectedId).click();
    await expect(form(page, locale).getByText(expectedId, { exact: true })).toBeVisible();
    await expect(form(page, locale).getByRole("textbox", { name: t(locale, "inbox.create.subject"), exact: true })).toHaveValue(subject);
    const otherLocale: Locale = locale === "ru" ? "en" : "ru";
    await form(page, locale).getByRole("button", { name: t(locale, "common.close"), exact: true }).click();
    await switchQueueLocale(page, locale, otherLocale);
    await page.getByRole("button", { name: t(otherLocale, "inbox.create.title"), exact: true }).click();
    await expect(form(page, otherLocale).getByText(expectedId, { exact: true })).toBeVisible();
    await expect(form(page, otherLocale).getByRole("textbox", { name: t(otherLocale, "inbox.create.subject"), exact: true })).toHaveValue(subject);
    const saved = page.waitForResponse(response => response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/proxy/conversations");
    await form(page, otherLocale).getByRole("button", { name: t(otherLocale, "inbox.create.submit"), exact: true }).click();
    const response = await saved; expect(response.status()).toBe(201);
    const id = (await response.json()).id as string;
    const detail = await page.request.get(`/api/proxy/conversations/${id}`);
    expect(detail.status()).toBe(200); expect(await detail.json()).toMatchObject({ subject, customer_id: expectedId });
  });
}

test("Inbox failed choice search retries a read and preserves selected UUID and captured form", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 390); await page.setViewportSize({ width: 390, height: 568 });
  const id = await customer(page, `QA39 retry ${randomUUID()}`), subject = `Choice failure draft ${randomUUID()}`;
  await page.goto("/inbox");
  await page.getByRole("button", { name: t("en", "inbox.create.title"), exact: true }).click();
  await form(page, "en").getByRole("textbox", { name: t("en", "inbox.create.subject"), exact: true }).fill(subject);
  let root = await openCustomer(page, "en");
  await root.getByRole("textbox", { name: t("en", "inbox.choice.search"), exact: true }).fill(id);
  await option(page, root, id).click();
  root = await openCustomer(page, "en");
  const laterId = await customer(page, `QA39 fresh retry ${randomUUID()}`);
  let writes = 0, reads = 0, failed = false;
  const matchesSearch = (address: string) => {
    const url = new URL(address);
    return url.pathname === choicesPath && url.searchParams.get("kind") === "customer"
      && url.searchParams.get("q") === laterId && Number(url.searchParams.get("offset") || "0") === 0;
  };
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/proxy/conversations") writes++;
    if (request.method() === "GET" && matchesSearch(request.url())) reads++;
  });
  await page.route(`**${choicesPath}**`, async route => {
    if (failed || route.request().method() !== "GET" || !matchesSearch(route.request().url())) return route.continue();
    failed = true; await route.abort("failed");
  });
  try {
    await root.getByRole("textbox", { name: t("en", "inbox.choice.search"), exact: true }).fill(laterId);
    await expect(root.getByRole("alert")).toBeVisible();
    expect(reads).toBe(1);
    await expect(root.getByRole("button", { name: t("en", "inbox.choice.retry"), exact: true })).toBeEnabled();
    expect(writes).toBe(0);
    const retried = page.waitForResponse(response => response.request().method() === "GET" && matchesSearch(response.url()));
    await root.getByRole("button", { name: t("en", "inbox.choice.retry"), exact: true }).click();
    expect((await retried).status()).toBe(200); expect(reads).toBe(2);
    await expect(root.getByRole("alert")).toHaveCount(0);
    await expect(option(page, root, laterId)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(form(page, "en").getByText(id, { exact: true })).toBeVisible();
    await expect(form(page, "en").getByRole("textbox", { name: t("en", "inbox.create.subject"), exact: true })).toHaveValue(subject);
    expect(writes).toBe(0);
  } finally { await page.unrouteAll({ behavior: "wait" }); }
});
