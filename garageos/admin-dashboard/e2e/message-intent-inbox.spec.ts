import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { beginLifecycleDiagnostic, lifecyclePhase, saveLifecycleDiagnostic } from "./support/message-lifecycle-diagnostics";
import { operationCases, storedThread } from "./support/operations";
import { queueLogin, queueOverflow, queueTargets, switchQueueLocale } from "./support/queue";
import { assertAccessible, assertKeyboardFocus, settleMotion } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off" });
test.beforeEach(({ page }, info) => beginLifecycleDiagnostic(page, info));
test.afterEach(({ page }, info) => saveLifecycleDiagnostic(page, info));

async function selectRecordedQueueThread(page: Page, locale: Locale, target: { id: string; subject: string }, previousSubject: string) {
  // Search real server records instead of assuming their queue priority places
  // them on page one. Filtering must preserve the current selected identity.
  const searched = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === "/api/proxy/conversations"
      && url.searchParams.get("q") === target.subject && url.searchParams.get("offset") === "0";
  });
  await page.getByRole("textbox", { name: translate(locale, "inbox.search"), exact: true }).fill(target.subject);
  const response = await searched; expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.total).toBe(1); expect(result.offset).toBe(0);
  expect(result.items.map((item: { id: string; subject: string }) => ({ id: item.id, subject: item.subject }))).toEqual([target]);
  // On phones the open list hides, but does not replace, the selected thread.
  await expect(page.getByRole("heading", { name: previousSubject, exact: true, includeHidden: true })).toHaveCount(1);
  const row = page.getByRole("region", { name: translate(locale, "message.conversations"), exact: true }).getByRole("button")
    .filter({ has: page.getByText(target.subject, { exact: true }) });
  await expect(row).toHaveCount(1);
  if (target.subject === previousSubject) await expect(row).toHaveAttribute("aria-current", "true");
  const opened = page.waitForResponse(response => response.request().method() === "GET"
    && new URL(response.url()).pathname === `/api/proxy/conversations/${target.id}`);
  await row.click();
  const detail = await opened; expect(detail.status()).toBe(200);
  const snapshot = await detail.json();
  expect({ id: snapshot.id, subject: snapshot.subject }).toEqual(target);
  await expect(page.getByRole("heading", { name: target.subject, exact: true })).toBeVisible();
  return snapshot;
}

for (const [locale, width] of [["uz", 360], ["en", 390], ["ru", 1280]] as const)
test(`Inbox dark recovery ${locale} ${width} keeps queue text readable and retries the original receipt`, async ({ page, baseURL }, info) => {
  const { items } = await operationCases(page, baseURL!), item = items[1], thread = await storedThread(page, item.id);
  await queueLogin(page, baseURL!, locale, width); await page.goto(`/inbox?c=${thread.id}`);
  const label = (key: string) => translate(locale, key), path = `/api/proxy/conversations/${thread.id}/messages`;
  // Normal staff producer records incoming display snapshots; no mocked thread data.
  const incomingName = `QA38 Incoming customer ${randomUUID()}`, incomingBody = "Incoming O‘tkir Русский <literal> &";
  const incoming = await page.request.post(path, { data: { body: incomingBody, author_role: "customer", author_name: incomingName } });
  expect(incoming.status()).toBe(201); const incomingMessage = await incoming.json();
  expect(incomingMessage.author_role).toBe("customer"); expect(incomingMessage.author_name).toBe(incomingName);
  await page.reload();
  const composer = page.getByRole("textbox", { name: label("ops.message"), exact: true }); await expect(composer).toBeEnabled();
  const body = `  QA38 Dark ${randomUUID()} O‘tkir Русский <literal> &  `;
  let key: string | undefined, messageID: string | undefined, payload: unknown, posts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(path)) posts++; });
  await page.route(`**${path}`, async route => {
    key = route.request().headers()["idempotency-key"]; payload = route.request().postDataJSON();
    const response = await route.fetch(); expect(response.status()).toBe(201);
    messageID = (await response.json()).id; await route.abort("failed");
  }, { times: 1 });
  await composer.fill(body); await composer.press("Enter");
  const retry = page.getByRole("button", { name: label("message.retry"), exact: true }); await expect(retry).toBeVisible();
  const toggle = page.getByRole("button", { name: label("menu.dark_mode"), exact: true });
  await assertKeyboardFocus(page, toggle); await toggle.click(); await expect(page.locator("html")).toHaveClass(/dark/);
  if (width < 1280) await page.getByRole("button", { name: label("message.conversations"), exact: true }).click();
  const queue = page.getByRole("region", { name: label("message.conversations"), exact: true });
  await expect(queue.getByRole("button").last()).toBeVisible();
  // Reach the lower real rows so their themed SLA text is part of the scan.
  await assertKeyboardFocus(page, queue.getByRole("button").last()); await queueOverflow(page);
  await queueTargets(page, page.locator("main"));
  await page.screenshot({ path: info.outputPath(`inbox-dark-queue-${locale}-${width}.png`), fullPage: true });
  await assertAccessible(page, info, `inbox-dark-queue-${locale}-${width}`);
  await selectRecordedQueueThread(page, locale, { id: thread.id, subject: thread.subject }, thread.subject);
  await expect(composer).toHaveValue(body); await expect(retry).toBeVisible(); expect(posts).toBe(1);
  const incomingAuthor = page.getByText(incomingName, { exact: true });
  await incomingAuthor.scrollIntoViewIfNeeded(); await expect(incomingAuthor).toBeVisible();
  await expect(page.getByText(incomingBody, { exact: true })).toBeVisible();
  await assertAccessible(page, info, `inbox-dark-incoming-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`inbox-dark-incoming-${locale}-${width}.png`), fullPage: true });
  await assertKeyboardFocus(page, retry);
  const replay = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(path));
  await retry.click(); const request = await replay;
  expect(request.headers()["idempotency-key"]).toBe(key); expect(request.postDataJSON()).toEqual(payload);
  await expect(page.getByRole("status").filter({ hasText: label("message.saved") })).toBeVisible(); expect(posts).toBe(2);
  const messages = (await storedThread(page, item.id)).messages.filter((message: { body: string }) => message.body === body);
  expect(messages).toHaveLength(1); expect(messages[0].id).toBe(messageID);
  await queueOverflow(page); await assertAccessible(page, info, `inbox-dark-recovered-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`inbox-dark-recovered-${locale}-${width}.png`), fullPage: true });
  const activity = page.getByRole("button", { name: label("message.activity"), exact: true });
  await assertKeyboardFocus(page, activity); await activity.click();
  await incomingAuthor.scrollIntoViewIfNeeded(); await expect(incomingAuthor).toBeVisible();
  await assertAccessible(page, info, `inbox-dark-activity-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`inbox-dark-activity-${locale}-${width}.png`), fullPage: true });
});

test("Inbox lost committed response retains exact draft and recovers the original key after reload", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1];
  const thread = await storedThread(page, item.id), path = `/api/proxy/conversations/${thread.id}/messages`;
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/inbox?c=${thread.id}`);
  const composer = page.locator("textarea"); await expect(composer).toBeVisible();
  const body = `  QA38 Inbox lost ${randomUUID()}\nO‘tkir & Русский  `;
  let originalKey: string | undefined, saved!: { id: string; body: string };
  await page.route(`**${path}`, async route => {
    originalKey = route.request().headers()["idempotency-key"];
    const response = await route.fetch(); expect(response.status()).toBe(201); saved = await response.json();
    await route.abort("failed");
  }, { times: 1 });
  await composer.fill(body); await page.getByRole("button", { name: /^(Send|Send message)$/ }).click();
  await expect.poll(() => originalKey ?? "missing").toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
  await expect(composer).toHaveValue(body); expect(saved.body).toBe(body);
  await page.reload(); await expect(composer).toHaveValue(body);
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  const replay = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith(path));
  await page.getByRole("button", { name: "Retry original message", exact: true }).click();
  expect((await replay).headers()["idempotency-key"]).toBe(originalKey);
  await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible();
  await expect(composer).toHaveValue("");
  const current = await storedThread(page, item.id), messages = current.messages.filter((m: { body: string }) => m.body === body);
  expect(messages).toHaveLength(1); expect(messages[0].id).toBe(saved.id);
});

test("Inbox pre-upstream rejection retains exact draft until explicit resolution", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1];
  const thread = await storedThread(page, item.id), path = `/api/proxy/conversations/${thread.id}/messages`;
  await page.setViewportSize({ width: 1920, height: 1000 }); await page.goto(`/inbox?c=${thread.id}`);
  const composer = page.locator("textarea"), body = `  QA38 Inbox rejected ${randomUUID()}  `;
  await expect(composer).toBeVisible();
  await page.route(`**${path}`, route => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "QA rejected before upstream" }) }), { times: 1 });
  await composer.fill(body); await page.getByRole("button", { name: /^(Send|Send message)$/ }).click();
  await expect(composer).toHaveValue(body);
  await expect(page.getByRole("alert").filter({ hasText: "Message was rejected" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  expect((await storedThread(page, item.id)).messages.some((m: { body: string }) => m.body === body)).toBe(false);
  await page.getByRole("button", { name: "Keep draft and resolve", exact: true }).click(); await expect(composer).toHaveValue(body);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible();
  expect((await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
});

test("Inbox phone exposes acknowledged list refresh failure in the selected thread", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1], thread = await storedThread(page, item.id);
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto(`/inbox?c=${thread.id}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  const body = `QA38 Inbox phone list ${randomUUID()}`;
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, async route => {
    const response = await route.fetch(); expect(response.status()).toBe(201);
    await page.route("**/api/proxy/conversations?*", read => read.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await route.fulfill({ response });
  }, { times: 1 });
  await composer.fill(body); await composer.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Message is sent, but the conversation refresh failed." })).toBeVisible();
  expect((await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
});

test("Inbox failed initial list read never claims an empty inbox", async ({ page, baseURL }) => {
  await operationCases(page, baseURL!);
  await page.route("**/api/proxy/conversations?*", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.goto("/inbox");
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "ops.read_error") })).toBeVisible();
  await expect(page.getByText(/Nothing here.*inbox zero/)).toHaveCount(0);
  await expect(page.getByText("No conversations recorded.", { exact: true })).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" }); await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("textarea")).toBeEnabled();
});

test("Inbox phone keeps existing queue and channel controls reachable", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), thread = await storedThread(page, items[1].id);
  await page.setViewportSize({ width: 360, height: 900 }); await page.goto(`/inbox?c=${thread.id}`);
  await expect(page.locator("textarea")).toBeEnabled();
  await page.getByRole("button", { name: "Queues and filters", exact: true }).click();
  const unreadRead = page.waitForRequest(r => r.method() === "GET" && r.url().includes("/api/proxy/conversations?") && new URL(r.url()).searchParams.get("view") === "unread");
  await page.getByRole("button", { name: /^● Unread/ }).click(); await unreadRead;
  const channelRead = page.waitForRequest(r => r.method() === "GET" && r.url().includes("/api/proxy/conversations?") && new URL(r.url()).searchParams.get("channel") === "telegram");
  await page.getByRole("button", { name: /Telegram/ }).click(); await channelRead;
  await page.getByRole("button", { name: "Close queues", exact: true }).click(); await expect(page.locator("textarea")).toBeEnabled();
  await queueOverflow(page);
});

test("Inbox already authorized draft stays editable during a held thread refresh", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), thread = await storedThread(page, items[1].id);
  await page.goto(`/inbox?c=${thread.id}`); const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  let release!: () => void, seen!: () => void, heldOnce = false; const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/conversations/${thread.id}`, async route => {
    if (route.request().method() !== "GET" || heldOnce) return route.continue();
    heldOnce = true;
    const response = await route.fetch(); seen(); await held;
    try { await route.fulfill({ response }); } catch (error) { if (!(error instanceof Error) || !error.message.includes("already handled")) throw error; }
  });
  try {
    await page.getByRole("button", { name: "Refresh conversation", exact: true }).click(); await fetched;
    await expect(composer).toBeEnabled(); await composer.fill("Draft while refreshing"); await expect(composer).toBeFocused();
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled(); release();
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled(); await expect(composer).toHaveValue("Draft while refreshing");
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Inbox real announcement conflict preserves the exact draft and explicitly resolves to a new key", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1], thread = await storedThread(page, item.id);
  await page.goto(`/inbox?c=${thread.id}`); const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  await page.getByRole("button", { name: "Announcement", exact: true }).click();
  const body = `  QA38 Inbox announcement ${randomUUID()}  `, other = `QA38 Inbox conflict owner ${randomUUID()}`, path = `/api/proxy/conversations/${thread.id}/messages`;
  let key: string | undefined;
  await page.route(`**${path}`, async route => {
    key = route.request().headers()["idempotency-key"];
    expect((await page.request.post(path, { headers: { "Idempotency-Key": key! }, data: { ...route.request().postDataJSON(), body: other } })).status()).toBe(201);
    await route.continue();
  }, { times: 1 });
  await composer.fill(body); await composer.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "This submission key belongs to different content" })).toBeVisible();
  await page.reload(); await expect(composer).toHaveValue(body);
  await expect(page.getByRole("button", { name: "Announcement", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Keep draft and resolve", exact: true }).click();
  const post = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith(path)); await composer.press("Enter");
  expect((await post).headers()["idempotency-key"]).not.toBe(key);
  await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible();
  const messages = (await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body);
  expect(messages).toHaveLength(1); expect(messages[0].kind).toBe("announcement"); expect(messages[0].is_internal).toBe(false);
});

test("Inbox ACK preserves a newer note and sent status when the thread refresh fails", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1], thread = await storedThread(page, item.id);
  await page.goto(`/inbox?c=${thread.id}`); const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  const body = `QA38 Inbox ACK ${randomUUID()}`, newer = "  Newer Inbox note  ";
  let release!: () => void, seen!: () => void, posts = 0;
  const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, async route => {
    posts++; const response = await route.fetch(); expect(response.status()).toBe(201);
    await page.route(`**/api/proxy/conversations/${thread.id}`, read => read.request().method() === "GET" ? read.fulfill({ status: 503, contentType: "application/json", body: "{}" }) : read.continue());
    seen(); await held; await route.fulfill({ response });
  }, { times: 1 });
  try {
    await composer.fill(body); await composer.press("Enter"); await fetched; await composer.press("Enter");
    await page.getByRole("button", { name: "Internal note", exact: true }).click(); await composer.fill(newer);
    release(); await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Message is sent, but the conversation refresh failed." })).toBeVisible();
    await expect(composer).toHaveValue(newer); expect(posts).toBe(1);
    await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Messages", exact: true }).getByText(body, { exact: true })).toHaveCount(1);
    await page.unrouteAll({ behavior: "wait" }); await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(composer).toBeEnabled(); await expect(composer).toHaveValue(newer);
    await page.reload(); await page.getByRole("button", { name: "Internal note", exact: true }).click(); await expect(composer).toHaveValue(newer);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Inbox captured A ACK cannot paint B or overwrite a newer A draft across A to B to A", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), [a, b] = items;
  const threadA = await storedThread(page, a.id), threadB = await storedThread(page, b.id);
  await page.goto(`/inbox?c=${threadA.id}`); const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  const original = `QA38 Inbox captured ${randomUUID()}`, newer = "  Newer A draft  ";
  let release!: () => void, seen!: () => void; const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/conversations/${threadA.id}/messages`, async route => {
    const response = await route.fetch(); expect(response.status()).toBe(201); seen(); await held; await route.fulfill({ response });
  }, { times: 1 });
  try {
    await composer.fill(original); await composer.press("Enter"); await fetched; await composer.fill(newer);
    await page.evaluate(id => history.pushState(null, "", `/inbox?c=${id}`), threadB.id);
    await expect(composer).toBeEnabled(); await expect(composer).toHaveValue(""); await composer.fill("B independent draft");
    release();
    await expect.poll(() => page.evaluate(() => {
      const active = sessionStorage.getItem("garageos.message-intents.v1:actor")!;
      return JSON.parse(sessionStorage.getItem(active)!).intents.length;
    })).toBe(0);
    await expect(composer).toHaveValue("B independent draft");
    await expect(page.getByRole("region", { name: "Messages", exact: true }).getByText(original, { exact: true })).toHaveCount(0);
    await page.evaluate(id => history.pushState(null, "", `/inbox?c=${id}`), threadA.id);
    await expect(composer).toHaveValue(newer); await expect(page.getByRole("region", { name: "Messages", exact: true }).getByText(original, { exact: true })).toHaveCount(1);
    expect((await storedThread(page, a.id)).messages.filter((m: { body: string }) => m.body === original)).toHaveLength(1);
    expect((await storedThread(page, b.id)).messages.some((m: { body: string }) => m.body === original)).toBe(false);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Inbox cancelled read settles before polling and its late JSON cannot overwrite a deliberate refresh", async ({ page, baseURL }, info) => {
  const { items } = await operationCases(page, baseURL!), [a, b] = items;
  const threadA = await storedThread(page, a.id), threadB = await storedThread(page, b.id);
  await page.goto(`/inbox?c=${threadA.id}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toBeEnabled();
  const body = `QA38 Inbox cancelled read ${randomUUID()}`, newer = "  Current A draft  ";
  const readPath = `/api/proxy/conversations/${threadA.id}`;
  const posts: { key: string; body: string }[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith(`${readPath}/messages`))
      posts.push({ key: request.headers()["idempotency-key"], body: request.postDataJSON().body });
  });
  await page.evaluate(path => {
    const original = window.fetch;
    const qa = window as unknown as {
      armRead: boolean; ackHeld: boolean; readHeld: boolean; readDelivered: boolean; ackId: string;
      releaseACK?: () => void; releaseRead?: () => void;
    };
    let firstPost = true;
    window.fetch = async (...args) => {
      const url = String(args[0]), method = args[1]?.method ?? "GET";
      const holdACK = firstPost && method === "POST" && url.endsWith(`${path}/messages`);
      const holdRead = qa.armRead && method === "GET" && url.endsWith(path);
      if (holdACK) firstPost = false;
      if (holdRead) qa.armRead = false;
      const response = await original(...args);
      if (holdACK || holdRead) {
        const json = response.json.bind(response);
        response.json = async () => {
          const value: unknown = await json();
          if (holdACK) {
            qa.ackId = (value as { id: string }).id;
            await new Promise<void>(resolve => { qa.releaseACK = resolve; qa.ackHeld = true; });
          }
          else {
            await new Promise<void>(resolve => { qa.releaseRead = resolve; qa.readHeld = true; });
            qa.readDelivered = true;
          }
          return value;
        };
      }
      return response;
    };
  }, readPath);
  const release = () => page.evaluate(() => {
    const qa = window as unknown as { releaseACK?: () => void; releaseRead?: () => void };
    qa.releaseACK?.(); qa.releaseRead?.();
  });
  try {
    await composer.fill(body); await composer.press("Enter");
    await page.waitForFunction(() => (window as unknown as { ackHeld: boolean }).ackHeld);
    await composer.fill(newer);
    await selectRecordedQueueThread(page, "en", { id: threadB.id, subject: threadB.subject }, threadA.subject);
    await expect(composer).toHaveValue(""); await composer.fill("B independent draft");
    await selectRecordedQueueThread(page, "en", { id: threadA.id, subject: threadA.subject }, threadB.subject);
    await expect(composer).toHaveValue(newer);
    const refresh = page.getByRole("button", { name: "Refresh conversation", exact: true });
    await expect(refresh).toBeEnabled();
    await page.evaluate(() => (window as unknown as { armRead: boolean }).armRead = true);
    await refresh.click();
    await page.waitForFunction(() => (window as unknown as { readHeld: boolean }).readHeld);
    await expect(refresh).toBeDisabled();
    await page.evaluate(() => (window as unknown as { releaseACK: () => void }).releaseACK());
    await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible();
    await expect(refresh).toBeEnabled({ timeout: 1000 });
    await expect(composer).toHaveValue(newer); expect(posts).toHaveLength(1);
    expect(posts[0].body).toBe(body); expect(posts[0].key).toMatch(/^[0-9a-f-]{36}$/);
    const acknowledgedId = await page.evaluate(() => (window as unknown as { ackId: string }).ackId);
    expect(acknowledgedId).toMatch(/^[0-9a-f-]{36}$/);
    const marker = `QA38 Inbox fresh after cancellation ${randomUUID()}`;
    const freshWrite = await page.request.post(`${readPath}/messages`, {
      headers: { "Idempotency-Key": randomUUID() }, data: { body: marker, channel: "web", author_role: "dispatcher" },
    });
    expect(freshWrite.status()).toBe(201);
    await refresh.click();
    const messages = page.getByRole("region", { name: "Messages", exact: true });
    await expect(messages.getByText(marker, { exact: true })).toHaveCount(1);
    await page.evaluate(() => (window as unknown as { releaseRead: () => void }).releaseRead());
    await page.waitForFunction(() => (window as unknown as { readDelivered: boolean }).readDelivered);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(messages.getByText(marker, { exact: true })).toHaveCount(1);
    await expect(messages.getByText(body, { exact: true })).toHaveCount(1);
    await expect(refresh).toBeEnabled(); await expect(composer).toHaveValue(newer); expect(posts).toHaveLength(1);
    const persisted = await storedThread(page, a.id);
    expect(persisted.messages.filter((message: { body: string }) => message.body === body)).toHaveLength(1);
    expect(persisted.messages.find((message: { body: string }) => message.body === body).id).toBe(acknowledgedId);
    expect(persisted.messages.filter((message: { body: string }) => message.body === marker)).toHaveLength(1);
    await selectRecordedQueueThread(page, "en", { id: threadB.id, subject: threadB.subject }, threadA.subject);
    await expect(composer).toHaveValue("B independent draft");
    expect((await storedThread(page, b.id)).messages.some((message: { body: string }) => message.body === body || message.body === marker)).toBe(false);
    await queueOverflow(page); await assertAccessible(page, info, "inbox-cancelled-read-recovered");
    await page.screenshot({ path: info.outputPath("inbox-cancelled-read-recovered.png"), fullPage: true });
  } finally { await release(); }
});

test("Inbox invalidated session hides and suspends its receipt until same-actor verification and deliberate retry", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1], thread = await storedThread(page, item.id), path = `/api/proxy/conversations/${thread.id}/messages`;
  await page.goto(`/inbox?c=${thread.id}`); const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  const body = `QA38 Inbox invalidated ${randomUUID()}`; let key: string | undefined, posts = 0;
  page.on("request", r => { if (r.method() === "POST" && r.url().endsWith(path)) posts++; });
  await page.route(`**${path}`, async route => { key = route.request().headers()["idempotency-key"]; expect((await route.fetch()).status()).toBe(201); await route.abort("failed"); }, { times: 1 });
  await composer.fill(body); await composer.press("Enter"); await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
  // Invalidate only after the authorized thread read has restored deliberate
  // retry readiness; an in-flight read may otherwise reject the cookie first.
  await expect(page.getByRole("status").filter({ hasText: "Viewed history acknowledged." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeEnabled();
  // Exercise the deliberate retry boundary before a concurrent background
  // read paints its denial. Hold only real upstream 401 responses; neither
  // authentication nor response content is replaced by the fixture.
  let releaseDenials!: () => void;
  const deniedReplies = new Promise<void>(resolve => { releaseDenials = resolve; });
  await page.route("**/api/proxy/**", async route => {
    const response = await route.fetch();
    if (response.status() === 401) await deniedReplies;
    await route.fulfill({ response });
  });
  try {
    await page.context().addCookies([{ name: "garageos_token", value: "QA-invalidated-token", url: baseURL!, httpOnly: true }]);
    await page.getByRole("button", { name: "Retry original message", exact: true }).click();
    releaseDenials();
    await expect(page.getByRole("button", { name: "Verify session and access", exact: true })).toBeVisible(); await expect(composer).toHaveCount(0); expect(posts).toBe(1);
    const receipt = await page.evaluate(() => { const active = sessionStorage.getItem("garageos.message-intents.v1:actor")!; return JSON.parse(sessionStorage.getItem(active)!).intents[0]; });
    expect(receipt.key).toBe(key); expect(receipt.payload.body).toBe(body); expect(receipt.status).toBe("suspended");
    await queueLogin(page, baseURL!, "en", 1280); await page.getByRole("button", { name: "Verify session and access", exact: true }).click();
    await expect(composer).toHaveValue(body); expect(posts).toBe(1);
    const retry = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith(path)); await page.getByRole("button", { name: "Retry original message", exact: true }).click();
    expect((await retry).headers()["idempotency-key"]).toBe(key); await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible();
    expect(posts).toBe(2); expect((await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
  } finally { releaseDenials(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Inbox late A mark-read denial cannot suspend a newly verified B session", async ({ page, baseURL }) => {
  const first = await operationCases(page, baseURL!), threadA = await storedThread(page, first.items[1].id);
  const second = await operationCases(page, baseURL!, 2, 1), threadB = await storedThread(page, second.items[1].id);
  await queueLogin(page, baseURL!, "en", 1280, 0);
  let release!: () => void, seen!: () => void; const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/conversations/${threadA.id}`, async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    const response = await route.fetch({ headers: { ...route.request().headers(), cookie: "garageos_token=QA-invalidated-old-mark-read" } });
    expect(response.status()).toBe(401); seen(); await held; await route.fulfill({ response });
  });
  try {
    await page.goto(`/inbox?c=${threadA.id}`); const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled(); await fetched;
    await page.route(`**/api/proxy/conversations/${threadA.id}/messages`, route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
    await composer.fill(`QA38 held old mark-read ${randomUUID()}`); await composer.press("Enter"); await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
    await queueLogin(page, baseURL!, "en", 1280, 1); await page.getByRole("button", { name: "Retry original message", exact: true }).click();
    await expect(page.getByRole("button", { name: "Verify session and access", exact: true })).toBeVisible();
    await page.evaluate(id => history.pushState(null, "", `/inbox?c=${id}`), threadB.id);
    await page.getByRole("button", { name: "Verify session and access", exact: true }).click(); await expect(composer).toBeEnabled(); await composer.fill("B verified independent draft");
    const deniedResponse = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().endsWith(`/conversations/${threadA.id}`) && r.status() === 401);
    release(); await (await deniedResponse).finished();
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await expect(composer).toHaveValue("B verified independent draft");
    await expect(page.getByRole("button", { name: "Verify session and access", exact: true })).toHaveCount(0);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Inbox short phone queue drawer scrolls to the last channel with actual wheel input", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), thread = await storedThread(page, items[1].id);
  await page.setViewportSize({ width: 360, height: 568 }); await page.goto(`/inbox?c=${thread.id}`); await expect(page.locator("textarea")).toBeEnabled();
  await page.getByRole("button", { name: "Queues and filters", exact: true }).click();
  const rail = page.getByRole("navigation").filter({ has: page.getByRole("button", { name: /Web/ }) });
  await rail.hover({ position: { x: 100, y: 100 } }); await page.mouse.wheel(0, 1400);
  await expect.poll(() => rail.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.getByRole("button", { name: /Web/ }).evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })).toBe(true);
  await page.getByRole("button", { name: /Web/ }).click(); await queueOverflow(page);
});

for (const width of [360, 390]) test(`Inbox short phone ${width} keeps the composer on screen while linked details are open`, async ({ page, baseURL }, info) => {
  const { items } = await operationCases(page, baseURL!), item = items[1], thread = await storedThread(page, item.id);
  await page.setViewportSize({ width, height: 568 }); await page.goto(`/inbox?c=${thread.id}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  await assertKeyboardFocus(page, composer);
  expect(await composer.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height >= 64; })).toBe(true);
  const body = `QA38 Inbox short phone ${width} ${randomUUID()}`; await composer.fill(body);
  const send = page.getByRole("button", { name: "Send message", exact: true }); await assertKeyboardFocus(page, send); await send.click();
  await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeInViewport({ ratio: 1 });
  expect((await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
  await queueOverflow(page); await assertAccessible(page, info, `inbox-short-phone-${width}`);
  await page.screenshot({ path: info.outputPath(`inbox-short-phone-${width}.png`), fullPage: true });
});

test("Inbox lost committed note keeps a separate reply draft and two intentional identical notes use distinct keys", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1], thread = await storedThread(page, item.id), path = `/api/proxy/conversations/${thread.id}/messages`;
  await page.goto(`/inbox?c=${thread.id}`); const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  const body = `QA38 Inbox intentional note twice ${randomUUID()}`, reply = "  Separate reply retained  ", keys: string[] = [];
  page.on("request", r => { if (r.method() === "POST" && r.url().endsWith(path)) keys.push(r.headers()["idempotency-key"]); });
  await page.getByRole("button", { name: "Internal note", exact: true }).click();
  await page.route(`**${path}`, async route => { expect((await route.fetch()).status()).toBe(201); await route.abort("failed"); }, { times: 1 });
  await composer.fill(body); await composer.press("Enter"); await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).click(); await composer.fill(reply); await page.reload();
  await expect(page.getByRole("button", { name: "Internal note", exact: true })).toHaveAttribute("aria-pressed", "true"); await expect(composer).toHaveValue(body);
  await page.getByRole("button", { name: "Reply", exact: true }).click(); await expect(composer).toHaveValue(reply);
  await page.getByRole("button", { name: "Retry original message", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible(); await expect(composer).toHaveValue(reply);
  await page.getByRole("button", { name: "Internal note", exact: true }).click(); await expect(composer).toHaveValue("");
  await composer.fill(body); await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled(); await composer.press("Enter"); await expect(composer).toHaveValue("");
  expect(keys).toHaveLength(3); expect(keys[1]).toBe(keys[0]); expect(keys[2]).not.toBe(keys[0]);
  const saved = (await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body);
  expect(saved).toHaveLength(2); expect(saved[0].id).not.toBe(saved[1].id);
  expect(saved.every((m: { kind: string; is_internal: boolean; channel: string }) => m.kind === "note" && m.is_internal && m.channel === "internal")).toBe(true);
});

test("Inbox confirmed different actor purges old drafts even when the new actor cannot open A", async ({ page, baseURL }) => {
  const { items, person } = await operationCases(page, baseURL!), thread = await storedThread(page, items[1].id);
  await page.goto(`/inbox?c=${thread.id}`); const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  const body = `QA38 Inbox private A ${randomUUID()}`;
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
  await composer.fill(body); await composer.press("Enter"); await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("qa-unrelated-preference", "keep"));
  await lifecyclePhase(page, "before-actor-change");
  let posts = 0; page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(`/api/proxy/conversations/${thread.id}/messages`)) posts++; });
  await queueLogin(page, baseURL!, "en", 1280, 1);
  await lifecyclePhase(page, "different-actor-login");
  const retry = page.getByRole("button", { name: "Retry original message", exact: true });
  const verify = page.getByRole("button", { name: "Verify session and access", exact: true });
  try { await retry.click(); }
  catch (error) {
    // A genuine background read-ACK verification can already confirm B and
    // replace A's retry with the denied-session UI. Only that transition is valid.
    if (!await verify.isVisible() || await retry.count() !== 0) throw error;
  }
  await expect(verify).toBeVisible(); expect(posts).toBe(0);
  await expect(composer).toHaveCount(0);
  await page.route("**/api/proxy/conversations?*", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.getByRole("button", { name: "Verify session and access", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "ops.read_error") })).toBeVisible();
  await expect(page.getByText(person.name, { exact: true })).toHaveCount(0); await expect(page.getByText(body, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(body => Object.keys(sessionStorage).filter(k => k.startsWith("garageos.message-intents.v1:")).some(k => sessionStorage.getItem(k)?.includes(body)), body)).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem("qa-unrelated-preference"))).toBe("keep");
});

for (const phase of ["capture", "ack"]) test(`Inbox ${phase} storage failure preserves exact text and truthful status without automatic POST`, async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1], thread = await storedThread(page, item.id), path = `/api/proxy/conversations/${thread.id}/messages`;
  await page.goto(`/inbox?c=${thread.id}`); const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  const body = `  QA38 Inbox storage ${phase} ${randomUUID()}  `; await composer.fill(body); let posts = 0;
  page.on("request", r => { if (r.method() === "POST" && r.url().endsWith(path)) posts++; });
  const failStorage = () => page.evaluate(() => {
    const original = Storage.prototype.setItem; (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("garageos.message-intents.v1:")) throw new DOMException("QA unavailable", "QuotaExceededError"); original.call(this, key, value); };
  });
  if (phase === "capture") await failStorage();
  else await page.route(`**${path}`, async route => { const response = await route.fetch(); expect(response.status()).toBe(201); await failStorage(); await route.fulfill({ response }); }, { times: 1 });
  await composer.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: phase === "capture" ? "Could not save message recovery" : "Message was sent, but recovery cleanup could not be saved" })).toBeVisible();
  await expect(composer).toHaveValue(body); expect(posts).toBe(phase === "capture" ? 0 : 1);
  if (phase === "ack") { await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible(); await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0); }
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage()); await page.getByRole("button", { name: "Retry storage", exact: true }).click();
  expect(posts).toBe(phase === "capture" ? 0 : 1);
  if (phase === "capture") { await expect(composer).toHaveValue(body); await composer.press("Enter"); }
  await expect(composer).toHaveValue(""); expect(posts).toBe(1);
  expect((await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
});

for (const locale of ["uz", "en", "ru"] as Locale[]) for (const width of [360, 390, 1280]) test(`Inbox recovery ${locale} ${width} keeps modes and accessible long original text`, async ({ page, baseURL }, info) => {
  const { items } = await operationCases(page, baseURL!), item = items[1], thread = await storedThread(page, item.id);
  await queueLogin(page, baseURL!, locale, width); await page.goto(`/inbox?c=${thread.id}`); const label = (key: string) => translate(locale, key);
  const composer = page.getByRole("textbox", { name: label("ops.message"), exact: true }); await expect(composer).toBeEnabled();
  const original = `QA38 Inbox ${randomUUID()} ${"O‘tkir Русский <literal> & ".repeat(20)}`, newer = "  Separate reply  ";
  await page.getByRole("button", { name: label("message.note"), exact: true }).click();
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
  await composer.fill(original); await composer.press("Enter");
  const retry = page.getByRole("button", { name: label("message.retry"), exact: true }); await expect(retry).toBeVisible();
  await page.getByRole("button", { name: label("message.reply"), exact: true }).click(); await composer.fill(newer);
  await expect(page.getByText(label("message.newer"), { exact: true })).toBeVisible();
  await assertKeyboardFocus(page, retry); await settleMotion(page); await queueOverflow(page);
  await queueTargets(page, page.locator("[data-message-composer]"));
  await assertAccessible(page, info, `inbox-message-recovery-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`inbox-message-recovery-${locale}-${width}.png`), fullPage: true });
  if (locale === "en" && width === 390) {
    await switchQueueLocale(page, "en", "ru"); await expect(page.getByRole("textbox", { name: translate("ru", "ops.message"), exact: true })).toHaveValue(newer);
    await page.getByRole("button", { name: translate("ru", "message.note"), exact: true }).click();
    await expect(page.getByRole("textbox", { name: translate("ru", "ops.message"), exact: true })).toHaveValue(original);
  }
});
