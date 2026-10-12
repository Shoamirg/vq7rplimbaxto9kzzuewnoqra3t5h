import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { withFailureDiagnostics } from "./support/failure-diagnostics";
import { queueCustomer, queueDate, queueLogin, queueOverflow, queueProfiles, queueTargets, switchQueueLocale } from "./support/queue";
import { assertAccessible, assertKeyboardFocus } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";
import { safeCallHref } from "../components/inbox/shared";
import { freshOperationsDemoToken } from "./support/demo-session";

test.use({ trace: "off" });

async function createThread(page: Page) {
  const subject = `QA39 Action ${randomUUID()}`;
  const response = await page.request.post("/api/proxy/conversations", { data: { subject } });
  expect(response.status()).toBe(201);
  return { id: (await response.json()).id as string, subject };
}
async function createCustomerThread(page: Page, phone: string) {
  const customer = await page.request.post("/api/proxy/customers", { data: {
    full_name: `QA39 Call ${randomUUID()}`, phone,
  } });
  expect(customer.status()).toBe(201);
  const person = await customer.json() as { id: string; phone: string | null };
  const conversation = await page.request.post("/api/proxy/conversations", { data: {
    subject: `QA39 Call ${randomUUID()}`, customer_id: person.id,
  } });
  expect(conversation.status()).toBe(201);
  return { id: (await conversation.json()).id as string, phone: person.phone };
}
async function stored(page: Page, id: string) {
  const response = await page.request.get(`/api/proxy/conversations/${id}`);
  expect(response.status()).toBe(200); return response.json();
}
const notice = (page: Page, locale: Locale, state: string) => page.getByRole(state === "uncertain" || state === "error" ? "alert" : "status")
  .filter({ hasText: translate(locale, `inbox.action.${state}`) });
const status = (page: Page, locale: Locale) => page.getByRole("combobox", { name: translate(locale, "inbox.action.status"), exact: true });
async function ready(page: Page, locale: Locale) {
  await expect(page.getByRole("status").filter({ hasText: translate(locale, "inbox.read.acknowledged") })).toBeVisible();
  await expect(status(page, locale)).toBeEnabled();
}

test("recorded phone call destinations reject non-phone schemes and malformed values", () => {
  expect(safeCallHref("+998 90 (123) 45-67")).toBe("tel:+998901234567");
  expect(safeCallHref("901234567")).toBe("tel:901234567");
  for (const value of [null, "", "javascript:alert(1)", "tel:+998901234567", "+998+901234567", "+998;5551234", "123456", "1".repeat(16)]) {
    expect(safeCallHref(value)).toBeNull();
  }
});

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

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  test(`Inbox call action uses a recorded phone or explains its absence ${locale}/${width}`, async ({ page, baseURL }, info) => {
    const { profile } = await queueLogin(page, baseURL!, locale, width);
    const phone = `+99890${String(parseInt(randomUUID().replaceAll("-", "").slice(0, 8), 16) % 10_000_000).padStart(7, "0")}`;
    const valid = await createCustomerThread(page, phone);
    await page.goto(`/inbox?c=${valid.id}`); await ready(page, locale);
    const actions = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true });
    await expect(actions.getByRole("note", { name: translate(locale, "message.action.eta_unavailable"), exact: true })).toBeVisible();
    await expect(actions.getByRole("note", { name: translate(locale, "message.action.passport_unavailable"), exact: true })).toBeVisible();
    const call = actions.getByRole("link", { name: translate(locale, "message.action.call"), exact: true });
    await expect(call).toHaveAttribute("href", `tel:${phone}`);
    expect(valid.phone).toBe(phone);
    await queueTargets(page, actions); await queueOverflow(page);
    await assertAccessible(page, info, `call-recorded-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`call-recorded-${locale}-${width}.png`), fullPage: true });

    const missingResponse = await page.request.post("/api/proxy/conversations", { data: { customer_id: profile.legacy_customer_id } });
    expect(missingResponse.status()).toBe(201);
    const missingId = (await missingResponse.json()).id as string;
    expect((await stored(page, missingId)).customer_phone).toBeNull();
    await page.goto(`/inbox?c=${missingId}`); await ready(page, locale);
    const unavailable = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true })
      .getByRole("note", { name: translate(locale, "message.action.phone_unavailable"), exact: true });
    await expect(unavailable).toBeVisible();
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await assertAccessible(page, info, `call-unavailable-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`call-unavailable-${locale}-${width}.png`), fullPage: true });
  });
}

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  test(`Inbox shares only an available passport and reports the real clipboard result ${locale}/${width}`, async ({ page, baseURL }, info) => {
    const { profile } = await queueLogin(page, baseURL!, locale, width);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const person = await queueCustomer(page, profile);
    const created = await page.request.post("/api/proxy/conversations", { data: {
      customer_id: person.customer_id, vehicle_id: person.vehicle_id,
    } });
    expect(created.status()).toBe(201); const id = (await created.json()).id as string;
    await page.goto(`/inbox?c=${id}`); await ready(page, locale);
    const actions = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true });
    const passport = actions.getByRole("button", { name: translate(locale, "message.action.share_passport"), exact: true });
    await expect(passport).toBeVisible();
    await passport.click();
    await expect(page.getByRole("status").filter({ hasText: translate(locale, "message.action.passport_copied") })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(baseURL!).origin}/passport/${person.vehicle_id}`);
    await queueTargets(page, actions); await queueOverflow(page);
    await assertAccessible(page, info, `passport-share-${locale}-${width}`);
  });
}

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  test(`Inbox booking captures its customer and reconciles a lost response without reposting ${locale}/${width}`, async ({ page, baseURL }, info) => {
    const { profile } = await queueLogin(page, baseURL!, locale, width);
    const person = await queueCustomer(page, profile);
    const created = await page.request.post("/api/proxy/conversations", { data: {
      customer_id: person.customer_id, vehicle_id: person.vehicle_id,
    } });
    expect(created.status()).toBe(201); const id = (await created.json()).id as string;
    await page.goto(`/inbox?c=${id}`); await ready(page, locale);
    const actions = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true });
    await actions.getByRole("button", { name: translate(locale, "message.action.book_appointment"), exact: true }).click();
    const modal = page.getByRole("dialog", { name: translate(locale, "appointment.new"), exact: true });
    const date = queueDate(90), time = "14:15";
    await expect(modal.locator("#appt-vehicle")).toHaveValue(person.vehicle_id);
    await modal.getByLabel(translate(locale, "appointment.date"), { exact: true }).fill(date);
    await modal.getByLabel(translate(locale, "appointment.time"), { exact: true }).fill(time);

    let posts = 0;
    await page.route("**/api/proxy/appointments/direct", async route => {
      posts++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed"); // the write commits but its response is lost
    });
    await modal.getByRole("button", { name: translate(locale, "appointment.book"), exact: true }).click();
    await expect(modal.getByRole("alert").filter({ hasText: translate(locale, "appointment.outcome_uncertain") })).toBeVisible();
    await page.reload(); // the recovery marker survives navigation and blocks a blind repost
    await ready(page, locale);
    const reopenedActions = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true });
    await reopenedActions.getByRole("button", { name: translate(locale, "message.action.book_appointment"), exact: true }).click();
    await expect(modal.getByRole("alert").filter({ hasText: translate(locale, "appointment.outcome_uncertain") })).toBeVisible();
    const check = modal.getByRole("button", { name: translate(locale, "appointment.check_schedule"), exact: true });
    await check.click();
    await expect(modal.getByRole("alert").filter({ hasText: translate(locale, "appointment.outcome_found") })).toBeVisible();
    expect(posts).toBe(1);
    await expect(modal.getByRole("button", { name: translate(locale, "appointment.book"), exact: true })).toBeDisabled();
    await modal.getByRole("button", { name: translate(locale, "common.close"), exact: true }).click();
    await expect(modal).toHaveCount(0);
    await queueTargets(page, actions); await queueOverflow(page);
    await assertAccessible(page, info, `booking-lost-response-${locale}-${width}`);
  });
}

test("Inbox booking stays blocked after an empty reconciliation until a separate action is chosen", async ({ page, baseURL }) => {
  const { profile } = await queueLogin(page, baseURL!, "en", 390);
  const person = await queueCustomer(page, profile);
  const created = await page.request.post("/api/proxy/conversations", { data: {
    customer_id: person.customer_id, vehicle_id: person.vehicle_id,
  } });
  expect(created.status()).toBe(201); const id = (await created.json()).id as string;
  await page.goto(`/inbox?c=${id}`); await ready(page, "en");
  const actions = page.getByRole("region", { name: translate("en", "message.quick_actions"), exact: true });
  await actions.getByRole("button", { name: translate("en", "message.action.book_appointment"), exact: true }).click();
  const modal = page.getByRole("dialog", { name: translate("en", "appointment.new"), exact: true });
  await expect(modal.locator("#appt-vehicle")).toHaveValue(person.vehicle_id);
  await modal.getByLabel(translate("en", "appointment.date"), { exact: true }).fill(queueDate(91));
  await modal.getByLabel(translate("en", "appointment.time"), { exact: true }).fill("15:10");

  let posts = 0;
  await page.route("**/api/proxy/appointments/direct", async route => { posts++; await route.abort("failed"); });
  const submit = modal.getByRole("button", { name: translate("en", "appointment.book"), exact: true });
  await submit.click();
  await expect(modal.getByRole("alert").filter({ hasText: translate("en", "appointment.outcome_uncertain") })).toBeVisible();
  await modal.getByRole("button", { name: translate("en", "appointment.check_schedule"), exact: true }).click();
  await expect(modal.getByRole("alert").filter({ hasText: translate("en", "appointment.outcome_not_found") })).toBeVisible();
  await expect(submit).toBeDisabled(); expect(posts).toBe(1);
  await modal.getByRole("button", { name: translate("en", "appointment.allow_separate_booking"), exact: true }).click();
  await expect(submit).toBeEnabled(); expect(posts).toBe(1);
  await submit.click(); // only this new deliberate action may send another request
  await expect.poll(() => posts).toBe(2);
  await expect(modal.getByRole("alert").filter({ hasText: translate("en", "appointment.outcome_uncertain") })).toBeVisible();
});

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  test(`Inbox estimate captures its customer and reconciles a lost response without reposting ${locale}/${width}`, async ({ page, baseURL }, info) => {
    const { profile } = await queueLogin(page, baseURL!, locale, width);
    const person = await queueCustomer(page, profile);
    const created = await page.request.post("/api/proxy/conversations", { data: {
      customer_id: person.customer_id, vehicle_id: person.vehicle_id,
    } });
    expect(created.status()).toBe(201); const id = (await created.json()).id as string;
    await page.goto(`/inbox?c=${id}`); await ready(page, locale);
    const actions = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true });
    await actions.getByRole("button", { name: translate(locale, "message.action.create_estimate"), exact: true }).click();
    const modal = page.getByRole("dialog", { name: translate(locale, "invoice.new_estimate"), exact: true });
    await expect(modal.locator("#inv-vehicle")).toHaveValue(person.vehicle_id);
    await modal.getByLabel(translate(locale, "invoice.description"), { exact: true }).fill("Inbox diagnostic estimate");
    await modal.getByLabel(translate(locale, "invoice.price"), { exact: true }).fill("72500");

    let posts = 0;
    await page.route("**/api/proxy/invoices", async route => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      const body = route.request().postDataJSON() as { kind: string; customer_id: string; vehicle_id: string | null };
      expect(body).toMatchObject({ kind: "estimate", customer_id: person.customer_id, vehicle_id: person.vehicle_id });
      await route.abort("failed");
    });
    await modal.getByRole("button", { name: translate(locale, "invoice.create_estimate"), exact: true }).click();
    await expect(modal.getByRole("alert").filter({ hasText: translate(locale, "invoice.outcome_uncertain") })).toBeVisible();
    await page.reload();
    await ready(page, locale);
    const reopenedActions = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true });
    await reopenedActions.getByRole("button", { name: translate(locale, "message.action.create_estimate"), exact: true }).click();
    await expect(modal.getByRole("alert").filter({ hasText: translate(locale, "invoice.outcome_uncertain") })).toBeVisible();
    await modal.getByRole("button", { name: translate(locale, "invoice.check_estimates"), exact: true }).click();
    await expect(modal.getByRole("alert").filter({ hasText: translate(locale, "invoice.outcome_found") })).toBeVisible();
    expect(posts).toBe(1);
    await expect(modal.getByRole("button", { name: translate(locale, "invoice.create_estimate"), exact: true })).toBeDisabled();
    await modal.getByRole("button", { name: translate(locale, "common.close"), exact: true }).click();
    await queueTargets(page, reopenedActions); await queueOverflow(page);
    await assertAccessible(page, info, `estimate-lost-response-${locale}-${width}`);
  });
}

test("Inbox estimate stays blocked after an empty reconciliation until a separate action is chosen", async ({ page, baseURL }) => {
  const { profile } = await queueLogin(page, baseURL!, "en", 390);
  const person = await queueCustomer(page, profile);
  const created = await page.request.post("/api/proxy/conversations", { data: {
    customer_id: person.customer_id, vehicle_id: person.vehicle_id,
  } });
  expect(created.status()).toBe(201); const id = (await created.json()).id as string;
  await page.goto(`/inbox?c=${id}`); await ready(page, "en");
  const actions = page.getByRole("region", { name: translate("en", "message.quick_actions"), exact: true });
  await actions.getByRole("button", { name: translate("en", "message.action.create_estimate"), exact: true }).click();
  const modal = page.getByRole("dialog", { name: translate("en", "invoice.new_estimate"), exact: true });
  await modal.locator("#inv-vehicle").selectOption(person.vehicle_id);
  await modal.getByLabel(translate("en", "invoice.description"), { exact: true }).fill("Separate diagnostic estimate");
  await modal.getByLabel(translate("en", "invoice.price"), { exact: true }).fill("81000");

  let posts = 0;
  await page.route("**/api/proxy/invoices", async route => {
    if (route.request().method() !== "POST") return route.continue();
    posts++; await route.abort("failed");
  });
  const submit = modal.getByRole("button", { name: translate("en", "invoice.create_estimate"), exact: true });
  await submit.click();
  await expect(modal.getByRole("alert").filter({ hasText: translate("en", "invoice.outcome_uncertain") })).toBeVisible();
  await modal.getByRole("button", { name: translate("en", "invoice.check_estimates"), exact: true }).click();
  await expect(modal.getByRole("alert").filter({ hasText: translate("en", "invoice.outcome_not_found") })).toBeVisible();
  await expect(submit).toBeDisabled(); expect(posts).toBe(1);
  await modal.getByRole("button", { name: translate("en", "invoice.allow_separate_estimate"), exact: true }).click();
  await expect(submit).toBeEnabled(); expect(posts).toBe(1);
  await submit.click();
  await expect.poll(() => posts).toBe(2);
  await expect(modal.getByRole("alert").filter({ hasText: translate("en", "invoice.outcome_uncertain") })).toBeVisible();
});

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  test(`Inbox service case captures its customer and reconciles a lost response without reposting ${locale}/${width}`, async ({ page, baseURL }, info) => {
    const { profile } = await queueLogin(page, baseURL!, locale, width);
    const person = await queueCustomer(page, profile);
    const created = await page.request.post("/api/proxy/conversations", { data: {
      customer_id: person.customer_id, vehicle_id: person.vehicle_id,
    } });
    expect(created.status()).toBe(201); const id = (await created.json()).id as string;
    await page.goto(`/inbox?c=${id}`); await ready(page, locale);
    const actions = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true });
    await actions.getByRole("button", { name: translate(locale, "message.action.open_case"), exact: true }).click();
    const modal = page.getByRole("dialog", { name: translate(locale, "message.case_new"), exact: true });
    await expect(modal.getByText(person.name, { exact: true })).toBeVisible();
    await expect(modal.locator("select").last()).toHaveValue(person.vehicle_id);
    const title = `QA39 Inbox case ${randomUUID()}`;
    await modal.getByLabel(translate(locale, "message.case_title"), { exact: true }).fill(title);
    await modal.getByLabel(translate(locale, "message.case_description"), { exact: true }).fill("Vehicle is making a reported grinding sound.");
    await modal.getByLabel(translate(locale, "message.case_location"), { exact: true }).fill("Service entrance");

    let posts = 0;
    await page.route("**/api/proxy/cases", async route => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      const response = await route.fetch(); expect(response.status()).toBe(201);
      const body = route.request().postDataJSON() as { customer_id: string; vehicle_id: string; case_type: string; title: string };
      expect(body).toMatchObject({ customer_id: person.customer_id, vehicle_id: person.vehicle_id, case_type: "emergency", title });
      await route.abort("failed");
    });
    await modal.getByRole("button", { name: translate(locale, "message.case_create"), exact: true }).click();
    await expect(modal.getByRole("alert").filter({ hasText: translate(locale, "message.case_outcome_uncertain") })).toBeVisible();
    await page.reload(); await ready(page, locale);
    const reopenedActions = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true });
    await reopenedActions.getByRole("button", { name: translate(locale, "message.action.open_case"), exact: true }).click();
    await expect(modal.getByRole("alert").filter({ hasText: translate(locale, "message.case_outcome_uncertain") })).toBeVisible();
    await modal.getByRole("button", { name: translate(locale, "message.case_check"), exact: true }).click();
    await expect(modal.getByRole("alert").filter({ hasText: translate(locale, "message.case_outcome_found") })).toBeVisible();
    await expect(modal.getByRole("link").filter({ hasText: "OPS-" })).toBeVisible();
    expect(posts).toBe(1);
    await queueTargets(page, reopenedActions); await queueOverflow(page);
    await assertAccessible(page, info, `case-lost-response-${locale}-${width}`);
  });
}

test("Inbox case remains blocked after an empty reconciliation until a separate action is chosen", async ({ page, baseURL }) => {
  const { profile } = await queueLogin(page, baseURL!, "en", 390);
  const person = await queueCustomer(page, profile);
  const created = await page.request.post("/api/proxy/conversations", { data: {
    customer_id: person.customer_id, vehicle_id: person.vehicle_id,
  } });
  expect(created.status()).toBe(201); const id = (await created.json()).id as string;
  await page.goto(`/inbox?c=${id}`); await ready(page, "en");
  const actions = page.getByRole("region", { name: translate("en", "message.quick_actions"), exact: true });
  await actions.getByRole("button", { name: translate("en", "message.action.open_case"), exact: true }).click();
  const modal = page.getByRole("dialog", { name: translate("en", "message.case_new"), exact: true });
  await modal.getByLabel(translate("en", "message.case_title"), { exact: true }).fill(`QA39 absent case ${randomUUID()}`);
  await modal.getByLabel(translate("en", "message.case_description"), { exact: true }).fill("A recorded service concern.");
  let posts = 0;
  await page.route("**/api/proxy/cases", async route => {
    if (route.request().method() !== "POST") return route.continue();
    posts++; await route.abort("failed");
  });
  const submit = modal.getByRole("button", { name: translate("en", "message.case_create"), exact: true });
  await submit.click();
  await expect(modal.getByRole("alert").filter({ hasText: translate("en", "message.case_outcome_uncertain") })).toBeVisible();
  await modal.getByRole("button", { name: translate("en", "message.case_check"), exact: true }).click();
  await expect(modal.getByRole("alert").filter({ hasText: translate("en", "message.case_outcome_not_found") })).toBeVisible();
  await expect(submit).toBeDisabled(); expect(posts).toBe(1);
  await modal.getByRole("button", { name: translate("en", "message.case_allow_separate"), exact: true }).click();
  await expect(submit).toBeEnabled(); expect(posts).toBe(1);
  await submit.click(); await expect.poll(() => posts).toBe(2);
  await expect(modal.getByRole("alert").filter({ hasText: translate("en", "message.case_outcome_uncertain") })).toBeVisible();
});

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  test(`Inbox export re-reads and downloads only the authorized conversation in UTF-8 JSON ${locale}/${width}`, async ({ page, baseURL }, info) => {
    await queueLogin(page, baseURL!, locale, width);
    const target = await createThread(page), marker = `QA39 export ${randomUUID()}`;
    const posted = await page.request.post(`/api/proxy/conversations/${target.id}/messages`, { data: {
      body: marker, channel: "web", author_role: "dispatcher", is_internal: true,
      attachments: [{ kind: "photo", label: "Recorded photo", url: "https://example.invalid/?access_token=do-not-export", meta: { key: "do-not-export" } }],
    } });
    expect(posted.status()).toBe(201);
    await page.goto(`/inbox?c=${target.id}`); await ready(page, locale);
    const actions = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true });
    let refreshes = 0;
    page.on("response", response => {
      if (response.request().method() === "GET" && new URL(response.url()).pathname === `/api/proxy/conversations/${target.id}`) refreshes++;
    });
    const downloadPromise = page.waitForEvent("download");
    await actions.getByRole("button", { name: translate(locale, "message.action.export_thread"), exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`garageos-inbox-${target.id}.json`);
    const stream = await download.createReadStream(); expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8"), exported = JSON.parse(raw);
    expect(exported.format).toBe("garageos.inbox-thread.v1");
    expect(exported.conversation.id).toBe(target.id);
    expect(exported.messages.some((message: { body: string }) => message.body === marker)).toBe(true);
    expect(exported.activity.find((entry: { detail: string }) => entry.detail === marker)).toMatchObject({
      id: expect.any(String), type: "message", date: expect.any(String),
    });
    expect(exported.messages[0].attachments).toEqual([{ id: expect.any(String), kind: "photo", label: "Recorded photo" }]);
    expect(raw).not.toContain("do-not-export"); expect(raw).not.toContain("read_observation");
    expect(refreshes).toBeGreaterThan(0);
    await expect(page.getByRole("status").filter({ hasText: translate(locale, "message.action.export_downloaded") })).toBeVisible();
    await queueTargets(page, actions); await queueOverflow(page);
    await assertAccessible(page, info, `thread-export-${locale}-${width}`);
  });
}

test("Inbox export reports a failed fresh read without creating a file", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 390);
  const target = await createThread(page);
  await page.goto(`/inbox?c=${target.id}`); await ready(page, "en");
  await page.route(`**/api/proxy/conversations/${target.id}`, route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  let downloads = 0; page.on("download", () => { downloads++; });
  const actions = page.getByRole("region", { name: translate("en", "message.quick_actions"), exact: true });
  await actions.getByRole("button", { name: translate("en", "message.action.export_thread"), exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "message.action.export_failed") })).toBeVisible();
  expect(downloads).toBe(0);
});

test("read-only staff can export an authorized thread without enabling mutations", async ({ page, baseURL }) => {
  queueProfiles(baseURL!);
  expect((await page.request.post("/api/auth/login", { data: {
    email: "admin@demo.garageos.app", password: "parol12345",
  } })).ok()).toBeTruthy();
  const target = await createThread(page), marker = `QA39 readonly export ${randomUUID()}`;
  const posted = await page.request.post(`/api/proxy/conversations/${target.id}/messages`, { data: {
    body: marker, channel: "web", author_role: "dispatcher", is_internal: true,
  } });
  expect(posted.status()).toBe(201);
  const demoToken = await freshOperationsDemoToken(page, baseURL!);
  await page.context().addCookies([
    { name: "garageos_token", value: demoToken, url: baseURL!, httpOnly: true },
    { name: "garageos_demo", value: "1", url: baseURL!, httpOnly: true },
    { name: "garageos_locale", value: "en", url: baseURL! },
  ]);
  const me = await (await page.request.get("/api/proxy/auth/me")).json();
  expect(me.permissions).toEqual(["staff.read"]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/inbox?c=${target.id}`);
  await expect(page.getByRole("heading", { name: target.subject, exact: true })).toBeVisible();
  const actions = page.getByRole("region", { name: translate("en", "message.quick_actions"), exact: true });
  const exportButton = actions.getByRole("button", { name: translate("en", "message.action.export_thread"), exact: true });
  await expect(exportButton).toBeEnabled();
  await expect(page.getByRole("textbox", { name: translate("en", "ops.message"), exact: true })).toBeDisabled();
  await expect(status(page, "en")).toBeDisabled();

  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  const stream = await download.createReadStream(); expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported.conversation.id).toBe(target.id);
  expect(exported.messages.some((message: { body: string }) => message.body === marker)).toBe(true);
});

test("an export response arriving after leaving its thread cannot trigger a download", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const target = await createThread(page);
  await page.goto(`/inbox?c=${target.id}`); await ready(page, "en");
  let release!: () => void, seen!: () => void, finished!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { seen = resolve; });
  const completed = new Promise<void>(resolve => { finished = resolve; });
  await page.route(`**/api/proxy/conversations/${target.id}`, async route => {
    if (route.request().method() !== "GET") { await route.continue(); return; }
    const response = await route.fetch(); seen();
    try { await held; await route.fulfill({ response }); }
    finally { finished(); }
  });
  try {
    const actions = page.getByRole("region", { name: translate("en", "message.quick_actions"), exact: true });
    await actions.getByRole("button", { name: translate("en", "message.action.export_thread"), exact: true }).click();
    await requested;
    await page.getByRole("link", { name: translate("en", "nav.dashboard"), exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const downloaded = page.waitForEvent("download", { timeout: 1000 }).then(() => true, () => false);
    release(); await completed;
    expect(await downloaded).toBe(false);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  test(`Inbox request actions prepare localized editable drafts without sending ${locale}/${width}`, async ({ page, baseURL }, info) => {
    await queueLogin(page, baseURL!, locale, width);
    const target = await createThread(page), path = `/api/proxy/conversations/${target.id}/messages`;
    await page.goto(`/inbox?c=${target.id}`); await ready(page, locale);
    const message = page.getByRole("textbox", { name: translate(locale, "ops.message"), exact: true });
    const reply = page.getByRole("button", { name: translate(locale, "message.reply"), exact: true });
    const note = page.getByRole("button", { name: translate(locale, "message.note"), exact: true });
    const actions = page.getByRole("region", { name: translate(locale, "message.quick_actions"), exact: true });
    await expect(actions.getByRole("note", { name: translate(locale, "message.action.appointment_unavailable"), exact: true })).toBeVisible();
    await expect(actions.getByRole("note", { name: translate(locale, "message.action.estimate_unavailable"), exact: true })).toBeVisible();
    await expect(actions.getByRole("note", { name: translate(locale, "message.action.case_unavailable"), exact: true })).toBeVisible();
    let sends = 0;
    page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(path)) sends++; });

    await note.click(); await message.fill("Internal note must remain separate.");
    const existingReply = "Existing customer reply  \n";
    await reply.click(); await message.fill(existingReply);
    await actions.getByRole("button", { name: translate(locale, "message.action.request_photos"), exact: true }).click();
    const photoDraft = `${existingReply}\n\n${translate(locale, "message.action.request_photos_draft")}`;
    await expect(reply).toHaveAttribute("aria-pressed", "true"); await expect(message).toHaveValue(photoDraft);
    await note.click(); await expect(message).toHaveValue("Internal note must remain separate.");
    await reply.click(); await expect(message).toHaveValue(photoDraft);
    await actions.getByRole("button", { name: translate(locale, "message.action.request_location"), exact: true }).click();
    await expect(message).toHaveValue(`${photoDraft}\n\n${translate(locale, "message.action.request_location_draft")}`);
    expect(sends).toBe(0); // both actions only prepare editable text; #38 owns deliberate sending
    await queueTargets(page, actions); await queueOverflow(page);
    await assertAccessible(page, info, `request-drafts-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`request-drafts-${locale}-${width}.png`), fullPage: true });
  });
}

test("Inbox repeated keyboard follow dispatches once while the real captured request is pending", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const target = await createThread(page), path = `/api/proxy/conversations/${target.id}/follow`;
  await page.goto(`/inbox?c=${target.id}`);
  await expect(page.getByRole("status").filter({ hasText: translate("en", "inbox.read.acknowledged") })).toBeVisible();
  const follow = page.getByRole("button", { name: "Follow", exact: true }); await expect(follow).toBeEnabled();
  let requests = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${path}`, async route => {
    requests++; await gate;
    const response = await route.fetch(); expect(response.status()).toBe(200); await route.fulfill({ response });
  });
  try {
    await follow.click(); await expect.poll(() => requests).toBe(1);
    await page.getByRole("region", { name: "Conversation overview", exact: true }).focus();
    await page.keyboard.press("f"); await page.keyboard.press("f");
    expect((await stored(page, target.id)).is_following).toBe(false);
    expect(requests).toBe(1);
    await expect(follow).toBeDisabled();
    release(); await expect.poll(async () => (await stored(page, target.id)).is_following).toBe(true);
    await expect(page.getByRole("button", { name: "Following", exact: true })).toBeEnabled();
    expect(requests).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const) {
  for (const outcome of ["rejected", "lost"] as const) {
    test(`Inbox ${outcome} status requires deliberate reconciliation ${locale}/${width}`, async ({ page, baseURL }, info) => {
      await queueLogin(page, baseURL!, locale, width); await page.setViewportSize({ width, height: 568 });
      const target = await createThread(page), path = `/api/proxy/conversations/${target.id}`;
      let writes = 0, following = 0;
      page.on("request", request => {
        if (request.method() === "PATCH" && request.url().endsWith(path) && request.postDataJSON().status) writes++;
        if (["POST", "DELETE"].includes(request.method()) && request.url().endsWith(`${path}/follow`)) following++;
      });
      await page.goto(`/inbox?c=${target.id}`); await ready(page, locale);
      let handled = false;
      await page.route(`**${path}`, async route => {
        if (route.request().method() !== "PATCH" || !route.request().postDataJSON().status || handled) return route.continue();
        handled = true;
        const response = await route.fetch(outcome === "rejected" ? { postData: JSON.stringify({ status: "not-a-valid-status" }) } : {});
        expect(response.status()).toBe(outcome === "rejected" ? 422 : 200);
        if (outcome === "lost") await route.abort("failed"); else await route.fulfill({ response });
      });
      await status(page, locale).selectOption("resolved");
      const error = notice(page, locale, outcome === "lost" ? "uncertain" : "error"); await expect(error).toBeVisible();
      const message = page.getByRole("textbox", { name: translate(locale, "ops.message"), exact: true });
      const draft = `Kept <draft> Очень длинный ${randomUUID()}`; await message.fill(draft);
      const before = await stored(page, target.id); expect(before.status).toBe(outcome === "lost" ? "resolved" : "open");
      await expect(status(page, locale)).toBeDisabled();
      await page.getByRole("button", { name: translate(locale, "message.context"), exact: true }).click();
      await expect(page.locator("aside").getByRole("button", { name: translate(locale, "message.follow"), exact: true })).toBeDisabled();
      await page.getByRole("button", { name: translate(locale, "inbox.action.close_context"), exact: true }).click();
      await page.getByRole("region", { name: translate(locale, "message.overview"), exact: true }).focus();
      await page.keyboard.press("f"); // the keyboard shortcut must share the guard
      expect(writes).toBe(1); expect(following).toBe(0);
      const reconcile = error.getByRole("button", { name: translate(locale, "inbox.action.reconcile"), exact: true });
      await assertKeyboardFocus(page, reconcile); await queueTargets(page, error); await queueOverflow(page);
      await assertAccessible(page, info, `action-${outcome}-${locale}-${width}`);
      await page.screenshot({ path: info.outputPath(`action-${outcome}-${locale}-${width}.png`), fullPage: true });
      await reconcile.click(); await expect(notice(page, locale, "ready")).toBeVisible();
      await expect(status(page, locale)).toHaveValue(before.status); await expect(message).toHaveValue(draft);
      expect(writes).toBe(1); expect(following).toBe(0); // checking never repeats a write
      await status(page, locale).selectOption(outcome === "lost" ? "open" : "waiting_customer");
      await expect(notice(page, locale, "acknowledged")).toBeVisible();
      await expect(status(page, locale)).toBeEnabled();
      expect(writes).toBe(2); expect((await stored(page, target.id)).status).toBe(outcome === "lost" ? "open" : "waiting_customer");
      await expect(message).toHaveValue(draft);
    });
  }

  test(`Inbox six recorded statuses and self-assignment stay distinct from following ${locale}/${width}`, async ({ page, baseURL }, info) => {
    await queueLogin(page, baseURL!, locale, width); await page.setViewportSize({ width, height: 568 });
    const target = await createThread(page), me = await page.request.get("/api/proxy/auth/me");
    expect(me.status()).toBe(200); const actor = (await me.json()).id as string;
    await page.goto(`/inbox?c=${target.id}`); await ready(page, locale);
    await page.getByRole("button", { name: translate(locale, "inbox.action.assign_me"), exact: true }).click();
    await expect.poll(async () => (await stored(page, target.id)).assigned_user_id).toBe(actor);
    await expect(status(page, locale)).toBeEnabled();
    let current = await stored(page, target.id); expect(current.assigned_user_id).toBe(actor); expect(current.is_following).toBe(false);
    await page.getByRole("button", { name: translate(locale, "message.follow"), exact: true }).click();
    await expect(page.getByRole("button", { name: translate(locale, "message.following"), exact: true })).toBeEnabled();
    current = await stored(page, target.id); expect(current.assigned_user_id).toBe(actor); expect(current.is_following).toBe(true);
    await page.getByRole("button", { name: translate(locale, "inbox.action.clear_assignment"), exact: true }).click();
    await expect.poll(async () => (await stored(page, target.id)).assigned_user_id).toBeNull();
    await expect(status(page, locale)).toBeEnabled();
    current = await stored(page, target.id); expect(current.assigned_user_id).toBeNull(); expect(current.is_following).toBe(true);
    for (const value of ["waiting_customer", "waiting_technician", "waiting_approval", "snoozed", "resolved", "open"]) {
      await status(page, locale).selectOption(value); await expect(status(page, locale)).toBeEnabled();
      await expect.poll(async () => (await stored(page, target.id)).status).toBe(value);
      await expect(status(page, locale)).toHaveValue(value);
      current = await stored(page, target.id); expect(current.status).toBe(value); expect(current.is_following).toBe(true);
    }
    await withFailureDiagnostics(page, info, "inbox-final-unfollow", async () => {
      await page.getByRole("button", { name: translate(locale, "message.following"), exact: true }).click();
      await expect(page.getByRole("button", { name: translate(locale, "message.follow"), exact: true })).toBeEnabled();
    }, { targetPath: `/api/proxy/conversations/${target.id}/follow`,
      followingLabel: translate(locale, "message.following") });
    current = await stored(page, target.id); expect(current.is_following).toBe(false); expect(current.assigned_user_id).toBeNull();
    await queueOverflow(page); await queueTargets(page, page.locator("main"));
    await assertAccessible(page, info, `action-states-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`action-states-${locale}-${width}.png`), fullPage: true });
  });
}

test("Inbox held A follow owns A while B remains ready and A-to-B-to-A preserves drafts and locale", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1920);
  const a = await createThread(page), b = await createThread(page), path = `/api/proxy/conversations/${a.id}/follow`;
  await page.goto(`/inbox?c=${a.id}`); await ready(page, "en");
  const message = () => page.getByRole("textbox", { name: translate("en", "ops.message"), exact: true });
  await message().fill("A retained draft");
  let release!: () => void, held = false, requests = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${path}`, async route => {
    requests++; held = true; await gate;
    const response = await route.fetch(); expect(response.status()).toBe(200); await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Follow", exact: true }).click(); await expect.poll(() => held).toBe(true);
    await page.keyboard.press("f"); expect(requests).toBe(1);
    await selectRecordedQueueThread(page, b, a.subject); await ready(page, "en"); await message().fill("B independent draft");
    await expect(page.getByRole("button", { name: "Follow", exact: true })).toBeEnabled();
    await selectRecordedQueueThread(page, a, b.subject); await expect(notice(page, "en", "pending")).toBeVisible();
    await expect(message()).toHaveValue("A retained draft"); await expect(status(page, "en")).toBeDisabled();
    await page.getByRole("button", { name: translate("en", "message.context"), exact: true }).click();
    await expect(page.locator("aside").getByRole("button", { name: "Follow", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: translate("en", "inbox.action.close_context"), exact: true }).click();
    await page.keyboard.press("f"); expect(requests).toBe(1);
    await switchQueueLocale(page, "en", "ru"); await expect(notice(page, "ru", "pending")).toBeVisible();
    await switchQueueLocale(page, "ru", "en"); await selectRecordedQueueThread(page, b, a.subject); await ready(page, "en");
    release();
    await expect.poll(async () => (await stored(page, a.id)).is_following).toBe(true);
    await expect(message()).toHaveValue("B independent draft"); await expect(status(page, "en")).toBeEnabled();
    expect((await stored(page, b.id)).is_following).toBe(false);
    await selectRecordedQueueThread(page, a, b.subject); await expect(notice(page, "en", "acknowledged")).toBeVisible();
    await expect(status(page, "en")).toBeDisabled();
    await page.getByRole("button", { name: "Check current conversation", exact: true }).click(); await expect(status(page, "en")).toBeEnabled();
    await expect(message()).toHaveValue("A retained draft"); expect(requests).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Inbox committed status stays acknowledged after failed detail and queue refresh", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const target = await createThread(page), path = `/api/proxy/conversations/${target.id}`;
  await page.goto(`/inbox?c=${target.id}`); await ready(page, "en");
  let committed = false, writes = 0;
  await page.route("**/api/proxy/conversations?**", route => committed ? route.abort("failed") : route.continue());
  await page.route(`**${path}`, async route => {
    if (route.request().method() === "GET") return committed ? route.abort("failed") : route.continue();
    if (!route.request().postDataJSON().status) return route.continue();
    writes++; const response = await route.fetch(); expect(response.status()).toBe(200);
    committed = true; await route.fulfill({ response });
  });
  await status(page, "en").selectOption("waiting_customer");
  await expect(notice(page, "en", "acknowledged")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "message.read_error") })).toBeVisible();
  await expect(status(page, "en")).toBeDisabled();
  expect((await stored(page, target.id)).status).toBe("waiting_customer"); // APIRequestContext reads bypass page routing
  committed = false;
  await page.getByRole("button", { name: "Check current conversation", exact: true }).click();
  await expect(notice(page, "en", "ready")).toBeVisible(); await expect(status(page, "en")).toHaveValue("waiting_customer");
  expect(writes).toBe(1);
});

test("Inbox lost follow response checks the recorded subscription before deliberate unfollow", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const target = await createThread(page), path = `/api/proxy/conversations/${target.id}/follow`;
  await page.goto(`/inbox?c=${target.id}`); await ready(page, "en");
  const methods: string[] = [];
  page.on("request", request => { if (request.url().endsWith(path)) methods.push(request.method()); });
  await page.route(`**${path}`, async route => {
    const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort("failed");
  }, { times: 1 });
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(notice(page, "en", "uncertain")).toBeVisible();
  expect((await stored(page, target.id)).is_following).toBe(true);
  await page.getByRole("region", { name: "Conversation overview", exact: true }).focus(); await page.keyboard.press("f");
  expect(methods).toEqual(["POST"]);
  await page.getByRole("button", { name: "Check current conversation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Following", exact: true })).toBeEnabled(); expect(methods).toEqual(["POST"]);
  await page.getByRole("button", { name: "Following", exact: true }).click();
  await expect(page.getByRole("button", { name: "Follow", exact: true })).toBeEnabled();
  expect(methods).toEqual(["POST", "DELETE"]); expect((await stored(page, target.id)).is_following).toBe(false);
});

test("Inbox status rechecks real authentication before dispatch and does not replay after verification", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const target = await createThread(page), path = `/api/proxy/conversations/${target.id}`;
  await page.goto(`/inbox?c=${target.id}`); await ready(page, "en");
  let writes = 0, deniedPreflights = 0, release!: () => void;
  const denials = new Promise<void>(resolve => { release = resolve; });
  page.on("request", request => { if (request.method() === "PATCH" && request.url().endsWith(path) && request.postDataJSON().status) writes++; });
  // Only the first genuine action preflight is held. Recovery reads use the
  // normal server; unrelated live reads must not race this handler's cleanup.
  await page.route(url => url.pathname === "/api/proxy/auth/me", async route => {
    expect(route.request().method()).toBe("GET");
    const response = await route.fetch(); expect(response.status()).toBe(401);
    deniedPreflights++; await denials; await route.fulfill({ response });
  }, { times: 1 });
  try {
    await page.context().addCookies([{ name: "garageos_token", value: "QA-invalidated-metadata-token", url: baseURL!, httpOnly: true }]);
    await status(page, "en").selectOption("resolved"); release();
    await expect.poll(() => deniedPreflights).toBe(1);
    await expect(page.getByRole("button", { name: "Verify session and access", exact: true })).toBeVisible();
    await expect(status(page, "en")).toHaveCount(0); expect(writes).toBe(0);
    await queueLogin(page, baseURL!, "en", 1280);
    await page.getByRole("button", { name: "Verify session and access", exact: true }).click(); await ready(page, "en");
    expect((await stored(page, target.id)).status).toBe("open"); expect(writes).toBe(0);
    await expect(notice(page, "en", "acknowledged")).toHaveCount(0);
    await status(page, "en").selectOption("resolved");
    await expect(notice(page, "en", "acknowledged")).toBeVisible();
    await expect.poll(async () => (await stored(page, target.id)).status).toBe("resolved"); expect(writes).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Inbox late A action denial cannot suspend a newly verified B actor", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280, 0); const a = await createThread(page);
  await queueLogin(page, baseURL!, "en", 1280, 1); const b = await createThread(page);
  await queueLogin(page, baseURL!, "en", 1280, 0);
  await page.goto(`/inbox?c=${a.id}`); await ready(page, "en");
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), fetched = new Promise<void>(resolve => { seen = resolve; });
  const path = `/api/proxy/conversations/${a.id}/follow`;
  await page.route(`**${path}`, async route => {
    const response = await route.fetch({ headers: { ...route.request().headers(), cookie: "garageos_token=QA-invalidated-old-action" } });
    expect(response.status()).toBe(401); seen(); await held; await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Follow", exact: true }).click(); await fetched;
    await queueLogin(page, baseURL!, "en", 1280, 1);
    const message = page.getByRole("textbox", { name: "Message", exact: true });
    await message.fill(`A identity-change probe ${randomUUID()}`); await message.press("Enter");
    await expect(page.getByRole("button", { name: "Verify session and access", exact: true })).toBeVisible();
    await page.evaluate(id => history.pushState(null, "", `/inbox?c=${id}`), b.id);
    await page.getByRole("button", { name: "Verify session and access", exact: true }).click(); await ready(page, "en");
    await message.fill("B newly verified draft");
    const oldResponse = page.waitForResponse(response => response.url().endsWith(path) && response.status() === 401);
    release(); await (await oldResponse).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(message).toHaveValue("B newly verified draft"); await expect(status(page, "en")).toBeEnabled();
    await expect(page.getByRole("button", { name: "Verify session and access", exact: true })).toHaveCount(0);
    await expect(notice(page, "en", "pending")).toHaveCount(0); expect((await stored(page, b.id)).is_following).toBe(false);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});
