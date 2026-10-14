import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueLogin, queueCustomer, queueJob, queueDate } from "./support/queue";
import { translate } from "../lib/i18n/dictionaries";

// Prepared contracts only. The new picker Clear label is a proposed UI seam.
// Normal API fixtures and delayed genuine response JSON are required at runtime.
test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe.configure({ retries: 0 });
type Kind = "customer" | "vehicle" | "appointment" | "case" | "invoice" | "assignee";
const fields: Record<Kind, string> = { customer: "customer_id", vehicle: "vehicle_id", appointment: "appointment_id",
  case: "case_id", invoice: "invoice_id", assignee: "assigned_user_id" };
const kinds = Object.keys(fields) as Kind[];
const createPath = "/api/proxy/conversations", choicesPath = `${createPath}/choices`;
const t = (key: string) => translate("en", key);
const form = (page: Page) => page.getByRole("dialog", { name: t("inbox.create.title"), exact: true });
const picker = (page: Page) => page.getByRole("dialog").filter({
  has: page.getByRole("textbox", { name: t("inbox.choice.search"), exact: true }),
});
async function openForm(page: Page) {
  await page.getByRole("button", { name: t("inbox.create.title"), exact: true }).click();
  await expect(form(page)).toBeVisible(); return form(page);
}
async function openPicker(page: Page, kind: Kind) {
  await form(page).getByRole("button", { name: t(`inbox.choice.${kind}`), exact: true }).click();
  await expect(picker(page)).toBeVisible(); return picker(page);
}
async function choose(page: Page, kind: Kind, id: string) {
  const root = await openPicker(page, kind);
  await root.getByRole("textbox", { name: t("inbox.choice.search"), exact: true }).fill(id);
  const option = root.getByRole("button").filter({ has: page.getByText(id, { exact: true }) });
  await expect(option).toHaveCount(1); await option.click();
  await expect(form(page).getByText(id, { exact: true })).toBeVisible();
}
async function refs(page: Page, baseURL: string) {
  const { profile, owner } = await queueLogin(page, baseURL, "en", 390);
  const person = await queueCustomer(page, profile), appointment = await queueJob(page, person, queueDate(90));
  const createdCase = await page.request.post("/api/proxy/cases", { data: {
    customer_id: person.customer_id, vehicle_id: person.vehicle_id,
    title: `QA39 clear context ${randomUUID()}`, case_type: "support",
  } });
  expect(createdCase.status()).toBe(201); const caseId = (await createdCase.json()).id as string;
  expect((await page.request.patch(`/api/proxy/cases/${caseId}`, { data: { status: "in_progress" } })).status()).toBe(200);
  const invoice = await page.request.post("/api/proxy/invoices", { data: {
    kind: "estimate", customer_id: person.customer_id, vehicle_id: person.vehicle_id,
    appointment_id: appointment, case_id: caseId,
  } });
  expect(invoice.status()).toBe(201);
  const staff = await page.request.post("/api/proxy/staff", { data: {
    full_name: `QA39 clear assignee ${randomUUID()}`, role: "manager",
    email: `${randomUUID()}@example.com`, password: owner.password,
  } });
  expect(staff.status()).toBe(201);
  return { customer: person.customer_id, vehicle: person.vehicle_id, appointment,
    case: caseId, invoice: (await invoice.json()).id as string, assignee: (await staff.json()).id as string };
}
async function submit(page: Page, root: Locator) {
  const response = page.waitForResponse(result => result.request().method() === "POST"
    && new URL(result.url()).pathname === createPath);
  await root.getByRole("button", { name: t("inbox.create.submit"), exact: true }).click();
  const result = await response; expect(result.status()).toBe(201);
  const id = (await result.json()).id as string;
  const detail = await page.request.get(`${createPath}/${id}`); expect(detail.status()).toBe(200);
  return { payload: result.request().postDataJSON(), detail: await detail.json(), id };
}

for (const cleared of kinds) test(`Inbox explicitly clears optional ${cleared} without inferring it from remaining owning records`, async ({ page, baseURL }) => {
  const records = await refs(page, baseURL!); await page.goto("/inbox");
  const root = await openForm(page), subject = `QA39 optional clear ${randomUUID()}`;
  await root.getByRole("textbox", { name: t("inbox.create.subject"), exact: true }).fill(subject);
  for (const kind of kinds) await choose(page, kind, records[kind]);
  const choices = await openPicker(page, cleared);
  await choices.getByRole("button", { name: t("inbox.choice.clear"), exact: true }).click();
  await expect(root.getByText(records[cleared], { exact: true })).toHaveCount(0);
  await expect(root.getByRole("textbox", { name: t("inbox.create.subject"), exact: true })).toHaveValue(subject);
  const saved = await submit(page, root);
  expect(saved.payload[fields[cleared]] ?? null).toBeNull();
  expect(saved.detail[fields[cleared]]).toBeNull(); expect(saved.detail.subject).toBe(subject);
  for (const other of kinds.filter(kind => kind !== cleared)) {
    expect(saved.payload[fields[other]]).toBe(records[other]);
    expect(saved.detail[fields[other]]).toBe(records[other]);
  }
  expect(saved.detail.status).toBe("open"); expect(saved.detail.is_following).toBe(false);
  const actualCase = await page.request.get(`/api/proxy/cases/${records.case}`);
  expect(actualCase.status()).toBe(200); expect((await actualCase.json()).status).toBe("in_progress");
});

test("Inbox late genuine vehicle choice data cannot replace a newer selected customer and vehicle context", async ({ page, baseURL }) => {
  const { profile } = await queueLogin(page, baseURL!, "en", 390);
  const a = await queueCustomer(page, profile), b = await queueCustomer(page, profile);
  await page.goto("/inbox"); const root = await openForm(page);
  const subject = `QA39 newer context ${randomUUID()}`;
  await root.getByRole("textbox", { name: t("inbox.create.subject"), exact: true }).fill(subject);
  await choose(page, "customer", a.customer_id);
  await page.evaluate(({ path, oldCustomer, oldVehicle }) => {
    const original = window.fetch.bind(window);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const state = { held: false, returned: false, ids: [] as string[], release, restore: () => { window.fetch = original; } };
    (window as unknown as { qaChoiceJson: typeof state }).qaChoiceJson = state;
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const response = await original(input, init);
      if (method === "GET" && url.pathname === path && url.searchParams.get("kind") === "vehicle"
          && url.searchParams.get("customer_id") === oldCustomer && url.searchParams.get("q") === oldVehicle
          && Number(url.searchParams.get("offset") || "0") === 0 && response.status === 200) {
        const json = response.json.bind(response);
        response.json = async () => {
          const data = await json(); state.ids = data.items.map((item: { id: string }) => item.id); state.held = true;
          await gate; state.returned = true; return data;
        };
      }
      return response;
    };
  }, { path: choicesPath, oldCustomer: a.customer_id, oldVehicle: a.vehicle_id });
  const held = () => page.evaluate(() => {
    const value = (window as unknown as { qaChoiceJson: { held: boolean; returned: boolean; ids: string[] } }).qaChoiceJson;
    return { held: value.held, returned: value.returned, ids: value.ids };
  });
  try {
    const oldPicker = await openPicker(page, "vehicle");
    await oldPicker.getByRole("textbox", { name: t("inbox.choice.search"), exact: true }).fill(a.vehicle_id);
    await expect.poll(async () => (await held()).held).toBe(true);
    expect((await held()).ids).toContain(a.vehicle_id);
    await page.keyboard.press("Escape"); await expect(oldPicker).toHaveCount(0);
    await choose(page, "customer", b.customer_id); await choose(page, "vehicle", b.vehicle_id);
    await page.evaluate(() => (window as unknown as { qaChoiceJson: { release: () => void } }).qaChoiceJson.release());
    await expect.poll(async () => (await held()).returned).toBe(true);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(root.getByText(b.customer_id, { exact: true })).toBeVisible();
    await expect(root.getByText(b.vehicle_id, { exact: true })).toBeVisible();
    await expect(root.getByText(a.customer_id, { exact: true })).toHaveCount(0);
    await expect(root.getByText(a.vehicle_id, { exact: true })).toHaveCount(0);
    const saved = await submit(page, root);
    expect(saved.payload).toMatchObject({ subject, customer_id: b.customer_id, vehicle_id: b.vehicle_id });
    expect(saved.detail).toMatchObject({ id: saved.id, subject, customer_id: b.customer_id, vehicle_id: b.vehicle_id });
  } finally {
    await page.evaluate(() => {
      const state = (window as unknown as { qaChoiceJson: { release: () => void; restore: () => void } }).qaChoiceJson;
      state.release(); state.restore();
    });
  }
});
