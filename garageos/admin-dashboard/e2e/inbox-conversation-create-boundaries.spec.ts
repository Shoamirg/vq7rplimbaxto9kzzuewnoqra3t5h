/** Prepared independently against 28d6542; not executed or product acceptance.
 * Intended destination dashboard/e2e; existing 145 API +23 browser contracts
 * remain untouched. New UI names follow the separately prepared creation spec.
 */
import { expect, test, request, type Locator, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueLogin, queueProfiles, queueCustomer, queueTargets, queueOverflow } from "./support/queue";
import { assertAccessible, assertKeyboardFocus } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe.configure({ retries: 0 });
const path = "/api/proxy/conversations";
const label = (key: string, locale: Locale = "en") => {
  const value = translate(locale, key);
  return value === key && key === "inbox.create.title" ? "New conversation" : value;
};
const form = (page: Page) => page.getByRole("dialog", { name: label("inbox.create.title"), exact: true });
const notice = (root: Locator, state: string) => root.getByRole(state === "error" || state === "uncertain" ? "alert" : "status")
  .filter({ hasText: label(`inbox.create.${state}`) });
const subjectInput = (root: Locator) => root.getByRole("textbox", { name: label("inbox.create.subject"), exact: true });
const composer = (page: Page, locale: Locale = "en") => page.getByRole("textbox", { name: label("ops.message", locale), exact: true });
async function openForm(page: Page) {
  await page.getByRole("button", { name: label("inbox.create.title"), exact: true }).click();
  const root = form(page); await expect(root).toBeVisible(); return root;
}
async function stored(page: Page, id: string) {
  const response = await page.request.get(`${path}/${id}`); expect(response.status()).toBe(200); return response.json();
}
async function matching(page: Page, subject: string) {
  const response = await page.request.get(`${path}?view=all&q=${encodeURIComponent(subject)}&limit=100`);
  expect(response.status()).toBe(200); return response.json();
}
async function seedThread(page: Page, suffix: string, extra: Record<string, string> = {}) {
  const subject = `QA39 ${suffix} ${randomUUID()}`;
  const response = await page.request.post(path, { data: { subject, ...extra } });
  expect(response.status()).toBe(201); return { id: (await response.json()).id as string, subject };
}
async function staff(page: Page, role: "manager" | "mechanic" | "receptionist", name?: string) {
  const credentials = { email: `${randomUUID()}@example.com`, password: `QA39-staff-${randomUUID()}` };
  const response = await page.request.post("/api/proxy/staff", { data: {
    ...credentials, role, full_name: name ?? `QA39 ${role} ${randomUUID()}`,
  } });
  expect(response.status()).toBe(201);
  return { id: (await response.json()).id as string, ...credentials };
}
async function choose(page: Page, root: Locator, id: string, locale: Locale = "en", evidence?: { info: TestInfo; tag: string }) {
  await root.getByRole("button", { name: label("inbox.choice.assignee", locale), exact: true }).click();
  const picker = page.getByRole("dialog").filter({ has: page.getByRole("textbox", { name: label("inbox.choice.search", locale), exact: true }) });
  await picker.getByRole("textbox", { name: label("inbox.choice.search", locale), exact: true }).fill(id);
  const option = picker.getByRole("button").filter({ has: page.getByText(id, { exact: true }) });
  await expect(option).toHaveCount(1);
  if (evidence) {
    await assertKeyboardFocus(page, option); await queueTargets(page, picker); await queueOverflow(page);
    await assertAccessible(page, evidence.info, evidence.tag);
    await page.screenshot({ path: evidence.info.outputPath(`${evidence.tag}.png`), fullPage: true });
  }
  await option.click();
}
async function selectThread(page: Page, subject: string, locale: Locale = "en") {
  const list = page.getByRole("region", { name: label("message.conversations", locale), exact: true });
  if (!await list.isVisible()) await page.getByRole("button", { name: label("message.conversations", locale), exact: true }).click();
  await list.getByRole("button")
    .filter({ has: page.getByText(subject, { exact: true }) }).click();
  await expect(page.getByRole("heading", { name: subject, exact: true })).toBeVisible();
  await expect(composer(page, locale)).toBeEnabled();
}
async function selectRecordedQueueThread(page: Page, target: { id: string; subject: string }, previousSubject: string, locale: Locale) {
  await expect(page.getByRole("heading", { name: previousSubject, exact: true })).toBeVisible();
  const list = page.getByRole("region", { name: label("message.conversations", locale), exact: true });
  if (!await list.isVisible()) await page.getByRole("button", { name: label("message.conversations", locale), exact: true }).click();
  // Existing priority/history can put a captured record beyond the first page.
  // Search through the normal localized UI without replacing the selected thread.
  const searched = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === path
      && url.searchParams.get("q") === target.subject && url.searchParams.get("offset") === "0";
  });
  await page.getByRole("textbox", { name: label("inbox.search", locale), exact: true }).fill(target.subject);
  const response = await searched; expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.total).toBe(1); expect(result.offset).toBe(0);
  expect(result.items.map((item: { id: string; subject: string }) => ({ id: item.id, subject: item.subject }))).toEqual([target]);
  // Opening the phone list hides the existing thread, while its captured content
  // must remain attached until the ordinary target row is deliberately selected.
  await expect(page.getByRole("heading", { name: previousSubject, exact: true, includeHidden: true })).toHaveCount(1);
  const row = list.getByRole("button").filter({ has: page.getByText(target.subject, { exact: true }) });
  await expect(row).toHaveCount(1);
  const opened = page.waitForResponse(response => response.request().method() === "GET"
    && new URL(response.url()).pathname === `${path}/${target.id}`);
  await row.click();
  const detail = await opened; expect(detail.status()).toBe(200);
  const snapshot = await detail.json(); expect({ id: snapshot.id, subject: snapshot.subject }).toEqual(target);
  await expect(page.getByRole("heading", { name: target.subject, exact: true })).toBeVisible();
  await expect(composer(page, locale)).toBeEnabled();
}
async function actionReady(page: Page, locale: Locale = "en") {
  await expect(page.getByRole("combobox", { name: label("inbox.action.status", locale), exact: true })).toBeEnabled();
}
async function animationFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

test("Inbox acknowledged create keeps its exact returned UUID when detail fails and read retry never creates again", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280); await page.goto("/inbox");
  const root = await openForm(page), subject = `QA39 acknowledged-read ${randomUUID()}`;
  await subjectInput(root).fill(subject);
  let id: string | undefined, posts = 0, failRead = true, failedReads = 0;
  page.on("request", r => { if (r.method() === "POST" && new URL(r.url()).pathname === path) posts++; });
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); expect(response.status()).toBe(201);
    id = (await response.json()).id; await route.fulfill({ response });
  });
  await page.route(`**${path}/*`, async route => {
    if (!id || route.request().method() !== "GET" || new URL(route.request().url()).pathname !== `${path}/${id}` || !failRead) return route.continue();
    const response = await route.fetch(); expect(response.status()).toBe(200);
    failedReads++; await route.abort("failed");
  });
  try {
    await root.getByRole("button", { name: label("inbox.create.submit"), exact: true }).click();
    await expect(notice(root, "acknowledged")).toBeVisible();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(root.getByText(id!, { exact: true })).toBeVisible();
    await root.getByRole("button", { name: label("inbox.create.open_created"), exact: true }).click();
    const error = page.getByRole("alert").filter({ hasText: label("message.read_error") });
    await expect(error).toBeVisible(); expect(failedReads).toBeGreaterThan(0);
    await expect(composer(page)).toHaveCount(0);
    expect(posts).toBe(1); expect((await matching(page, subject)).total).toBe(1);
    expect((await stored(page, id!)).subject).toBe(subject);
    await expect(notice(page.getByRole("main"), "uncertain")).toHaveCount(0);
    await expect(notice(page.getByRole("main"), "error")).toHaveCount(0);
    failRead = false;
    await error.getByRole("button", { name: label("ops.retry"), exact: true }).click();
    await expect(page.getByRole("heading", { name: subject, exact: true })).toBeVisible();
    await expect(composer(page)).toBeEnabled(); expect(posts).toBe(1);
    const found = await matching(page, subject); expect(found.total).toBe(1); expect(found.items[0].id).toBe(id);
  } finally { failRead = false; await page.unrouteAll({ behavior: "wait" }); }
});

for (const outcome of ["rejected", "unknown"] as const) test(`Inbox ${outcome} creation retains captured form and never adopts the other outcome`, async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const assignee = await staff(page, "manager"); await page.goto("/inbox");
  const root = await openForm(page), subject = `QA39 ${outcome}-create ${randomUUID()}`;
  await subjectInput(root).fill(subject); await choose(page, root, assignee.id);
  let posts = 0, receivedStatus = 0, committedId: string | undefined;
  page.on("request", r => { if (r.method() === "POST" && new URL(r.url()).pathname === path) posts++; });
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    expect(route.request().postDataJSON()).toMatchObject({ subject, assigned_user_id: assignee.id });
    if (outcome === "rejected") {
      // Real owner mutation happens AFTER UI preflight, BEFORE normal create.
      // No response/status substitution or permission override is involved.
      const disabled = await page.request.patch(`/api/proxy/staff/${assignee.id}`, { data: { is_active: false } });
      expect(disabled.status()).toBe(200);
    }
    const response = await route.fetch(); receivedStatus = response.status();
    if (outcome === "unknown") {
      expect(receivedStatus).toBe(201); committedId = (await response.json()).id; await route.abort("failed");
    } else { expect(receivedStatus).toBe(404); await route.fulfill({ response }); }
  }, { times: 1 });
  try {
    await root.getByRole("button", { name: label("inbox.create.submit"), exact: true }).click();
    await expect(notice(root, outcome === "rejected" ? "error" : "uncertain")).toBeVisible();
    await expect(notice(root, outcome === "rejected" ? "uncertain" : "error")).toHaveCount(0);
    await expect(notice(root, "acknowledged")).toHaveCount(0);
    await expect(subjectInput(root)).toHaveValue(subject); await expect(root.getByText(assignee.id, { exact: true })).toBeVisible();
    // A deliberate new submit after a known rejection may be allowed. Only the
    // unknown outcome must refuse Enter until explicit reconciliation/resolution.
    if (outcome === "unknown") await page.keyboard.press("Enter");
    await animationFrames(page); expect(posts).toBe(1);
    const found = await matching(page, subject); expect(found.total).toBe(outcome === "unknown" ? 1 : 0);
    if (outcome === "unknown") {
      expect(found.items[0].id).toBe(committedId); expect((await stored(page, committedId!)).assigned_user_id).toBe(assignee.id);
      await expect(root.getByRole("button", { name: label("inbox.create.submit"), exact: true })).toBeDisabled();
    }
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    if (outcome === "rejected") expect((await page.request.patch(`/api/proxy/staff/${assignee.id}`, { data: { is_active: true } })).status()).toBe(200);
  }
});

/** Hold consumption of genuine 201 JSON, not an invented/cancelable reply. */
async function holdCreateJson(page: Page) {
  await page.evaluate(target => {
    const original = window.fetch.bind(window);
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    const state = { held: false, returned: false, id: "", release, restore: () => { window.fetch = original; } };
    (window as unknown as { qaCreationJson: typeof state }).qaCreationJson = state;
    window.fetch = async (input, init) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const response = await original(input, init);
      if (method === "POST" && url.pathname === target && response.status === 201) {
        const json = response.json.bind(response);
        response.json = async () => {
          const data = await json(); state.id = data.id; state.held = true;
          await gate; state.returned = true; return data;
        };
      }
      return response;
    };
  }, path);
}
const heldJson = (page: Page) => page.evaluate(() => {
  const state = (window as unknown as { qaCreationJson: { held: boolean; returned: boolean; id: string } }).qaCreationJson;
  return { held: state.held, returned: state.returned, id: state.id };
});
async function releaseJson(page: Page) {
  await page.evaluate(() => (window as unknown as { qaCreationJson: { release: () => void } }).qaCreationJson.release());
}

for (const boundary of ["logout", "actor-change"] as const) test(`Inbox late genuine create JSON after ${boundary} never restores the old protected form`, async ({ page, baseURL }) => {
  const fixture = queueProfiles(baseURL!), observer = await request.newContext({ baseURL });
  let installed = false, posts = 0;
  try {
    const ownerA = fixture.owners[0], ownerB = fixture.owners[1];
    expect((await observer.post("/api/auth/login", { data: { email: ownerA.email, password: ownerA.password } })).status()).toBe(200);
    await queueLogin(page, baseURL!, "en", 1280);
    const a = await seedThread(page, "old-context");
    expect((await page.request.post("/api/auth/login", { data: { email: ownerB.email, password: ownerB.password } })).status()).toBe(200);
    const b = await seedThread(page, "new-context");
    await queueLogin(page, baseURL!, "en", 1280); await page.goto(`/inbox?c=${a.id}`); await expect(composer(page)).toBeEnabled();
    const root = await openForm(page), subject = `QA39 private captured ${randomUUID()}`;
    await subjectInput(root).fill(subject); await holdCreateJson(page); installed = true;
    page.on("request", r => { if (r.method() === "POST" && new URL(r.url()).pathname === path) posts++; });
    await root.getByRole("button", { name: label("inbox.create.submit"), exact: true }).click();
    await expect.poll(async () => (await heldJson(page)).held).toBe(true);
    const id = (await heldJson(page)).id;
    expect((await observer.get(`${path}/${id}`)).status()).toBe(200);
    await root.getByRole("button", { name: label("common.close"), exact: true }).click();
    if (boundary === "logout") {
      await page.getByRole("button", { name: "User menu", exact: true }).click();
      await page.getByRole("menuitem", { name: "Sign Out", exact: true }).click();
      await expect(page).toHaveURL(/\/login$/); await expect(form(page)).toHaveCount(0);
    } else {
      expect((await page.request.post("/api/auth/login", { data: { email: ownerB.email, password: ownerB.password } })).status()).toBe(200);
      // Normal SPA navigation mounts a fresh Inbox session. A foreign-resource
      // 404 alone is NOT an auth denial and must not be used as a fake Verify seam.
      const me = await page.request.get("/api/proxy/auth/me"); expect(me.status()).toBe(200);
      const actorB = (await me.json()).id;
      await page.locator('a[href="/dashboard"]').first().click(); await expect(page).toHaveURL(/\/dashboard$/);
      const fresh = page.waitForResponse(response => new URL(response.url()).pathname === "/api/proxy/auth/me" && response.status() === 200);
      await page.locator('a[href="/inbox"]').first().click(); expect((await (await fresh).json()).id).toBe(actorB);
      await selectThread(page, b.subject); await composer(page).fill("B independent draft after verified actor change");
    }
    await releaseJson(page); await expect.poll(async () => (await heldJson(page)).returned).toBe(true); await animationFrames(page);
    await expect(page.getByText(subject, { exact: true })).toHaveCount(0);
    await expect(page.getByText(id, { exact: true })).toHaveCount(0); await expect(form(page)).toHaveCount(0); expect(posts).toBe(1);
    if (boundary === "logout") {
      await expect(page).toHaveURL(/\/login$/);
      // Normal same-actor SPA login must not restore the revoked form receipt.
      await page.getByLabel("Email", { exact: true }).fill(ownerA.email);
      await page.getByLabel("Password", { exact: true }).fill(ownerA.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/); await page.locator('a[href="/inbox"]').first().click();
    } else {
      await expect(page.getByRole("heading", { name: b.subject, exact: true })).toBeVisible();
      await expect(composer(page)).toHaveValue("B independent draft after verified actor change");
      expect((await page.request.get(`${path}/${id}`)).status()).toBe(404);
    }
    const clean = await openForm(page); await expect(subjectInput(clean)).toHaveValue("");
    await expect(notice(clean, "acknowledged")).toHaveCount(0); await expect(clean.getByText(id, { exact: true })).toHaveCount(0);
    const found = await observer.get(`${path}?view=all&q=${encodeURIComponent(subject)}`); expect(found.status()).toBe(200);
    const data = await found.json(); expect(data.total).toBe(1); expect(data.items[0].id).toBe(id); expect(posts).toBe(1);
  } finally {
    if (installed) await page.evaluate(() => {
      const state = (window as unknown as { qaCreationJson?: { release: () => void; restore: () => void } }).qaCreationJson;
      state?.release(); state?.restore();
    });
    await observer.dispose();
  }
});

for (const locale of ["uz", "en", "ru"] as const) for (const width of [360, 390, 1280]) for (const theme of ["light", "dark"] as const) {
test(`Inbox manager chooses arbitrary duplicate-name assignees through captured per-thread guards while self clear and follow stay separate ${locale}/${width}/${theme}`, async ({ page, baseURL }, info) => {
  const { profile } = await queueLogin(page, baseURL!, locale, width), person = await queueCustomer(page, profile);
  const caseResponse = await page.request.post("/api/proxy/cases", { data: { customer_id: person.customer_id,
    vehicle_id: person.vehicle_id, title: `QA39 assignment case ${randomUUID()}`, case_type: "support" } });
  expect(caseResponse.status()).toBe(201); const caseId = (await caseResponse.json()).id as string;
  expect((await page.request.patch(`/api/proxy/cases/${caseId}`, { data: { status: "in_progress" } })).status()).toBe(200);
  const manager = await staff(page, "manager"), sameName = `QA39 duplicate mechanic ${randomUUID()}`;
  const first = await staff(page, "mechanic", sameName), second = await staff(page, "mechanic", sameName);
  const a = await seedThread(page, "assignment-A", { case_id: caseId }), b = await seedThread(page, "assignment-B");
  expect((await page.request.post("/api/auth/login", { data: { email: manager.email, password: manager.password } })).status()).toBe(200);
  expect((await page.request.get("/api/proxy/staff")).status()).toBe(403);
  await page.setViewportSize({ width, height: 568 });
  await page.addInitScript(value => localStorage.setItem("garageos-theme", value), theme);
  await page.goto(`/inbox?c=${a.id}`);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
  expect(label("inbox.choice.assignee", locale)).not.toBe("inbox.choice.assignee");
  expect(label("inbox.choice.search", locale)).not.toBe("inbox.choice.search");
  await expect(composer(page, locale)).toBeEnabled(); await actionReady(page, locale);
  await composer(page, locale).fill("A assignment draft");
  let release!: () => void, held = false, aWrites = 0;
  const gate = new Promise<void>(done => { release = done; });
  // Keep counting after the held route is removed, including reconciliation.
  // Existing observed-read PATCH requests are not assignment writes.
  page.on("request", request => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname === `${path}/${a.id}`
        && Object.hasOwn(request.postDataJSON(), "assigned_user_id")) aWrites++;
  });
  await page.route(`**${path}/${a.id}`, async route => {
    if (route.request().method() !== "PATCH" || !Object.hasOwn(route.request().postDataJSON(), "assigned_user_id")) return route.continue();
    expect(route.request().postDataJSON()).toEqual({ assigned_user_id: first.id });
    const response = await route.fetch(); expect(response.status()).toBe(200); held = true;
    await gate; await route.fulfill({ response });
  });
  try {
    await choose(page, page.getByRole("main"), first.id, locale, { info, tag: `assignment-picker-A-${locale}-${width}-${theme}` });
    await expect.poll(() => held).toBe(true);
    await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); expect(aWrites).toBe(1);
    expect((await stored(page, a.id)).assigned_user_id).toBe(first.id);
    await selectRecordedQueueThread(page, b, a.subject, locale); await composer(page, locale).fill("B assignment draft"); await actionReady(page, locale);
    await choose(page, page.getByRole("main"), second.id, locale, { info, tag: `assignment-picker-B-${locale}-${width}-${theme}` });
    await expect.poll(async () => (await stored(page, b.id)).assigned_user_id).toBe(second.id); await actionReady(page, locale);
    release(); await page.unrouteAll({ behavior: "wait" }); await animationFrames(page);
    await expect(page.getByRole("heading", { name: b.subject, exact: true })).toBeVisible();
    await expect(composer(page, locale)).toHaveValue("B assignment draft"); expect(aWrites).toBe(1);
    let actual = await stored(page, b.id); expect(actual.is_following).toBe(false); expect(actual.assigned_user_id).toBe(second.id);
    await page.getByRole("button", { name: label("message.follow", locale), exact: true }).click(); await actionReady(page, locale);
    await expect.poll(async () => (await stored(page, b.id)).is_following).toBe(true);
    await page.getByRole("button", { name: label("inbox.action.assign_me", locale), exact: true }).click(); await actionReady(page, locale);
    await expect.poll(async () => (await stored(page, b.id)).assigned_user_id).toBe(manager.id);
    await page.getByRole("button", { name: label("inbox.action.clear_assignment", locale), exact: true }).click(); await actionReady(page, locale);
    await expect.poll(async () => (await stored(page, b.id)).assigned_user_id).toBeNull();
    actual = await stored(page, b.id); expect(actual.assigned_user_id).toBeNull(); expect(actual.is_following).toBe(true);
    await expect(composer(page, locale)).toHaveValue("B assignment draft"); await selectRecordedQueueThread(page, a, b.subject, locale);
    await expect(composer(page, locale)).toHaveValue("A assignment draft");
    // A's acknowledgement arrived while B was selected. The existing captured
    // guard deliberately requires a fresh explicit reconciliation on return.
    await expect(page.getByRole("status").filter({ hasText: label("inbox.action.acknowledged", locale) })).toBeVisible();
    const currentStatus = page.getByRole("combobox", { name: label("inbox.action.status", locale), exact: true });
    await expect(currentStatus).toBeDisabled(); expect(aWrites).toBe(1);
    const reconciled = page.waitForResponse(response => response.request().method() === "GET"
      && new URL(response.url()).pathname === `${path}/${a.id}` && response.status() === 200);
    await page.getByRole("button", { name: label("inbox.action.reconcile", locale), exact: true }).click();
    expect((await (await reconciled).json()).id).toBe(a.id);
    await expect(page.getByRole("status").filter({ hasText: label("inbox.action.ready", locale) })).toBeVisible();
    await actionReady(page, locale); expect(aWrites).toBe(1);
    await expect(composer(page, locale)).toHaveValue("A assignment draft");
    actual = await stored(page, a.id); expect(actual.assigned_user_id).toBe(first.id); expect(actual.status).toBe("open"); expect(actual.is_following).toBe(false);
    const ownCase = await page.request.get(`/api/proxy/cases/${caseId}`); expect(ownCase.status()).toBe(200); expect((await ownCase.json()).status).toBe("in_progress");
    await actionReady(page, locale);
    await assertKeyboardFocus(page, page.getByRole("combobox", { name: label("inbox.action.status", locale), exact: true }));
    await queueTargets(page, page.getByRole("main")); await queueOverflow(page);
    await assertAccessible(page, info, `assignment-saved-${locale}-${width}-${theme}`);
    // Only fabricated assignment fixtures receive manual screenshots; the five
    // other protected-form/auth contracts retain screenshot/trace/video off.
    await page.screenshot({ path: info.outputPath(`assignment-saved-${locale}-${width}-${theme}.png`), fullPage: true });
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});
}
