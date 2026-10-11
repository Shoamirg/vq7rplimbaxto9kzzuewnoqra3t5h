import { expect, test, type Page, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueLogin, queueCustomer, queueJob, queueDate, queueOverflow, queueTargets, switchQueueLocale } from "./support/queue";
import { assertAccessible, assertKeyboardFocus } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

// Prepared before implementation; expanded against28d6542. Collection is not runtime proof.
test.use({ trace: "off" });
const createPath = "/api/proxy/conversations";
type Kind = "customer" | "vehicle" | "appointment" | "case" | "invoice" | "assignee";
const kinds: Kind[] = ["customer", "vehicle", "appointment", "case", "invoice", "assignee"];
const label = (locale: Locale, key: string) => {
  const value = translate(locale, key);
  // The English owning baseline must look for the actual requested control,
  // even before its new dictionary entry exists. Other strings use real locales.
  return locale === "en" && key === "inbox.create.title" && value === key ? "New conversation" : value;
};
const form = (page: Page, locale: Locale) => page.getByRole("dialog", { name: label(locale, "inbox.create.title"), exact: true });
const createNotice = (root: Locator, locale: Locale, state: string) => root.getByRole(state === "uncertain" || state === "error" ? "alert" : "status")
  .filter({ hasText: label(locale, `inbox.create.${state}`) });

async function openForm(page: Page, locale: Locale) {
  await page.getByRole("button", { name: label(locale, "inbox.create.title"), exact: true }).click();
  const root = form(page, locale); await expect(root).toBeVisible(); return root;
}
async function choose(page: Page, locale: Locale, kind: Kind, id: string) {
  const root = form(page, locale), field = label(locale, `inbox.choice.${kind}`);
  await root.getByRole("button", { name: field, exact: true }).click();
  const picker = page.getByRole("dialog").filter({ has: page.getByRole("textbox", { name: label(locale, "inbox.choice.search"), exact: true }) });
  await picker.getByRole("textbox", { name: label(locale, "inbox.choice.search"), exact: true }).fill(id);
  const option = picker.getByRole("button").filter({ has: page.getByText(id, { exact: true }) });
  await expect(option).toHaveCount(1); await option.click();
  await expect(root).toBeVisible(); await expect(root.getByText(id, { exact: true })).toBeVisible();
}
async function stored(page: Page, id: string) {
  const response = await page.request.get(`${createPath}/${id}`);
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

async function seedContext(page: Page, baseURL: string, locale: Locale, width: number) {
  const { profile, owner } = await queueLogin(page, baseURL, locale, width);
  const person = await queueCustomer(page, profile);
  const appointment = await queueJob(page, person, queueDate(75));
  const caseResponse = await page.request.post("/api/proxy/cases", { data: {
    customer_id: person.customer_id, vehicle_id: person.vehicle_id,
    title: "Recorded choice " + randomUUID(), case_type: "support" } });
  expect(caseResponse.status()).toBe(201); const caseId = (await caseResponse.json()).id as string;
  expect((await page.request.patch(`/api/proxy/cases/${caseId}`, { data: { status: "in_progress" } })).status()).toBe(200);
  const invoiceResponse = await page.request.post("/api/proxy/invoices", { data: {
    kind: "estimate", customer_id: person.customer_id, vehicle_id: person.vehicle_id,
    appointment_id: appointment, case_id: caseId } });
  expect(invoiceResponse.status()).toBe(201); const invoice = (await invoiceResponse.json()).id as string;
  const staffResponse = await page.request.post("/api/proxy/staff", { data: {
    full_name: "Recorded choice manager " + randomUUID(), email: randomUUID() + "@example.com",
    role: "manager", password: owner.password } });
  expect(staffResponse.status()).toBe(201); const assignee = (await staffResponse.json()).id as string;
  return { customer: person.customer_id, vehicle: person.vehicle_id, appointment, case: caseId, invoice, assignee };
}

for (const locale of ["uz", "en", "ru"] as const) {
  for (const width of [360, 390, 1280]) {
    for (const theme of ["light", "dark"] as const) {
      test(`Inbox creates all six actual references ${locale}/${width}/${theme}`, async ({ page, baseURL }, info) => {
        const refs = await seedContext(page, baseURL!, locale, width);
        await page.setViewportSize({ width, height: 568 });
        await page.addInitScript(value => localStorage.setItem("garageos-theme", value), theme);
        await page.goto("/inbox"); await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
        const root = await openForm(page, locale);
        expect(label(locale, "inbox.create.subject")).not.toBe("inbox.create.subject");
        const subject = `QA39 Create ${randomUUID()} <literal> Очень длинный O‘tkir`;
        await root.getByRole("textbox", { name: label(locale, "inbox.create.subject"), exact: true }).fill(subject);
        await root.getByRole("combobox", { name: label(locale, "inbox.create.type"), exact: true }).selectOption("support");
        await root.getByRole("combobox", { name: label(locale, "inbox.create.priority"), exact: true }).selectOption("high");
        for (const kind of kinds) await choose(page, locale, kind, refs[kind]);
        await queueOverflow(page); await queueTargets(page, root);
        const submit = root.getByRole("button", { name: label(locale, "inbox.create.submit"), exact: true });
        await assertKeyboardFocus(page, submit);
        await assertAccessible(page, info, `create-form-${locale}-${width}-${theme}`);
        await page.screenshot({ path: info.outputPath(`create-form-${locale}-${width}-${theme}.png`), fullPage: true });
        const sent = page.waitForRequest(request => request.method() === "POST" && new URL(request.url()).pathname === createPath);
        await submit.click(); const request = await sent, payload = request.postDataJSON();
        expect(payload).toMatchObject({ subject, conv_type: "support", priority: "high",
          customer_id: refs.customer, vehicle_id: refs.vehicle, appointment_id: refs.appointment,
          case_id: refs.case, invoice_id: refs.invoice, assigned_user_id: refs.assignee });
        const createdResponse = await request.response(); expect(createdResponse).not.toBeNull();
        expect(createdResponse!.status()).toBe(201); const createdId = (await createdResponse!.json()).id as string;
        expect(createdId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        await expect(createNotice(root, locale, "acknowledged")).toBeVisible();
        const rows = await page.request.get(`${createPath}?view=all&q=${encodeURIComponent(subject)}`);
        expect(rows.status()).toBe(200); const pageData = await rows.json(); expect(pageData.total).toBe(1);
        const id = pageData.items[0].id as string; expect(id).toBe(createdId);
        await expect(root.getByText(id, { exact: true })).toBeVisible();
        const recorded = await stored(page, id);
        expect(recorded).toMatchObject({ subject, conv_type: "support", priority: "high", status: "open",
          customer_id: refs.customer, vehicle_id: refs.vehicle, appointment_id: refs.appointment,
          case_id: refs.case, invoice_id: refs.invoice, assigned_user_id: refs.assignee });
        const actualCase = await page.request.get(`/api/proxy/cases/${refs.case}`);
        expect(actualCase.status()).toBe(200); expect((await actualCase.json()).status).toBe("in_progress");
        await root.getByRole("button", { name: label(locale, "inbox.create.open_created"), exact: true }).click();
        await expect(page.getByRole("textbox", { name: label(locale, "ops.message"), exact: true })).toBeEnabled();
        await expect(page.getByRole("heading", { name: subject, exact: true })).toBeVisible();
      });
    }
  }
}

for (const matching of [0, 1, 2] as const) {
  test(`Inbox uncertain creation reconciles ${matching} possible matches without replay`, async ({ page, baseURL }) => {
    await queueLogin(page, baseURL!, "en", 1280); await page.goto("/inbox");
    const root = await openForm(page, "en"), subject = "QA39 uncertain create " + randomUUID();
    await root.getByRole("textbox", { name: label("en", "inbox.create.subject"), exact: true }).fill(subject);
    const saved: string[] = []; let posts = 0, checks = 0;
    page.on("request", request => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname === createPath) posts++;
      if (request.method() === "GET" && url.pathname === createPath && url.searchParams.get("q") === subject) checks++;
    });
    await page.route(`**${createPath}`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      if (matching) {
        const response = await route.fetch(); expect(response.status()).toBe(201); saved.push((await response.json()).id);
        if (matching === 2) {
          const second = await page.request.post(createPath, { data: route.request().postDataJSON() });
          expect(second.status()).toBe(201); saved.push((await second.json()).id);
        }
      }
      await route.abort("failed");
    }, { times: 1 });
    await root.getByRole("button", { name: label("en", "inbox.create.submit"), exact: true }).click();
    await expect(createNotice(root, "en", "uncertain")).toBeVisible();
    await expect(root.getByRole("textbox", { name: label("en", "inbox.create.subject"), exact: true })).toHaveValue(subject);
    await expect(root.getByRole("button", { name: label("en", "inbox.create.submit"), exact: true })).toBeDisabled();
    expect(posts).toBe(1); expect(checks).toBe(0);
    await root.getByRole("button", { name: label("en", "inbox.create.reconcile"), exact: true }).click();
    await expect(root.getByText(label("en", "inbox.create.possible_matches"), { exact: true })).toBeVisible();
    expect(checks).toBeGreaterThan(0); expect(posts).toBe(1);
    if (matching) {
      for (const id of saved) await expect(root.getByText(id, { exact: true })).toBeVisible();
      await expect(createNotice(root, "en", "acknowledged")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: subject, exact: true })).toHaveCount(0);
      const uuidText = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      const options = root.getByRole("button").filter({ has: page.getByText(uuidText, { exact: true }) });
      await expect(options).toHaveCount(matching);
      const chosen = options.last(), selected = await chosen.getByText(uuidText, { exact: true }).innerText();
      expect(saved).toContain(selected);
      if (matching === 2) expect(selected).not.toBe(await options.first().getByText(uuidText, { exact: true }).innerText());
      const opened = page.waitForResponse(response => response.request().method() === "GET"
        && new URL(response.url()).pathname === `${createPath}/${selected}`);
      await chosen.click(); const detail = await opened; expect(detail.status()).toBe(200);
      expect(await detail.json()).toMatchObject({ id: selected, subject });
      await expect(page.getByRole("heading", { name: subject, exact: true })).toBeVisible();
      // A normal UI mutation proves the active thread owns the chosen UUID,
      // rather than merely fetching it while displaying its identical sibling.
      const currentStatus = page.getByRole("combobox", { name: label("en", "inbox.action.status"), exact: true });
      await expect(currentStatus).toBeEnabled();
      const mutated = page.waitForResponse(response => response.request().method() === "PATCH"
        && new URL(response.url()).pathname === `${createPath}/${selected}`
        && response.request().postDataJSON().status === "waiting_customer");
      await currentStatus.selectOption("waiting_customer"); expect((await mutated).status()).toBe(200);
      const recorded = await stored(page, selected); expect(recorded).toMatchObject({ id: selected, subject, status: "waiting_customer" });
      for (const other of saved.filter(id => id !== selected)) expect((await stored(page, other)).status).toBe("open");
      expect(posts).toBe(1);
    } else {
      await expect(root.getByText(label("en", "inbox.create.no_possible_matches"), { exact: true })).toBeVisible();
      await expect(root.getByText(label("en", "inbox.create.duplicate_risk"), { exact: true })).toBeVisible();
      const again = root.getByRole("button", { name: label("en", "inbox.create.create_again"), exact: true });
      await expect(again).toBeDisabled(); await page.keyboard.press("Enter"); expect(posts).toBe(1);
      await root.getByRole("checkbox", { name: label("en", "inbox.create.acknowledge_risk"), exact: true }).check();
      await expect(again).toBeEnabled(); await again.click();
      await expect(createNotice(root, "en", "acknowledged")).toBeVisible(); expect(posts).toBe(2);
      const response = await page.request.get(`${createPath}?view=all&q=${encodeURIComponent(subject)}`);
      expect(response.status()).toBe(200); expect((await response.json()).total).toBe(1);
    }
  });
}

test("Inbox pending creation dispatches once and preserves B draft, locale and captured A form", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const seed = async () => {
    const subject = "QA39 create navigation " + randomUUID(), response = await page.request.post(createPath, { data: { subject } });
    expect(response.status()).toBe(201); return { subject, id: (await response.json()).id as string };
  };
  const a = await seed(), b = await seed(); await page.goto(`/inbox?c=${a.id}`);
  const composer = (locale: Locale) => page.getByRole("textbox", { name: label(locale, "ops.message"), exact: true });
  await expect(composer("en")).toBeEnabled(); await composer("en").fill("A retained creation-time draft");
  let root = await openForm(page, "en"), posts = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const subject = "QA39 captured creation " + randomUUID();
  await root.getByRole("textbox", { name: label("en", "inbox.create.subject"), exact: true }).fill(subject);
  await page.route(`**${createPath}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    posts++; await gate; const response = await route.fetch(); expect(response.status()).toBe(201); await route.fulfill({ response });
  });
  try {
    await root.getByRole("button", { name: label("en", "inbox.create.submit"), exact: true }).click();
    await expect.poll(() => posts).toBe(1); await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); expect(posts).toBe(1);
    await root.getByRole("button", { name: label("en", "common.close"), exact: true }).click();
    await selectRecordedQueueThread(page, b, a.subject);
    await expect(composer("en")).toBeEnabled(); await composer("en").fill("B independent draft");
    await switchQueueLocale(page, "en", "ru"); release();
    await expect(composer("ru")).toHaveValue("B independent draft");
    await expect(page.getByRole("heading", { name: b.subject, exact: true })).toBeVisible();
    root = await openForm(page, "ru"); await expect(createNotice(root, "ru", "acknowledged")).toBeVisible();
    await expect(root.getByRole("textbox", { name: label("ru", "inbox.create.subject"), exact: true })).toHaveValue(subject);
    expect(posts).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Inbox creation dialog traps focus, closes with Escape and restores opener and unsaved form", async ({ page, baseURL }, info) => {
  await queueLogin(page, baseURL!, "en", 390); await page.setViewportSize({ width: 390, height: 568 }); await page.goto("/inbox");
  const opener = page.getByRole("button", { name: label("en", "inbox.create.title"), exact: true });
  await assertKeyboardFocus(page, opener); let root = await openForm(page, "en");
  const input = root.getByRole("textbox", { name: label("en", "inbox.create.subject"), exact: true });
  await input.fill("Retained unsaved form <literal> Очень длинный");
  for (const direction of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press(direction);
      expect(await root.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
  }
  await queueTargets(page, root); await queueOverflow(page); await assertAccessible(page, info, "create-keyboard-phone");
  await page.keyboard.press("Escape"); await expect(root).toHaveCount(0); await expect(opener).toBeFocused();
  root = await openForm(page, "en");
  await expect(root.getByRole("textbox", { name: label("en", "inbox.create.subject"), exact: true })).toHaveValue("Retained unsaved form <literal> Очень длинный");
});
