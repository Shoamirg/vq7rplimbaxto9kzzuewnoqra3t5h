import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueCustomer, queueLogin, queueOverflow } from "./support/queue";
import { translate } from "../lib/i18n/dictionaries";
import { assertAccessible } from "./support/accessibility";

test.use({ trace: "off" });

async function openPassportThread(page: Page, baseURL: string) {
  const { profile } = await queueLogin(page, baseURL, "en", 390);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const person = await queueCustomer(page, profile);
  const created = await page.request.post("/api/proxy/conversations", { data: {
    customer_id: person.customer_id, vehicle_id: person.vehicle_id,
    subject: `Passport boundary ${randomUUID()}`,
  } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id as string;
  await page.goto(`/inbox?c=${id}`);
  await expect(page.getByRole("combobox", { name: translate("en", "inbox.action.status"), exact: true })).toBeEnabled();
  const share = page.getByRole("button", { name: translate("en", "message.action.share_passport"), exact: true });
  await expect(share).toBeEnabled();
  await page.evaluate(() => navigator.clipboard.writeText("Unchanged clipboard"));
  return { id, vehicleId: person.vehicle_id, share };
}

test("passport share rechecks current protected context before touching the clipboard", async ({ page, baseURL }) => {
  const { id, share } = await openPassportThread(page, baseURL!);
  await page.route(`**/api/proxy/conversations/${id}`, async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 403, contentType: "application/json", body: '{"error":{"code":"FORBIDDEN"}}' });
  });
  await share.click();
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "message.action.passport_copy_failed") })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Unchanged clipboard");
});

test("passport share verifies the actual artifact still exists", async ({ page, baseURL }) => {
  const { vehicleId, share } = await openPassportThread(page, baseURL!);
  await page.route(`**/api/proxy/public/passport/${vehicleId}`, route => route.fulfill({
    status: 404, contentType: "application/json", body: '{"detail":"Passport not found"}',
  }));
  await share.click();
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "message.action.passport_copy_failed") })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Unchanged clipboard");
});

test("passport share captures one pending target and does not copy after navigating away", async ({ page, baseURL }) => {
  const { id, share } = await openPassportThread(page, baseURL!);
  const nextSubject = `Different target ${randomUUID()}`;
  const next = await page.request.post("/api/proxy/conversations", { data: { subject: nextSubject } });
  expect(next.status()).toBe(201);
  let reads = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/proxy/conversations/${id}`, async route => {
    if (route.request().method() !== "GET") return route.continue();
    reads++;
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  try {
    await share.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect.poll(() => reads).toBe(1);
    await expect(share).toBeDisabled();
    await page.getByRole("button", { name: translate("en", "message.conversations"), exact: true }).click();
    const list = page.getByRole("region", { name: translate("en", "message.conversations"), exact: true });
    await list.getByRole("button").filter({ hasText: nextSubject }).click();
    await expect(page.getByRole("heading", { name: nextSubject, exact: true })).toBeVisible();
  } finally { release(); }
  await page.unrouteAll({ behavior: "wait" });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Unchanged clipboard");
});

test("passport sharing is disabled while retained context has a read failure", async ({ page, baseURL }) => {
  const { id, share } = await openPassportThread(page, baseURL!);
  await page.route(`**/api/proxy/conversations/${id}`, async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":{"code":"UNAVAILABLE"}}' });
  });
  await page.getByRole("button", { name: translate("en", "message.refresh"), exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "message.read_error") })).toBeVisible();
  await expect(share).toBeDisabled();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Unchanged clipboard");
});

test("Inbox counts keep combined search type and channel filters when selecting a view", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const group = `Counts ${randomUUID()}`;
  const expected = { all: 3, needs_reply: 1, waiting_customer: 1, resolved: 1 };
  for (const [state, type, channel] of [
    ["open", "general", "web"], ["waiting_customer", "general", "web"], ["resolved", "general", "web"],
    ["open", "support", "web"], ["open", "general", "phone"],
  ]) {
    const opened = await page.request.post("/api/proxy/conversations", { data: { subject: `${group} ${state} ${type} ${channel}`, conv_type: type } });
    expect(opened.status()).toBe(201);
    const id = (await opened.json()).id as string;
    expect((await page.request.post(`/api/proxy/conversations/${id}/messages`, { data: { body: "Recorded channel", channel } })).status()).toBe(201);
    if (state !== "open") expect((await page.request.patch(`/api/proxy/conversations/${id}`, { data: { status: state } })).status()).toBe(200);
  }
  await page.goto("/inbox");
  await page.getByRole("textbox", { name: translate("en", "inbox.search"), exact: true }).fill(group);
  await page.getByRole("button", { name: translate("en", "message.queues"), exact: true }).click();
  const rail = page.getByRole("navigation", { name: translate("en", "inbox.queue_navigation"), exact: true });
  await rail.getByRole("button", { name: translate("en", "inbox.type.general"), exact: true }).click();
  await rail.getByRole("button").filter({ hasText: translate("en", "inbox.channel.web") }).click();
  for (const view of ["all", "resolved", "waiting_customer"] as const) {
    const observed = page.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === "GET" && url.pathname === "/api/proxy/conversations"
        && url.searchParams.get("view") === view && url.searchParams.get("q") === group
        && url.searchParams.get("type") === "general" && url.searchParams.get("channel") === "web";
    });
    await rail.getByRole("button").filter({ hasText: translate("en", `inbox.view.${view}`) }).click();
    const response = await observed;
    expect(response.status()).toBe(200);
    const data = await response.json();
    for (const [key, value] of Object.entries(expected)) {
      expect(data.counts[key]).toBe(value);
      await expect(rail.getByRole("button").filter({ hasText: translate("en", `inbox.view.${key}`) }))
        .toHaveText(new RegExp(`${value}$`));
    }
    expect(data.total).toBe(expected[view]);
  }
});

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  for (const theme of ["light", "dark"] as const) {
  test(`unbroken stored summaries fit Inbox panes ${locale}/${width}/${theme}`, async ({ page, baseURL }, info) => {
    await queueLogin(page, baseURL!, locale, width);
    await page.setViewportSize({ width, height: 480 });
    await page.emulateMedia({ colorScheme: theme });
    const text = "SavedSummary".repeat(16);
    const subject = `Long summary ${randomUUID()}`;
    const created = await page.request.post("/api/proxy/conversations", { data: { subject, ai_summary: text } });
    expect(created.status()).toBe(201);
    const id = (await created.json()).id as string;
    await page.goto(`/inbox?c=${id}`);
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    const queues = page.getByRole("button", { name: translate(locale, "message.queues"), exact: true });
    await queues.click();
    await page.getByRole("navigation", { name: translate(locale, "inbox.queue_navigation"), exact: true })
      .getByRole("button").filter({ hasText: translate(locale, "inbox.view.all") }).click();
    await page.getByRole("button", { name: translate(locale, "message.close_queues"), exact: true }).click();
    if (width < 1024) await page.getByRole("button", { name: translate(locale, "message.conversations"), exact: true }).click();
    const list = page.getByRole("region", { name: translate(locale, "message.conversations"), exact: true });
    await page.getByRole("textbox", { name: translate(locale, "inbox.search"), exact: true }).fill(subject);
    const row = list.getByRole("button").filter({ hasText: subject });
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();
    await expect.poll(() => list.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await row.click();
    await page.getByRole("button", { name: translate(locale, "message.context"), exact: true }).click();
    const context = page.locator("aside").filter({ hasText: translate(locale, "inbox.context.title") });
    await expect(context.getByText(text, { exact: true })).toBeVisible();
    await expect.poll(() => context.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await queueOverflow(page);
    await assertAccessible(page, info, `long-summary-${locale}-${width}-${theme}`);
    await page.screenshot({ path: info.outputPath(`long-summary-${locale}-${width}-${theme}.png`), fullPage: true });
  });
  }
}
