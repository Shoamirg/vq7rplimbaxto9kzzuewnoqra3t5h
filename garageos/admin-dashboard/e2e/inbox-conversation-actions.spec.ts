import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { withFailureDiagnostics } from "./support/failure-diagnostics";
import { queueLogin, queueOverflow, queueTargets, switchQueueLocale } from "./support/queue";
import { assertAccessible, assertKeyboardFocus } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off" });

async function createThread(page: Page) {
  const subject = `QA39 Action ${randomUUID()}`;
  const response = await page.request.post("/api/proxy/conversations", { data: { subject } });
  expect(response.status()).toBe(201);
  return { id: (await response.json()).id as string, subject };
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
