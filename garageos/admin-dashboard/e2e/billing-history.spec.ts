import { expect, request, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueLogin, queueProfiles, queueCustomer, queueOverflow, queueTargets } from "./support/queue";
import { translate, type Locale } from "../lib/i18n/dictionaries";
import { assertAccessible, assertKeyboardFocus } from "./support/accessibility";

// Prepared against the current owning API before the Billing UI correction.
// Every document is created through normal password-auth HTTP, never a mock DB.
test.use({ trace: "off" });
type Document = { id: string; code: string; customer_id: string; status: string; total: number; payments?: unknown[] };
let customerTag = "", customerName = "", first: Document, last: Document, foreign: Document;
const created: string[] = [];
const label = (locale: Locale, key: string) => {
  const value = translate(locale, key);
  const owningEnglish: Record<string, string> = {
    "billing.search_documents": "Search documents", "billing.previous_page": "Previous page",
    "billing.next_page": "Next page", "billing.document_queue": "Document queue", "billing.refresh": "Refresh documents",
  };
  return locale === "en" && value === key ? owningEnglish[key] ?? key : value;
};
const search = (page: Page, locale: Locale) => page.getByRole("textbox", { name: label(locale, "billing.search_documents"), exact: true });
const queue = (page: Page, locale: Locale) => page.getByRole("region", { name: label(locale, "billing.document_queue"), exact: true });
const expectPageMetadata = async (page: Page, locale: Locale, total: number, current: number, pages: number) => {
  const matched = translate(locale, "billing.matched_total", { count: total });
  const position = translate(locale, "billing.page_of", { page: current, pages });
  expect(matched).not.toBe("billing.matched_total");
  expect(position).not.toBe("billing.page_of");
  await expect(queue(page, locale).getByText(matched, { exact: true })).toBeVisible();
  await expect(queue(page, locale).getByText(position, { exact: true })).toBeVisible();
};
const read = async (page: Page, id: string) => {
  const response = await page.request.get(`/api/proxy/invoices/${id}`);
  expect(response.status()).toBe(200); return response.json();
};
const listResponse = (page: Page, q: string, number: number) => page.waitForResponse(response => {
  const url = new URL(response.url());
  return response.request().method() === "GET" && url.pathname === "/api/proxy/invoices"
    && url.searchParams.get("view") === "estimates" && url.searchParams.get("page_size") === "80"
    && (url.searchParams.get("q") ?? "") === q && Number(url.searchParams.get("page") ?? 1) === number;
});
const drainHeld = async (page: Page, pattern: string, release: () => void, state: { pending: number }) => {
  release(); await page.unroute(pattern);
  await expect.poll(() => state.pending, { timeout: 10_000 }).toBe(0);
};

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    const { profile } = await queueLogin(page, baseURL!, "en", 1280);
    const customer = await queueCustomer(page, profile); customerTag = customer.tag; customerName = customer.name;
    for (let index = 0; index < 101; index++) {
      const response = await page.request.post("/api/proxy/invoices", { data: {
        kind: "estimate", customer_id: customer.customer_id, vehicle_id: customer.vehicle_id,
        notes: "Billing history owning setup " + randomUUID(), tax_rate: 0,
        line_items: [{ kind: "labor", description: "Recorded diagnostic", quantity: 1.5, unit_price: 1000 }],
      } });
      expect(response.status()).toBe(201); const document = await response.json() as Document;
      expect(document.customer_id).toBe(customer.customer_id); created.push(document.id);
      if (index === 0) first = document;
      last = document;
    }
    const firstPage = await page.request.get(`/api/proxy/invoices?view=estimates&q=${encodeURIComponent(customerTag)}&page=1&page_size=80`);
    expect(firstPage.status()).toBe(200); const bounded = await firstPage.json();
    expect(bounded).toMatchObject({ total: 101, page: 1, page_size: 80, total_pages: 2 });
    expect(bounded.items).toHaveLength(80);
    expect(bounded.items.map((item: Document) => item.id)).not.toContain(first.id);
    expect(await read(page, first.id)).toMatchObject({ id: first.id, code: first.code, total: 1500 });
    const second = await queueLogin(page, baseURL!, "en", 1280, 1);
    const other = await queueCustomer(page, second.profile);
    const response = await page.request.post("/api/proxy/invoices", { data: { kind: "estimate", customer_id: other.customer_id } });
    expect(response.status()).toBe(201); foreign = await response.json();
  } finally { await context.close(); }
});

test.afterAll(async ({ browser, baseURL }) => {
  // Archive only IDs this test owns. Never clear another suite's fixtures/history.
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage(); await queueLogin(page, baseURL!, "en", 1280);
    for (const id of created) {
      const response = await page.request.delete(`/api/proxy/invoices/${id}`);
      expect([200, 404]).toContain(response.status());
    }
    if (foreign) {
      await queueLogin(page, baseURL!, "en", 1280, 1);
      expect((await page.request.delete(`/api/proxy/invoices/${foreign.id}`)).status()).toBe(200);
    }
  } finally { await context.close(); }
});

for (const locale of ["en", "ru", "uz"] as const)
for (const width of [360, 390, 1280])
for (const theme of ["light", "dark"] as const) {
  test(`Billing server search and both pages retain real oldest document ${locale}/${width}/${theme}`, async ({ page, baseURL }, info) => {
    await queueLogin(page, baseURL!, locale, width);
    await page.setViewportSize({ width, height: 568 });
    await page.addInitScript(value => localStorage.setItem("garageos-theme", value), theme);
    const before = await read(page, first.id);
    await page.goto("/billing");
    await page.locator("nav button[aria-pressed]").filter({ hasText: translate(locale, "billing.estimates") }).click();
    await expect(search(page, locale)).toBeVisible();
    const one = listResponse(page, customerTag, 1); await search(page, locale).fill(customerTag);
    const result1 = await one; expect(result1.status()).toBe(200); const a = await result1.json();
    expect(a).toMatchObject({ total: 101, page: 1, total_pages: 2 }); expect(a.items).toHaveLength(80);
    await expectPageMetadata(page, locale, 101, 1, 2);
    const two = listResponse(page, customerTag, 2);
    await page.getByRole("button", { name: label(locale, "billing.next_page"), exact: true }).click();
    const result2 = await two; expect(result2.status()).toBe(200); const b = await result2.json();
    expect(b).toMatchObject({ total: 101, page: 2, total_pages: 2 }); expect(b.items).toHaveLength(21);
    await expectPageMetadata(page, locale, 101, 2, 2);
    expect(b.counts).toEqual(a.counts); expect(b.kpis).toEqual(a.kpis);
    const ids = [...a.items, ...b.items].map((item: Document) => item.id);
    expect(new Set(ids).size).toBe(101); expect(ids).toContain(first.id);
    await queue(page, locale).getByRole("button", { name: new RegExp(first.code) }).click();
    await expect(page.locator("#print-invoice")).toContainText(first.code);
    if (width < 1280) await page.getByRole("button", { name: new RegExp(translate(locale, "billing.back_to_list")) }).click();
    const previous = listResponse(page, customerTag, 1);
    await page.getByRole("button", { name: label(locale, "billing.previous_page"), exact: true }).click();
    expect((await previous).status()).toBe(200);
    const found = listResponse(page, first.code, 1); await search(page, locale).fill(first.code);
    const foundResponse = await found; expect(foundResponse.status()).toBe(200);
    const narrow = await foundResponse.json(); expect(narrow.total).toBe(1);
    expect(narrow.items.map((item: Document) => item.id)).toEqual([first.id]);
    await expectPageMetadata(page, locale, 1, 1, 1);
    expect(narrow.counts).toEqual(a.counts); expect(narrow.kpis).toEqual(a.kpis);
    await expect(queue(page, locale).getByRole("button", { name: new RegExp(first.code) })).toBeVisible();
    await queueOverflow(page); await queueTargets(page, queue(page, locale));
    await assertKeyboardFocus(page, search(page, locale));
    await assertAccessible(page, info, `billing-history-${locale}-${width}-${theme}`);
    await page.screenshot({ path: info.outputPath(`billing-history-${locale}-${width}-${theme}.png`), fullPage: true });
    expect(await read(page, first.id)).toEqual(before); // Search/navigation has no financial effect.
  });
}

test("Billing UUID entry reads its owning old estimate independently of invoice queue", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 360);
  for (const id of [first.id.toUpperCase(), first.id]) {
    expect((await page.request.get(`/api/proxy/invoices/${id}`)).status()).toBe(200);
    await page.goto(`/billing?invoice=${id}`);
    await expect(page.locator("#print-invoice")).toContainText(first.code);
    await expect(page.locator("#print-invoice")).not.toContainText(last.code);
  }
  await queueOverflow(page);
});

test("Billing obsolete server search cannot replace a newer stored-code result", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280); await page.goto("/billing");
  await page.locator("nav button[aria-pressed]").filter({ hasText: "Estimates" }).click();
  let release!: () => void;
  let completed!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const finished = new Promise<void>(resolve => { completed = resolve; });
  const heldState = { pending: 0 };
  await page.route("**/api/proxy/invoices?**", async route => {
    if (new URL(route.request().url()).searchParams.get("q") !== customerTag) return route.continue();
    heldState.pending++;
    try {
      const response = await route.fetch(); await held; await route.fulfill({ response });
    } finally { heldState.pending--; completed(); }
  });
  try {
    const started = page.waitForRequest(request => new URL(request.url()).searchParams.get("q") === customerTag);
    await search(page, "en").fill(customerTag); await started;
    const current = listResponse(page, first.code, 1); await search(page, "en").fill(first.code);
    expect((await current).status()).toBe(200);
    await expect(queue(page, "en").getByRole("button", { name: new RegExp(first.code) })).toBeVisible();
    release(); await finished; await page.unroute("**/api/proxy/invoices?**");
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(queue(page, "en").getByRole("button", { name: new RegExp(last.code) })).toHaveCount(0);
    await expect(search(page, "en")).toHaveValue(first.code);
  } finally { await drainHeld(page, "**/api/proxy/invoices?**", release, heldState); }
});

test("Billing malformed and foreign UUID entry never falls back to an unrelated document", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 390);
  expect((await page.request.get(`/api/proxy/invoices/${foreign.id}`)).status()).toBe(404);
  for (const target of ["malformed-id", foreign.id, randomUUID()]) {
    await page.goto(`/billing?invoice=${target}`);
    const error = page.getByRole("alert").filter({ hasText: translate("en", "billing.document_failed") });
    await expect(error).toHaveCount(1); await expect(error).toBeVisible();
    await expect(page.locator("#print-invoice")).toHaveCount(0);
  }
});

test("Billing held old detail cannot replace a later UUID selected by browser history", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  let release!: () => void, fetched!: () => void, completed!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { fetched = resolve; });
  const finished = new Promise<void>(resolve => { completed = resolve; });
  const heldState = { pending: 0 };
  await page.route(`**/api/proxy/invoices/${first.id}`, async route => {
    heldState.pending++;
    try {
      const response = await route.fetch(); expect(response.status()).toBe(200);
      fetched(); await held; await route.fulfill({ response });
    } finally { heldState.pending--; completed(); }
  }, { times: 1 });
  try {
    await page.goto(`/billing?invoice=${first.id}`); await started;
    await page.evaluate(id => history.pushState({}, "", `/billing?invoice=${id}`), last.id);
    await expect(page.locator("#print-invoice")).toContainText(last.code);
    release(); await finished;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator("#print-invoice")).toContainText(last.code);
    await expect(page.locator("#print-invoice")).not.toContainText(first.code);
    await page.goBack(); await expect(page.locator("#print-invoice")).toContainText(first.code);
    await page.goForward(); await expect(page.locator("#print-invoice")).toContainText(last.code);
  } finally { await drainHeld(page, `**/api/proxy/invoices/${first.id}`, release, heldState); }
});

test("Billing real same-actor permission revocation hides protected data until deliberate verification", async ({ page, baseURL }) => {
  const profile = queueProfiles(baseURL!).owners[0];
  const owner = await request.newContext({ baseURL });
  let employeeId: string | undefined;
  try {
    expect((await owner.post("/api/auth/login", { data: { email: profile.email, password: profile.password } })).status()).toBe(200);
    const email = `billing-history-${randomUUID()}@example.com`, password = `QA-${randomUUID()}`;
    const employee = await owner.post("/api/proxy/staff", { data: { email, password, full_name: "QA Billing history staff", role: "receptionist" } });
    expect(employee.status()).toBe(201); employeeId = (await employee.json()).id;
    expect((await page.request.post("/api/auth/login", { data: { email, password } })).status()).toBe(200);
    await page.context().addCookies([{ name: "garageos_locale", value: "en", url: baseURL! }]);
    await page.goto(`/billing?invoice=${first.id}`);
    await expect(page.locator("#print-invoice")).toContainText(first.code);
    expect((await owner.patch(`/api/proxy/staff/${employeeId}`, { data: { role: "mechanic" } })).status()).toBe(200);
    const me = await page.request.get("/api/proxy/auth/me"); expect(me.status()).toBe(200);
    expect((await me.json()).id).toBe(employeeId);
    expect((await page.request.get(`/api/proxy/invoices/${first.id}`)).status()).toBe(403);
    await page.getByRole("button", { name: label("en", "billing.refresh"), exact: true }).click();
    const verify = page.getByRole("button", { name: translate("en", "message.verify"), exact: true });
    await expect(verify).toBeVisible(); await expect(page.locator("#print-invoice")).toHaveCount(0);
    await expect(queue(page, "en")).toHaveCount(0);
    expect((await owner.patch(`/api/proxy/staff/${employeeId}`, { data: { role: "receptionist" } })).status()).toBe(200);
    await verify.click(); await expect(page.locator("#print-invoice")).toContainText(first.code);
  } finally {
    if (employeeId) expect((await owner.patch(`/api/proxy/staff/${employeeId}`, { data: { is_active: false } })).status()).toBe(200);
    await owner.dispose();
  }
});

test("Billing old-actor detail cannot paint after fresh verification of another garage", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  await page.goto("/billing");
  await page.locator("nav button[aria-pressed]").filter({ hasText: "Estimates" }).click();
  const ownQueue = listResponse(page, last.code, 1); await search(page, "en").fill(last.code);
  expect((await ownQueue).status()).toBe(200);
  await expect(queue(page, "en").getByRole("button", { name: new RegExp(last.code) })).toBeVisible();
  await expect(queue(page, "en").getByText(customerName, { exact: true })).toBeVisible();
  let release!: () => void, fetched!: () => void, completed!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { fetched = resolve; });
  const finished = new Promise<void>(resolve => { completed = resolve; });
  const heldState = { pending: 0 };
  await page.route(`**/api/proxy/invoices/${first.id}`, async route => {
    heldState.pending++;
    try {
      const response = await route.fetch(); expect(response.status()).toBe(200);
      fetched(); await held; await route.fulfill({ response });
    } finally { heldState.pending--; completed(); }
  }, { times: 1 });
  try {
    await page.evaluate(id => history.pushState({}, "", `/billing?invoice=${id}`), first.id); await started;
    const other = queueProfiles(baseURL!).owners[1];
    expect((await page.request.post("/api/auth/login", { data: { email: other.email, password: other.password } })).status()).toBe(200);
    expect((await page.request.get(`/api/proxy/invoices/${first.id}`)).status()).toBe(404);
    await page.getByRole("button", { name: label("en", "billing.refresh"), exact: true }).click();
    const verify = page.getByRole("button", { name: translate("en", "message.verify"), exact: true });
    await expect(verify).toBeVisible(); release(); await finished;
    await expect(page.locator("#print-invoice")).toHaveCount(0);
    await expect(page.getByText(first.code, { exact: true })).toHaveCount(0);
    await verify.click();
    await expect(page.getByRole("alert").filter({ hasText: translate("en", "billing.document_failed") })).toBeVisible();
    await expect(page.locator("#print-invoice")).toHaveCount(0);
    await expect(queue(page, "en").getByText(customerName, { exact: true })).toHaveCount(0);
    await expect(queue(page, "en").getByRole("button", { name: new RegExp(last.code) })).toHaveCount(0);
  } finally { await drainHeld(page, `**/api/proxy/invoices/${first.id}`, release, heldState); }
});

test("Billing list and explicit-detail failures have independent deliberate retries", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const before = await read(page, first.id);
  await page.route("**/api/proxy/invoices?**", route => route.fulfill({ status: 503, json: {} }), { times: 1 });
  await page.goto(`/billing?invoice=${first.id}`);
  await expect(page.locator("#print-invoice")).toContainText(first.code);
  const listError = page.getByRole("alert").filter({ hasText: translate("en", "billing.load_failed") });
  await expect(listError).toBeVisible();
  await listError.getByRole("button", { name: translate("en", "billing.retry"), exact: true }).click();
  await expect(listError).toHaveCount(0); await expect(page.locator("#print-invoice")).toContainText(first.code);
  await page.route(`**/api/proxy/invoices/${first.id}`, route => route.fulfill({ status: 503, json: {} }), { times: 1 });
  await page.getByRole("button", { name: label("en", "billing.refresh"), exact: true }).click();
  const staleError = page.getByRole("alert").filter({ hasText: translate("en", "billing.document_failed") });
  await expect(staleError).toBeVisible(); await expect(page.locator("#print-invoice")).toContainText(first.code);
  await expect(page.getByRole("button", { name: new RegExp(translate("en", "billing.send")) })).toBeDisabled();
  await staleError.getByRole("button", { name: translate("en", "billing.retry"), exact: true }).click();
  await expect(staleError).toHaveCount(0);
  await expect(page.getByRole("button", { name: new RegExp(translate("en", "billing.send")) })).toBeEnabled();
  await page.route(`**/api/proxy/invoices/${first.id}`, route => route.fulfill({ status: 503, json: {} }), { times: 1 });
  await page.goto(`/billing?invoice=${first.id}`);
  const detailError = page.getByRole("alert").filter({ hasText: translate("en", "billing.document_failed") });
  await expect(detailError).toBeVisible(); await expect(page.locator("#print-invoice")).toHaveCount(0);
  await expect(search(page, "en")).toBeEnabled();
  await detailError.getByRole("button", { name: translate("en", "billing.retry"), exact: true }).click();
  await expect(page.locator("#print-invoice")).toContainText(first.code);
  expect(await read(page, first.id)).toEqual(before);
});

test("Billing verified empty search remains bounded and clearing resets to its first server page", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 390); await page.goto("/billing");
  await page.locator("nav button[aria-pressed]").filter({ hasText: "Estimates" }).click();
  const absent = "NoBillingRecord" + randomUUID();
  const empty = listResponse(page, absent, 1); await search(page, "en").fill(absent);
  const response = await empty; expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ total: 0, page: 1, items: [] });
  await expect(queue(page, "en")).toContainText(translate("en", "billing.empty"));
  await expect(page.getByRole("button", { name: label("en", "billing.previous_page"), exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: label("en", "billing.next_page"), exact: true })).toBeDisabled();
  const cleared = listResponse(page, "", 1); await search(page, "en").fill("");
  expect((await cleared).status()).toBe(200); await expect(search(page, "en")).toHaveValue("");
  expect(await search(page, "en").getAttribute("maxlength")).toBe("100");
});

test("Billing captured send ACK and failed list refresh cannot replace browser-selected B or resend A", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const response = await page.request.post("/api/proxy/invoices", { data: {
    kind: "estimate", customer_id: first.customer_id, tax_rate: 0,
    line_items: [{ kind: "labor", description: "Captured Billing action", quantity: 1, unit_price: 1000 }],
  } });
  expect(response.status()).toBe(201); const a = await response.json() as Document; created.push(a.id);
  const bBefore = await read(page, last.id);
  await page.goto(`/billing?invoice=${a.id}`); await expect(page.locator("#print-invoice")).toContainText(a.code);
  let release!: () => void, fetched!: () => void, completed!: () => void, sends = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { fetched = resolve; });
  const finished = new Promise<void>(resolve => { completed = resolve; });
  const heldState = { pending: 0 };
  await page.route(`**/api/proxy/invoices/${a.id}/send`, async route => {
    heldState.pending++;
    sends++;
    try {
      const sent = await route.fetch(); expect(sent.status()).toBe(200);
      expect((await sent.json()).id).toBe(a.id); fetched(); await held; await route.fulfill({ response: sent });
    } finally { heldState.pending--; completed(); }
  });
  try {
    await page.getByRole("button", { name: new RegExp(translate("en", "billing.send")) }).click(); await started;
    await page.evaluate(id => history.pushState({}, "", `/billing?invoice=${id}`), last.id);
    await expect(page.locator("#print-invoice")).toContainText(last.code);
    await page.route("**/api/proxy/invoices?**", route => route.fulfill({ status: 503, json: {} }), { times: 1 });
    release(); await finished;
    const listError = page.getByRole("alert").filter({ hasText: translate("en", "billing.load_failed") });
    await expect(listError).toBeVisible(); await expect(page.locator("#print-invoice")).toContainText(last.code);
    expect((await read(page, a.id)).status).toBe("sent"); expect(await read(page, last.id)).toEqual(bBefore); expect(sends).toBe(1);
    await listError.getByRole("button", { name: translate("en", "billing.retry"), exact: true }).click();
    await expect(listError).toHaveCount(0); await expect(page.locator("#print-invoice")).toContainText(last.code); expect(sends).toBe(1);
  } finally { await drainHeld(page, `**/api/proxy/invoices/${a.id}/send`, release, heldState); }
});

test("Billing payment canceled during real auth preflight never claims Saved or posts a payment", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const response = await page.request.post("/api/proxy/invoices", { data: {
    kind: "invoice", customer_id: first.customer_id, tax_rate: 0,
    line_items: [{ kind: "labor", description: "Captured payment cancellation", quantity: 1, unit_price: 1000 }],
  } });
  expect(response.status()).toBe(201); const a = await response.json() as Document; created.push(a.id);
  const beforeA = await read(page, a.id), beforeB = await read(page, last.id);
  await page.goto(`/billing?invoice=${a.id}`); await expect(page.locator("#print-invoice")).toContainText(a.code);
  await expect(queue(page, "en").getByRole("button", { name: new RegExp(a.code) })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(translate("en", "billing.record_payment")) }).click();
  const dialog = page.getByRole("dialog", { name: translate("en", "billing.record_payment"), exact: true });
  await dialog.getByLabel(translate("en", "public.amount"), { exact: true }).fill("100");
  let release!: () => void, fetched!: () => void, completed!: () => void, posts = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { fetched = resolve; });
  const finished = new Promise<void>(resolve => { completed = resolve; });
  const heldState = { pending: 0 };
  page.on("request", req => { if (req.method() === "POST" && new URL(req.url()).pathname === `/api/proxy/invoices/${a.id}/payments`) posts++; });
  await page.route("**/api/proxy/auth/me", async route => {
    heldState.pending++;
    try {
      const actual = await route.fetch(); expect(actual.status()).toBe(200);
      fetched(); await held; await route.fulfill({ response: actual });
    } finally { heldState.pending--; completed(); }
  }, { times: 1 });
  try {
    await page.evaluate(saved => {
      const watched = window as Window & { billingPaymentSavedWatch?: { seen: boolean; observer: MutationObserver } };
      const containsSaved = (node: Node): boolean => node.textContent?.trim() === saved
        || node instanceof Element && Array.from(node.querySelectorAll("*")).some(child => child.textContent?.trim() === saved);
      const watch = { seen: containsSaved(document.body) };
      const observer = new MutationObserver(records => {
        if (!watch.seen) watch.seen = records.some(record =>
          (record.type === "characterData" ? [record.target] : Array.from(record.addedNodes)).some(containsSaved));
      });
      watched.billingPaymentSavedWatch = Object.assign(watch, { observer });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }, translate("en", "billing.saved"));
    await dialog.getByRole("button", { name: translate("en", "billing.record_payment"), exact: true }).click(); await started;
    await page.evaluate(id => history.pushState({}, "", `/billing?invoice=${id}`), last.id);
    await expect(page.locator("#print-invoice")).toContainText(last.code);
    const selectedSend = page.getByRole("button", { name: new RegExp(translate("en", "billing.send")) });
    await expect(selectedSend).toBeDisabled();
    release(); await finished;
    // Route fulfillment alone does not mean the canceled payment continuation has settled.
    await expect(selectedSend).toBeEnabled();
    const afterA = await read(page, a.id), afterB = await read(page, last.id);
    expect(posts).toBe(0); expect(afterA).toEqual(beforeA); expect(afterB).toEqual(beforeB);
    await expect(page.getByText(translate("en", "billing.saved"), { exact: true })).toHaveCount(0);
    await expect(page.locator("#print-invoice")).toContainText(last.code);
    expect(await page.evaluate(() => {
      const watch = (window as Window & { billingPaymentSavedWatch?: { seen: boolean } }).billingPaymentSavedWatch;
      if (!watch) throw new Error("Payment Saved observation unavailable");
      return watch.seen;
    })).toBe(false);
  } finally {
    try {
      await page.evaluate(() => {
        const watched = window as Window & { billingPaymentSavedWatch?: { observer: MutationObserver } };
        watched.billingPaymentSavedWatch?.observer.disconnect();
        delete watched.billingPaymentSavedWatch;
      });
    } finally { await drainHeld(page, "**/api/proxy/auth/me", release, heldState); }
  }
});

test("Billing shrinking final page makes one bounded correction using current server totals", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280); await page.goto("/billing");
  const independent = await page.request.get(`/api/proxy/invoices?view=estimates&q=${encodeURIComponent(customerTag)}&page=1&page_size=80`);
  expect(independent.status()).toBe(200); const active = await independent.json();
  expect(active.total).toBeGreaterThan(80); expect(active.total).toBeLessThanOrEqual(160);
  expect(active).toMatchObject({ page: 1, page_size: 80, total_pages: 2 });
  expect(active.items).toHaveLength(80);
  await page.locator("nav button[aria-pressed]").filter({ hasText: "Estimates" }).click();
  const firstPage = listResponse(page, customerTag, 1); await search(page, "en").fill(customerTag);
  expect((await firstPage).status()).toBe(200);
  const secondPage = listResponse(page, customerTag, 2);
  await page.getByRole("button", { name: label("en", "billing.next_page"), exact: true }).click();
  const lastPage = await (await secondPage).json();
  expect(lastPage).toMatchObject({ total: active.total, page: 2, total_pages: 2 });
  expect(lastPage.items).toHaveLength(active.total - 80);
  const activeIds = [...active.items, ...lastPage.items].map((document: Document) => document.id);
  expect(new Set(activeIds).size).toBe(active.total);
  for (const id of activeIds) expect(created).toContain(id);
  await expectPageMetadata(page, "en", active.total, 2, 2);
  for (const document of lastPage.items as Document[]) {
    expect(created).toContain(document.id);
    expect((await page.request.delete(`/api/proxy/invoices/${document.id}`)).status()).toBe(200);
  }
  const requested: number[] = [];
  page.on("request", req => {
    const url = new URL(req.url());
    if (url.pathname === "/api/proxy/invoices" && url.searchParams.get("q") === customerTag) requested.push(Number(url.searchParams.get("page")));
  });
  const corrected = listResponse(page, customerTag, 1);
  await page.getByRole("button", { name: label("en", "billing.refresh"), exact: true }).click();
  const result = await corrected; expect(result.status()).toBe(200);
  expect(await result.json()).toMatchObject({ total: 80, page: 1, total_pages: 1 });
  await expectPageMetadata(page, "en", 80, 1, 1);
  await expect(page.getByRole("button", { name: label("en", "billing.next_page"), exact: true })).toBeDisabled();
  expect(requested).toEqual([2, 1]);
});
