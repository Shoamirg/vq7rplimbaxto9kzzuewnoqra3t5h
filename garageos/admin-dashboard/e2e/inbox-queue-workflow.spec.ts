import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { translate } from "../lib/i18n/dictionaries";
import { queueCustomer, queueLogin, queueOverflow, queueTargets } from "./support/queue";
import { assertAccessible, assertKeyboardFocus, settleMotion } from "./support/accessibility";

test.use({ trace: "off" });

const group = `QA39Queue${randomUUID().replaceAll("-", "")}`;
const subject = `${group} СЕРВИС 100% _ back\\slash`;
let oldest: string;

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const page = await browser.newPage();
  try {
    const { profile } = await queueLogin(page, baseURL!, "en", 1280);
    const person = await queueCustomer(page, profile);
    // Normal staff HTTP creates 129 isolated matching threads. The first one
    // has the same low priority and predates the following 128: it is beyond
    // both the old80 cutoff and the first two new50-row pages.
    for (let i = 0; i < 129; i++) {
      const response = await page.request.post("/api/proxy/conversations", { data: {
        subject: i === 0 ? subject : `${group} Recorded conversation ${i}`,
        customer_id: person.customer_id, vehicle_id: person.vehicle_id, priority: "low",
      } });
      expect(response.status()).toBe(201);
      if (i === 0) oldest = (await response.json()).id;
    }
  } finally { await page.close(); }
});

for (const locale of ["uz", "en", "ru"] as const)
for (const width of [360, 390, 1280])
test(`Inbox complete queue paging and literal old search ${locale} ${width}`, async ({ page, baseURL }, info) => {
  await queueLogin(page, baseURL!, locale, width);
  await page.setViewportSize({ width, height: 640 });
  const label = (key: string) => translate(locale, key);
  await page.goto(`/inbox?c=${oldest}`);
  await expect(page.getByRole("heading", { level: 1, name: label("nav.inbox"), exact: true })).toBeVisible();
  await page.getByRole("button", { name: label("message.queues"), exact: true }).click();
  const rail = page.getByRole("navigation", { name: label("inbox.queue_navigation"), exact: true });
  await rail.getByRole("button").filter({ hasText: label("inbox.view.all") }).click();
  await page.getByRole("button", { name: label("message.close_queues"), exact: true }).click();
  if (width < 1024) await page.getByRole("button", { name: label("message.conversations"), exact: true }).click();
  const search = page.getByRole("textbox", { name: label("inbox.search"), exact: true });
  await search.fill(group);
  const pages = page.getByRole("navigation", { name: label("inbox.pages"), exact: true });
  const results = (start: number, end: number, total: number) => translate(locale, "inbox.results", {
    start: String(start), end: String(end), total: String(total),
  });
  await expect(pages).toContainText(results(1, 50, 129));
  await expect(page.getByRole("button").filter({ hasText: subject })).toHaveCount(0);
  await pages.getByRole("button", { name: label("ops.next"), exact: true }).click();
  await expect(pages).toContainText(results(51, 100, 129));
  await expect(page.getByRole("button").filter({ hasText: subject })).toHaveCount(0);
  await pages.getByRole("button", { name: label("ops.next"), exact: true }).click();
  await expect(pages).toContainText(results(101, 129, 129));
  await expect(page.getByRole("button").filter({ hasText: subject })).toBeVisible();
  await expect(pages.getByRole("button", { name: label("ops.next"), exact: true })).toBeDisabled();

  // Scope repeated runs to their own recorded fixture; an earlier run's
  // legitimately matching conversation must not make this expected total one.
  const query = `${group.toLowerCase()} сервис 100% _ back\\slash`;
  const sentQuery = page.waitForRequest(request => request.method() === "GET"
    && request.url().includes("/api/proxy/conversations?")
    && new URL(request.url()).searchParams.get("q") === query
    && new URL(request.url()).searchParams.get("offset") === "0");
  await search.fill(query); await sentQuery;
  await expect(pages).toContainText(results(1, 1, 1));
  await expect(page.getByRole("button").filter({ hasText: subject })).toBeVisible();
  await expect(pages.getByRole("button", { name: label("ops.previous"), exact: true })).toBeDisabled();
  await queueTargets(page, pages); await queueOverflow(page);
  try {
    await assertKeyboardFocus(page, search);
  } catch (error) {
    const styles = await search.evaluate(input => {
      const style = getComputedStyle(input);
      return { classes: input.className, active: input === document.activeElement,
        focusVisible: input.matches(':focus-visible'), outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth, outlineColor: style.outlineColor,
        outlineStyleVariable: style.getPropertyValue('--tw-outline-style'), boxShadow: style.boxShadow,
        opacity: style.opacity };
    });
    const diagnosticPath = info.outputPath('inbox-search-focus-styles.json');
    await writeFile(diagnosticPath, JSON.stringify(styles, null, 2), 'utf8');
    await info.attach('inbox-search-focus-styles', { path: diagnosticPath, contentType: 'application/json' });
    throw error;
  }
  await settleMotion(page);
  await page.screenshot({ path: info.outputPath(`inbox-queue-${locale}-${width}.png`), fullPage: true });
  await assertAccessible(page, info, `inbox-queue-${locale}-${width}`);
  await search.fill(`${group} no-match`);
  await expect(page.getByText(label("inbox.empty"), { exact: true })).toBeVisible();
  await expect(pages).toContainText(results(0, 0, 0));
});
