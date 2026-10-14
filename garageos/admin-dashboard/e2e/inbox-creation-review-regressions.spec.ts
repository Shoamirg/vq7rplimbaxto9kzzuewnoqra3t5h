/** Independent prepared owning contracts for the initial six-file candidate.
 * No runtime execution or whole #39 acceptance is implied by collection.
 */
import { expect, test, request, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueLogin } from "./support/queue";
import { translate } from "../lib/i18n/dictionaries";

test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe.configure({ retries: 0 });
const path = "/api/proxy/conversations";
const label = (key: string) => translate("en", key);
const form = (page: Page) => page.getByRole("dialog", { name: label("inbox.create.title"), exact: true });
const subjectInput = (root: Locator) => root.getByRole("textbox", { name: label("inbox.create.subject"), exact: true });
const uncertain = (root: Locator) => root.getByRole("alert").filter({ hasText: label("inbox.create.uncertain") });
async function openForm(page: Page) {
  await page.getByRole("button", { name: label("inbox.create.title"), exact: true }).click();
  const root = form(page); await expect(root).toBeVisible(); return root;
}
async function seedThread(page: Page, prefix: string) {
  const subject = `${prefix} ${randomUUID()}`;
  const response = await page.request.post(path, { data: { subject } });
  expect(response.status()).toBe(201); return { subject, id: (await response.json()).id as string };
}

for (const denial of [401, 403] as const) test(`Inbox uncertain creation survives genuine same-actor ${denial} suspension without replay`, async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const owner = await request.newContext({ baseURL, storageState: await page.context().storageState() });
  const credentials = { email: `${randomUUID()}@example.com`, password: `QA39-${randomUUID()}` };
  const staffResponse = await owner.post("/api/proxy/staff", { data: {
    ...credentials, full_name: `QA39 review receptionist ${randomUUID()}`, role: "receptionist",
  } });
  expect(staffResponse.status()).toBe(201); const actorId = (await staffResponse.json()).id as string;
  let posts = 0, createdId = "", deniedResponses = 0;
  const subject = `QA39 uncertain auth retention ${randomUUID()}`;
  const countPost = (r: import("@playwright/test").Request) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === path) posts++;
  };
  page.on("request", countPost);
  try {
    expect((await page.request.post("/api/auth/login", { data: credentials })).status()).toBe(200);
    const me = await page.request.get("/api/proxy/auth/me"); expect(me.status()).toBe(200);
    expect((await me.json()).id).toBe(actorId);
    await page.goto("/inbox"); let root = await openForm(page);
    await subjectInput(root).fill(subject);
    await page.route(`**${path}`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      expect(route.request().postDataJSON().subject).toBe(subject);
      const response = await route.fetch(); expect(response.status()).toBe(201);
      createdId = (await response.json()).id as string;
      await route.abort("failed"); // Genuine commit, only its browser receipt is lost.
    }, { times: 1 });
    await root.getByRole("button", { name: label("inbox.create.submit"), exact: true }).click();
    await expect(uncertain(root)).toBeVisible(); expect(posts).toBe(1);
    const saved = await owner.get(`${path}/${createdId}`); expect(saved.status()).toBe(200);
    expect(await saved.json()).toMatchObject({ id: createdId, subject });

    // Change normal credentials/current persisted policy, never substitute a
    // status/body. All intercepted responses below are actual BFF/API denials.
    let releaseDenied!: () => void;
    const deniedGate = new Promise<void>(done => { releaseDenied = done; });
    let released = false;
    await page.route("**/api/proxy/**", async route => {
      const response = await route.fetch();
      if (response.status() === denial) { deniedResponses++; if (!released) await deniedGate; }
      await route.fulfill({ response });
    });
    try {
      if (denial === 401) await page.context().addCookies([{ name: "garageos_token", value: "QA39-invalidated-session", url: baseURL! }]);
      else expect((await owner.patch(`/api/proxy/staff/${actorId}`, { data: { role: "mechanic" } })).status()).toBe(200);
      const denied = await page.request.get(path); expect(denied.status()).toBe(denial);
      if (denial === 403) {
        const same = await page.request.get("/api/proxy/auth/me"); expect(same.status()).toBe(200);
        expect((await same.json()).id).toBe(actorId);
      }
      await root.getByRole("button", { name: label("inbox.create.reconcile"), exact: true }).click();
      if (denial === 401) await expect.poll(() => deniedResponses).toBeGreaterThan(0);
      released = true; releaseDenied();
      await expect(page.getByRole("button", { name: label("message.verify"), exact: true })).toBeVisible();
      await expect(form(page)).toHaveCount(0); expect(posts).toBe(1);
    } finally { released = true; releaseDenied(); await page.unrouteAll({ behavior: "wait" }); }

    expect((await owner.patch(`/api/proxy/staff/${actorId}`, { data: { role: "receptionist" } })).status()).toBe(200);
    expect((await page.request.post("/api/auth/login", { data: credentials })).status()).toBe(200);
    const restored = await page.request.get("/api/proxy/auth/me"); expect(restored.status()).toBe(200);
    expect((await restored.json()).id).toBe(actorId);
    await page.getByRole("button", { name: label("message.verify"), exact: true }).click();
    const opener = page.getByRole("button", { name: label("inbox.create.title"), exact: true });
    await expect.poll(async () => await form(page).isVisible()
      || await opener.count() > 0 && await opener.isEnabled()).toBe(true);
    if (!await form(page).isVisible()) await opener.click();
    root = form(page);
    await expect(subjectInput(root)).toHaveValue(subject);
    await expect(uncertain(root)).toBeVisible();
    await expect(root.getByRole("button", { name: label("inbox.create.submit"), exact: true })).toBeDisabled();
    await root.getByRole("button", { name: label("common.close"), exact: true }).focus();
    await page.keyboard.press("Enter"); expect(posts).toBe(1);
    // Native Enter on Close is a deliberate close, not another submission.
    // Wait for its normal exit before reopening and checking retained outcome.
    await expect(form(page)).toHaveCount(0);
    await opener.click();
    root = form(page);
    await expect(subjectInput(root)).toHaveValue(subject);
    await expect(uncertain(root)).toBeVisible();
    await expect(root.getByRole("button", { name: label("inbox.create.submit"), exact: true })).toBeDisabled();
    await root.getByRole("button", { name: label("inbox.create.reconcile"), exact: true }).click();
    await expect(root.getByText(createdId, { exact: true })).toBeVisible();
    await expect(root.getByText(label("inbox.create.duplicate_risk"), { exact: true })).toBeVisible();
    const again = root.getByRole("button", { name: label("inbox.create.create_again"), exact: true });
    await expect(again).toBeDisabled(); expect(posts).toBe(1);
    await root.getByRole("checkbox", { name: label("inbox.create.acknowledge_risk"), exact: true }).check();
    await expect(again).toBeEnabled(); // Deliberate duplicate is allowed, never dispatched by this assertion.
    expect(posts).toBe(1);
    const matches = await owner.get(`${path}?view=all&q=${encodeURIComponent(subject)}`);
    expect(matches.status()).toBe(200); const data = await matches.json();
    expect(data.total).toBe(1); expect(data.items[0].id).toBe(createdId);
  } finally {
    page.off("request", countPost); await page.unrouteAll({ behavior: "wait" });
    expect((await owner.patch(`/api/proxy/staff/${actorId}`, { data: { role: "receptionist" } })).status()).toBe(200);
    await owner.dispose();
  }
});

test("Inbox creation and choice dialogs isolate focused-button f j k from background follow and selection", async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const group = `QA39 dialog shortcuts ${randomUUID()}`;
  const a = await seedThread(page, `${group} A`), b = await seedThread(page, `${group} B`);
  await page.goto(`/inbox?c=${a.id}`);
  await expect(page.getByRole("status").filter({ hasText: label("inbox.read.acknowledged") })).toBeVisible();
  const queues = page.getByRole("navigation", { name: label("inbox.queue_navigation"), exact: true });
  if (!await queues.isVisible()) await page.getByRole("button", { name: label("message.queues"), exact: true }).click();
  await queues.getByRole("button").filter({ has: page.getByText(label("inbox.view.all"), { exact: true }) }).click();
  const closeQueues = page.getByRole("button", { name: label("message.close_queues"), exact: true });
  if (await closeQueues.isVisible()) await closeQueues.click();
  await page.getByRole("textbox", { name: label("inbox.search"), exact: true }).fill(group);
  const list = page.getByRole("region", { name: label("message.conversations"), exact: true });
  for (const record of [a, b]) await expect(list.getByRole("button").filter({ has: page.getByText(record.subject, { exact: true }) })).toHaveCount(1);
  const members = await page.request.get(`${path}?view=all&q=${encodeURIComponent(group)}`);
  expect(members.status()).toBe(200);
  expect((await members.json()).items.map((row: { id: string }) => row.id).sort()).toEqual([a.id, b.id].sort());
  await expect(page.getByRole("combobox", { name: label("inbox.action.status"), exact: true })).toBeEnabled();
  // The actual ThreadView title is a paragraph, not a heading. A DOM locator
  // remains valid while Radix correctly hides the background accessibility tree.
  const overview = page.locator(`[role="region"][aria-label=${JSON.stringify(label("message.overview"))}]`);
  await expect(overview.getByText(a.subject, { exact: true }).first()).toBeVisible();
  let followWrites = 0;
  const observe = (r: import("@playwright/test").Request) => {
    if (["POST", "DELETE"].includes(r.method()) && new URL(r.url()).pathname.endsWith("/follow")) followWrites++;
  };
  page.on("request", observe);
  // Observe completion of genuine browser fetch + consumed JSON without changing
  // credentials, response contents or business API behavior.
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    const state = { pending: 0, restore: () => { window.fetch = original; } };
    (window as unknown as { qaShortcutDrain: typeof state }).qaShortcutDrain = state;
    window.fetch = async (...args) => {
      state.pending++;
      try {
        const response = await original(...args), json = response.json.bind(response);
        let settled = false;
        response.json = async () => { try { return await json(); } finally { if (!settled) { settled = true; state.pending--; } } };
        return response;
      } catch (error) { state.pending--; throw error; }
    };
  });
  try {
    const root = await openForm(page);
    await subjectInput(root).fill("QA39 retained shortcut form");
    const close = root.getByRole("button", { name: label("common.close"), exact: true });
    for (const stage of ["creation", "choice"] as const) {
      if (stage === "choice") await root.getByRole("button", { name: label("inbox.choice.assignee"), exact: true }).click();
      const current = stage === "creation" ? root : page.getByRole("dialog", { name: label("inbox.choice.assignee"), exact: true });
      const button = stage === "creation" ? close : current.getByRole("button", { name: label("inbox.choice.clear"), exact: true });
      for (const key of ["f", "j", "k"]) {
        await button.focus(); await expect(button).toBeFocused(); await page.keyboard.press(key);
        await expect.poll(() => page.evaluate(() => (window as unknown as { qaShortcutDrain: { pending: number } }).qaShortcutDrain.pending)).toBe(0);
        await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
        expect(followWrites, `${stage} ${key} must not dispatch background follow`).toBe(0);
        await expect(current).toBeVisible();
        await expect(overview.getByText(a.subject, { exact: true }).first()).toHaveText(a.subject);
        await expect(overview.getByText(b.subject, { exact: true })).toHaveCount(0);
        const recorded = await page.request.get(`${path}/${a.id}`); expect(recorded.status()).toBe(200);
        expect((await recorded.json()).is_following).toBe(false);
      }
      if (stage === "choice") { await page.keyboard.press("Escape"); await expect(current).toHaveCount(0); }
    }
    await expect(subjectInput(root)).toHaveValue("QA39 retained shortcut form");
  } finally {
    page.off("request", observe);
    await page.evaluate(() => (window as unknown as { qaShortcutDrain: { restore: () => void } }).qaShortcutDrain.restore());
  }
});
