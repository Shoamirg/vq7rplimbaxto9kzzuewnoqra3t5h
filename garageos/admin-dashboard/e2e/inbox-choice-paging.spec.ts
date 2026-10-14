import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueLogin, queueCustomer, queueJob, queueDate, queueOverflow, queueTargets } from "./support/queue";
import { assertAccessible } from "./support/accessibility";
import { translate } from "../lib/i18n/dictionaries";

// Source-only preparation. Choices are genuine normal-auth API projections,
// with expected identity restricted to UUIDs created by this test's fixtures.
test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe.configure({ retries: 0 });
type Kind = "customer" | "vehicle" | "appointment" | "case" | "invoice" | "assignee";
type ChoicePage = { kind: Kind; items: { id: string }[]; total: number; limit: number; offset: number; has_more: boolean };
const kinds: Kind[] = ["customer", "vehicle", "appointment", "case", "invoice", "assignee"];
const field: Record<Kind, string> = { customer: "customer_id", vehicle: "vehicle_id", appointment: "appointment_id",
  case: "case_id", invoice: "invoice_id", assignee: "assigned_user_id" };
const path = "/api/proxy/conversations", choicePath = `${path}/choices`;
const t = (key: string) => translate("en", key);
function assertPage(data: ChoicePage, kind: Kind, offset: number, expectedLimit?: number) {
  expect(data.kind).toBe(kind); expect(data.offset).toBe(offset);
  expect(Number.isInteger(data.limit)).toBe(true);
  expect(data.limit).toBeGreaterThan(0); expect(data.limit).toBeLessThanOrEqual(100);
  if (expectedLimit !== undefined) expect(data.limit).toBe(expectedLimit);
  expect(Number.isInteger(data.total)).toBe(true); expect(data.total).toBeGreaterThanOrEqual(0);
  expect(data.items).toHaveLength(Math.min(data.limit, Math.max(0, data.total - offset)));
  expect(new Set(data.items.map(item => item.id)).size).toBe(data.items.length);
  expect(data.has_more).toBe(offset + data.items.length < data.total);
}
const form = (page: Page) => page.getByRole("dialog", { name: t("inbox.create.title"), exact: true });
const picker = (page: Page) => page.getByRole("dialog").filter({ has: page.getByRole("textbox", { name: t("inbox.choice.search"), exact: true }) });
async function choose(page: Page, kind: Kind, id: string) {
  await form(page).getByRole("button", { name: t(`inbox.choice.${kind}`), exact: true }).click();
  const root = picker(page); await root.getByRole("textbox", { name: t("inbox.choice.search"), exact: true }).fill(id);
  const selected = root.getByRole("button").filter({ has: page.getByText(id, { exact: true }) });
  await expect(selected).toHaveCount(1); await selected.click();
}

for (const kind of kinds) test(`Inbox ${kind} chooses a genuinely saved UUID beyond the maximum first page without a silent cap`, async ({ page, baseURL }, info) => {
  test.setTimeout(180_000); // Each new volume case seeds103 records through the normal API.
  const { profile, owner } = await queueLogin(page, baseURL!, "en", 1280), person = await queueCustomer(page, profile);
  const tag = `QA39 paged ${randomUUID()} Очень длинный`, ids = new Set<string>();
  const platePrefix = `Q39${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  for (let index = 0; index < 103; index++) {
    if (kind === "appointment") { ids.add(await queueJob(page, person, queueDate(90 + index))); continue; }
    const seedPath = kind === "assignee" ? "/api/proxy/staff" : `/api/proxy/${kind === "case" ? "cases" : kind + "s"}`;
    const data = kind === "customer" ? { full_name: tag, phone: `+998${parseInt(randomUUID().replaceAll("-", "").slice(0, 8), 16).toString().padStart(10, "0")}` }
      : kind === "vehicle" ? { customer_id: person.customer_id, vehicle_model_id: profile.model_id, year: 2024, license_plate: `${platePrefix}${String(index).padStart(3, "0")}` }
      : kind === "case" ? { customer_id: person.customer_id, vehicle_id: person.vehicle_id, title: tag, case_type: "support" }
      : kind === "invoice" ? { customer_id: person.customer_id, vehicle_id: person.vehicle_id, kind: "estimate" }
      : { full_name: tag, email: `${randomUUID()}@example.com`, password: owner.password, role: "manager" };
    const response = await page.request.post(seedPath, { data });
    expect(response.status()).toBe(201); ids.add((await response.json()).id);
  }
  expect(ids.size).toBe(103);
  const context: Record<string, string> = {};
  if (["vehicle", "appointment", "case", "invoice"].includes(kind)) context.customer_id = person.customer_id;
  if (["appointment", "case", "invoice"].includes(kind)) context.vehicle_id = person.vehicle_id;
  const readPage = async (offset: number) => {
    const response = await page.request.get(`${choicePath}?${new URLSearchParams({ kind, limit: "100", offset: String(offset), ...context })}`);
    expect(response.status()).toBe(200); const data = await response.json() as ChoicePage;
    assertPage(data, kind, offset, 100); return data;
  };
  const firstMaximum = await readPage(0);
  expect(firstMaximum.items.length).toBe(100); expect(firstMaximum.total).toBeGreaterThanOrEqual(103);
  const firstIds = new Set(firstMaximum.items.map(item => item.id));
  let offset = 100, target: string | undefined;
  while (!target && offset < firstMaximum.total) {
    const current = await readPage(offset);
    expect(current.offset).toBe(offset); expect(current.limit).toBe(100);
    target = current.items.find(item => ids.has(item.id) && !firstIds.has(item.id))?.id;
    offset += current.limit;
  }
  expect(target).toBeDefined(); expect(ids.has(target!)).toBe(true); expect(firstIds.has(target!)).toBe(false);
  // API pages locate an actually created fixture beyond100; no fabricated label
  // recipe or production ordering helper determines the expected UUID.
  await page.goto("/inbox");
  await page.getByRole("button", { name: t("inbox.create.title"), exact: true }).click();
  const root = form(page), subject = `QA39 saved page ${kind} ${randomUUID()}`;
  await root.getByRole("textbox", { name: t("inbox.create.subject"), exact: true }).fill(subject);
  if (context.customer_id) await choose(page, "customer", context.customer_id);
  if (context.vehicle_id) await choose(page, "vehicle", context.vehicle_id);
  const matches = (address: string, expectedOffset: number) => {
    const url = new URL(address);
    return url.pathname === choicePath && url.searchParams.get("kind") === kind
      && !(url.searchParams.get("q") || "") && Number(url.searchParams.get("offset") || "0") === expectedOffset
      && Object.entries(context).every(([key, value]) => url.searchParams.get(key) === value);
  };
  const initial = page.waitForResponse(response => response.request().method() === "GET" && matches(response.url(), 0));
  await root.getByRole("button", { name: t(`inbox.choice.${kind}`), exact: true }).click();
  const choices = picker(page); await choices.getByRole("textbox", { name: t("inbox.choice.search"), exact: true }).fill("");
  const response = await initial; expect(response.status()).toBe(200); let current = await response.json() as ChoicePage;
  assertPage(current, kind, 0); expect(current.total).toBe(firstMaximum.total);
  await expect(choices.getByText(current.items[0].id, { exact: true })).toBeVisible();
  await expect(choices.getByText(target!, { exact: true })).toHaveCount(0);
  const seen = new Set<string>();
  while (true) {
    for (const item of current.items) { expect(seen.has(item.id)).toBe(false); seen.add(item.id); }
    if (current.items.some(item => item.id === target)) break;
    expect(current.has_more).toBe(true);
    const nextOffset = current.offset + current.limit; expect(nextOffset).toBeLessThan(current.total);
    const following = page.waitForResponse(result => result.request().method() === "GET" && matches(result.url(), nextOffset));
    await choices.getByRole("button", { name: t("inbox.choice.next"), exact: true }).click();
    const next = await following; expect(next.status()).toBe(200); current = await next.json() as ChoicePage;
    assertPage(current, kind, nextOffset); expect(current.total).toBe(firstMaximum.total);
  }
  const selected = choices.getByRole("button").filter({ has: page.getByText(target!, { exact: true }) });
  await expect(selected).toHaveCount(1); await queueTargets(page, choices); await queueOverflow(page);
  await assertAccessible(page, info, `all-kind-paging-${kind}`);
  await page.screenshot({ path: info.outputPath(`all-kind-paging-${kind}.png`), fullPage: true });
  await selected.click(); await expect(root.getByText(target!, { exact: true })).toBeVisible();
  await expect(root.getByRole("textbox", { name: t("inbox.create.subject"), exact: true })).toHaveValue(subject);
  const saved = page.waitForResponse(result => result.request().method() === "POST" && new URL(result.url()).pathname === path);
  await root.getByRole("button", { name: t("inbox.create.submit"), exact: true }).click();
  const created = await saved; expect(created.status()).toBe(201);
  expect(created.request().postDataJSON()).toMatchObject({ subject, [field[kind]]: target, ...context });
  const id = (await created.json()).id as string, detail = await page.request.get(`${path}/${id}`);
  expect(detail.status()).toBe(200); expect(await detail.json()).toMatchObject({ id, subject, [field[kind]]: target, ...context });
});
