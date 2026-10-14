import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prepareMini } from "./support/mini-auth";
import { assertAccessible, assertKeyboardFocus, assertTargets, settleMotion } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";
import { queueLogin } from "./support/queue";
import type { MessageDraft, MessageIntent } from "../lib/message-intents";

test.use({ trace: "off" });

async function miniReceipts(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const active = sessionStorage.getItem("garageos.message-intents.v1:actor")!;
    return JSON.parse(sessionStorage.getItem(active)!);
  }) as Promise<{ intents: MessageIntent[]; drafts: Record<string, MessageDraft> }>;
}

async function miniEvidence(page: import("@playwright/test").Page, info: import("@playwright/test").TestInfo, name: string) {
  await settleMotion(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await assertTargets(page);
  await assertAccessible(page, info, name);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

async function customerThread(page: import("@playwright/test").Page, baseURL: string) {
  await prepareMini(page, baseURL);
  const created = await page.request.post("/api/mini/proxy/roadside", { data: { description: `QA38-${randomUUID()}` } });
  expect(created.ok()).toBeTruthy();
  const id: string = (await created.json()).conversation_id;
  expect(id).toBeTruthy();
  await page.goto(`/mini/messages/${id}`);
  return id;
}

test("Mini lost committed response survives reload and deliberately replays the same key and exact payload once", async ({ page, baseURL }) => {
  const id = await customerThread(page, baseURL!);
  const body = `  QA38-${randomUUID()} O‘tkir & Русский  `;
  const composer = page.getByRole("textbox", { name: "Message…", exact: true });
  await expect(composer).toBeVisible();
  await composer.fill(body);
  let committed!: { id: string; body: string }, firstKey: string | undefined;
  const path = `/api/mini/proxy/messages/${id}`;
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    firstKey = route.request().headers()["idempotency-key"];
    const response = await route.fetch(); expect(response.ok()).toBeTruthy();
    committed = await response.json(); await route.abort("failed");
  }, { times: 1 });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Delivery is uncertain" })).toBeVisible();
  expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(committed.body).toBe(body);
  await expect(composer).toHaveValue(body);
  await page.reload();
  await expect(composer).toHaveValue(body);
  const retry = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(path));
  await page.getByRole("button", { name: "Retry original message", exact: true }).click();
  const request = await retry;
  expect(request.headers()["idempotency-key"]).toBe(firstKey);
  expect(request.postDataJSON()).toEqual({ body });
  await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible();
  await expect(composer).toHaveValue("");
  const saved = await (await page.request.get(path)).json();
  expect(saved.messages.filter((message: { body: string }) => message.body === body)).toEqual([committed]);
  await expect(page.getByText(body.trim(), { exact: true })).toHaveCount(1);
});

test("Mini known rejection retains exact draft through reload and requires explicit resolution", async ({ page, baseURL }) => {
  const id = await customerThread(page, baseURL!);
  const body = `  QA38 rejected ${randomUUID()}  `;
  const composer = page.getByRole("textbox", { name: "Message…", exact: true });
  await expect(composer).toBeVisible(); await composer.fill(body);
  await page.route(`**/api/mini/proxy/messages/${id}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: { code: "VALIDATION_ERROR" } }) });
  }, { times: 1 });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Message was rejected" })).toBeVisible();
  await expect(composer).toHaveValue(body); await page.reload();
  await expect(composer).toHaveValue(body);
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Keep draft and resolve", exact: true }).click();
  await expect(composer).toHaveValue(body);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible();
});

test("Mini acknowledgement preserves a newer draft and remains sent after a failed refresh", async ({ page, baseURL }) => {
  const id = await customerThread(page, baseURL!), path = `/api/mini/proxy/messages/${id}`;
  const composer = page.getByRole("textbox", { name: "Message…", exact: true });
  const original = `QA38 original ${randomUUID()}`, newer = "  Separate newer draft  ";
  await expect(composer).toBeVisible(); await composer.fill(original);
  let release!: () => void, seen!: () => void, posts = 0;
  const held = new Promise<void>(resolve => release = resolve), fetched = new Promise<void>(resolve => seen = resolve);
  await page.route(`**${path}`, async route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    posts++; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seen(); await held;
    await route.fulfill({ response });
  });
  try {
    await composer.press("Enter"); await fetched;
    // Same JavaScript task plus a second Enter cannot dispatch twice.
    await composer.press("Enter"); await composer.fill(newer);
    await expect(page.getByText("This is a separate draft.", { exact: false })).toBeVisible();
    release();
    await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Message is sent, but the conversation refresh failed" })).toBeVisible();
    await expect(composer).toHaveValue(newer); expect(posts).toBe(1);
    await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
    await page.unroute(`**${path}`);
    const saved = await (await page.request.get(path)).json();
    expect(saved.messages.filter((message: { body: string }) => message.body === original)).toHaveLength(1);
    await page.reload(); await expect(composer).toHaveValue(newer);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Mini known acknowledgement stays sent when receipt cleanup storage fails and cleanup retry sends no POST", async ({ page, baseURL }) => {
  const id = await customerThread(page, baseURL!), path = `/api/mini/proxy/messages/${id}`;
  const composer = page.getByRole("textbox", { name: "Message…", exact: true }), body = `QA38 cleanup ${randomUUID()}`;
  await expect(composer).toBeVisible(); await composer.fill(body);
  let posts = 0;
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    posts++; const response = await route.fetch(); expect(response.ok()).toBeTruthy();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("garageos.message-intents.v1:")) throw new DOMException("QA cleanup failure", "QuotaExceededError");
        original.call(this, key, value);
      };
    });
    await route.fulfill({ response });
  }, { times: 1 });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Delivery is uncertain" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Message was sent, but recovery cleanup could not be saved" })).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await page.getByRole("button", { name: "Retry storage", exact: true }).click();
  await expect(composer).toHaveValue(""); expect(posts).toBe(1);
  const state = await page.evaluate(() => {
    const key = sessionStorage.getItem("garageos.message-intents.v1:actor")!;
    return JSON.parse(sessionStorage.getItem(key)!).intents;
  });
  expect(state).toEqual([]);
});

test("Mini verified changed customer purges old protected receipts even when that customer cannot open the thread", async ({ page, baseURL }) => {
  const id = await customerThread(page, baseURL!), path = `/api/mini/proxy/messages/${id}`;
  const composer = page.getByRole("textbox", { name: "Message…", exact: true }), body = `QA38 identity ${randomUUID()}`;
  await expect(composer).toBeVisible(); await composer.fill(body);
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  }, { times: 1 });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
  const oldKey = await page.evaluate(() => sessionStorage.getItem("garageos.message-intents.v1:actor")!);
  // Genuine password-customer auth is allowed for /me, but cannot gain Mini
  // messaging. A verified changed identity must still purge A's private state.
  await queueLogin(page, baseURL!, "en", 1280, 1);
  const customer = await page.request.post("/api/proxy/customers", { data: { full_name: "QA38 different customer", phone: "+998" + Date.now().toString().slice(-9) } });
  expect(customer.ok()).toBeTruthy(); const otherId = (await customer.json()).id as string;
  const email = `qa38-${randomUUID()}@example.com`, password = randomUUID() + "-Aa1!";
  const account = await page.request.post(`/api/proxy/customers/${otherId}/account`, { data: { email, password } });
  expect(account.ok()).toBeTruthy();
  const signed = await page.request.post("/api/proxy/customer/auth/login", { data: { email, password } });
  expect(signed.ok()).toBeTruthy(); const token = (await signed.json()).access_token as string;
  await page.context().addCookies([{ name: "garageos_customer_token", value: token, url: baseURL!, httpOnly: true }]);
  expect((await page.request.get("/api/mini/proxy/me")).ok()).toBeTruthy();
  await page.getByRole("button", { name: "Retry original message", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your session or conversation access is unavailable" })).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), oldKey)).toBeNull();
  await expect(page.getByText(body, { exact: true })).toHaveCount(0);
  // Reload genuinely reauthenticates A from its original signed Telegram SDK.
  // Its previous protected text must not reappear after the confirmed change.
  await page.reload(); await expect(composer).toHaveValue("");
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
});

test("Mini storage failure blocks POST and keeps exact text for a deliberate storage retry", async ({ page, baseURL }) => {
  const id = await customerThread(page, baseURL!), path = `/api/mini/proxy/messages/${id}`;
  const composer = page.getByRole("textbox", { name: "Message…", exact: true }), body = `  QA38 storage ${randomUUID()}  `;
  await expect(composer).toBeVisible(); await composer.fill(body);
  let posts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(path)) posts++; });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("garageos.message-intents.v1:")) throw new DOMException("QA unavailable", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not save message recovery" })).toBeVisible();
  await expect(composer).toHaveValue(body); expect(posts).toBe(0);
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await page.getByRole("button", { name: "Retry storage", exact: true }).click();
  expect(posts).toBe(0);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible(); expect(posts).toBe(1);
});

test("Mini missing-cookie same-actor session hides its receipt and resumes only after verification and deliberate same-key retry", async ({ page, baseURL }) => {
  const id = await customerThread(page, baseURL!), path = `/api/mini/proxy/messages/${id}`;
  const composer = page.getByRole("textbox", { name: "Message…", exact: true }), body = `QA38 missing session ${randomUUID()}`;
  await expect(composer).toBeVisible(); await composer.fill(body);
  await page.context().clearCookies({ name: "garageos_customer_token" });
  let posts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(path)) posts++; });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your session or conversation access is unavailable" })).toBeVisible();
  await expect(composer).toHaveCount(0); await expect(page.getByText(body, { exact: true })).toHaveCount(0); expect(posts).toBe(0);
  const key = await page.evaluate(() => {
    const active = sessionStorage.getItem("garageos.message-intents.v1:actor")!;
    return JSON.parse(sessionStorage.getItem(active)!).intents[0].key as string;
  });
  await page.getByRole("button", { name: "Verify session and access", exact: true }).click();
  await expect(composer).toHaveValue(body); expect(posts).toBe(0);
  const retried = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(path));
  await page.getByRole("button", { name: "Retry original message", exact: true }).click();
  expect((await retried).headers()["idempotency-key"]).toBe(key);
  await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible(); expect(posts).toBe(1);
});

test("Mini BFF preserves empty and malformed header presence and forwards a valid replay key", async ({ page, baseURL }) => {
  const id = await customerThread(page, baseURL!), path = `/api/mini/proxy/messages/${id}`;
  const before = await (await page.request.get(path)).json();
  for (const key of ["", "not-a-uuid", "x".repeat(1024)]) {
    const rejected = await page.request.post(path, { headers: { "Idempotency-Key": key }, data: { body: "Invalid must never write" } });
    expect(rejected.status()).toBe(422);
  }
  expect(await (await page.request.get(path)).json()).toEqual(before);
  const key = randomUUID(), body = `QA38 BFF ${randomUUID()}`;
  const first = await page.request.post(path, { headers: { "Idempotency-Key": key }, data: { body } });
  expect(first.ok()).toBeTruthy();
  const replay = await page.request.post(path, { headers: { "Idempotency-Key": key }, data: { body } });
  expect(replay.ok()).toBeTruthy(); expect(await replay.json()).toEqual(await first.json());
});

for (const locale of ["uz", "en", "ru"] as Locale[]) for (const width of [360, 390, 1280]) {
  test(`Mini recovery ${locale}/${width} has localized accessible phone/desktop actions and preserves its draft`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await prepareMini(page, baseURL, locale);
    const created = await page.request.post("/api/mini/proxy/roadside", { data: { description: `QA38 screen ${randomUUID()}` } });
    expect(created.ok()).toBeTruthy(); const id = (await created.json()).conversation_id as string;
    await page.goto(`/mini/messages/${id}`);
    const composer = page.getByRole("textbox", { name: translate(locale, "mini.messages.compose"), exact: true });
    const body = "  Exact O‘tkir & Русский " + "long text ".repeat(30);
    await expect(composer).toBeVisible(); await composer.fill(body);
    await page.route(`**/api/mini/proxy/messages/${id}`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    }, { times: 1 });
    await composer.press("Enter");
    await expect(page.getByRole("button", { name: translate(locale, "message.retry"), exact: true })).toBeVisible();
    await expect(composer).toHaveValue(body); await settleMotion(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await assertTargets(page); await assertKeyboardFocus(page, page.getByRole("button", { name: translate(locale, "message.retry"), exact: true }));
    await assertAccessible(page, info, `mini-message-recovery-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`mini-message-recovery-${locale}-${width}.png`), fullPage: true });
  });
}

for (const locale of ["uz", "en", "ru"] as Locale[]) for (const width of [360, 390, 1280]) {
  test(`Mini real conflict ${locale}/${width} survives reload and explicit resolution creates a new key`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await prepareMini(page, baseURL, locale);
    const created = await page.request.post("/api/mini/proxy/roadside", { data: { description: `QA38 Mini conflict ${randomUUID()}` } });
    expect(created.status()).toBe(200);
    const id = (await created.json()).conversation_id as string, path = `/api/mini/proxy/messages/${id}`;
    await page.goto(`/mini/messages/${id}`);
    const label = (key: string) => translate(locale, key);
    const composer = page.getByRole("textbox", { name: label("mini.messages.compose"), exact: true });
    const body = `  QA38 Mini conflict ${randomUUID()} O‘tkir & Русский  `, other = `QA38 Mini prior ${randomUUID()}`;
    await expect(composer).toBeVisible(); await composer.fill(body);
    const posts: { key: string; payload: unknown }[] = [];
    page.on("request", request => {
      if (request.method() === "POST" && request.url().endsWith(path)) posts.push({ key: request.headers()["idempotency-key"], payload: request.postDataJSON() });
    });
    let prior!: { id: string; body: string };
    // Create a real conflicting cached result through the normally authenticated
    // BFF, then let the captured browser request reach the actual API unchanged.
    await page.route(`**${path}`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      const key = route.request().headers()["idempotency-key"];
      const response = await page.request.post(path, { headers: { "Idempotency-Key": key }, data: { body: other } });
      expect(response.status()).toBe(200); prior = await response.json();
      await route.continue();
    });
    const conflict = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(path));
    await composer.press("Enter");
    const response = await conflict;
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe("MESSAGE_INTENT_CONFLICT");
    expect(await response.text()).not.toContain(other);
    await page.unroute(`**${path}`);
    await expect(page.getByRole("alert").filter({ hasText: label("message.conflict") })).toBeVisible();
    expect(posts).toHaveLength(1); expect(posts[0].key).toMatch(/^[0-9a-f-]{36}$/);
    expect(posts[0].payload).toEqual({ body });
    const receipt = (await miniReceipts(page)).intents[0];
    expect(receipt).toMatchObject({ key: posts[0].key, conversation: id, payload: { body }, status: "conflict" });
    await page.reload();
    await expect(composer).toHaveValue(body);
    await expect(page.getByRole("alert").filter({ hasText: label("message.conflict") })).toBeVisible();
    expect((await miniReceipts(page)).intents).toEqual([receipt]); expect(posts).toHaveLength(1);
    await expect(page.getByRole("button", { name: label("message.retry"), exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: label("message.send"), exact: true })).toBeDisabled();
    const resolve = page.getByRole("button", { name: label("message.resolve"), exact: true });
    await assertKeyboardFocus(page, resolve);
    await miniEvidence(page, info, `mini-conflict-reloaded-${locale}-${width}`);
    await resolve.press("Enter");
    await expect(composer).toHaveValue(body);
    expect((await miniReceipts(page)).intents).toEqual([]); expect(posts).toHaveLength(1);
    const sent = page.waitForResponse(result => result.request().method() === "POST" && result.url().endsWith(path));
    await composer.press("Enter");
    const acknowledged = await sent; expect(acknowledged.status()).toBe(200);
    const message = await acknowledged.json(); expect(message.body).toBe(body);
    await expect(page.getByRole("status").filter({ hasText: label("message.saved") })).toBeVisible();
    await expect(composer).toHaveValue(""); expect(posts).toHaveLength(2);
    expect(posts[1].key).not.toBe(posts[0].key); expect(posts[1].payload).toEqual({ body });
    const saved = await (await page.request.get(path)).json();
    expect(saved.messages.filter((row: { body: string }) => row.body === body)).toEqual([message]);
    expect(saved.messages.filter((row: { body: string }) => row.body === other)).toEqual([prior]);
    await miniEvidence(page, info, `mini-conflict-resolved-${locale}-${width}`);
  });

  test(`Mini recipient race ${locale}/${width} keeps A and B drafts through real late POST and GET consumption`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 }); await prepareMini(page, baseURL, locale);
    const ids: string[] = [];
    for (const name of ["A", "B"]) {
      const created = await page.request.post("/api/mini/proxy/roadside", { data: { description: `QA38 Mini race ${name} ${randomUUID()}` } });
      expect(created.status()).toBe(200); ids.push((await created.json()).conversation_id);
    }
    const [a, b] = ids, path = `/api/mini/proxy/messages/${a}`;
    const label = (key: string) => translate(locale, key);
    const composer = page.getByRole("textbox", { name: label("mini.messages.compose"), exact: true });
    const original = `  QA38 Mini race ${randomUUID()}  `, newerA = "  A newer O‘tkir Русский draft  ", draftB = "  B separate O‘tkir Русский draft  ";
    await page.goto(`/mini/messages/${a}`); await expect(composer).toBeVisible();
    const posts: { path: string; key: string; payload: unknown }[] = [];
    page.on("request", request => {
      if (request.method() === "POST" && ids.some(id => request.url().endsWith(`/api/mini/proxy/messages/${id}`))) {
        posts.push({ path: new URL(request.url()).pathname, key: request.headers()["idempotency-key"], payload: request.postDataJSON() });
      }
    });
    // Delay consumption of successful real JSON, rather than a transport route
    // which navigation can cancel. Both old completions actually reach callers.
    await page.evaluate(target => {
      type Held = { armed: boolean; held: boolean; delivered: boolean; status?: number; data?: unknown; release?: () => void };
      const qa = { post: { armed: true, held: false, delivered: false } as Held, get: { armed: false, held: false, delivered: false } as Held };
      (window as unknown as { miniRace: typeof qa }).miniRace = qa;
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const method = (args[1]?.method ?? "GET").toUpperCase(), state = method === "POST" ? qa.post : qa.get;
        const captured = String(args[0]).endsWith(target) && state.armed;
        if (captured) state.armed = false;
        const response = await originalFetch(...args);
        if (captured) {
          const data = await response.json(); state.status = response.status; state.data = data;
          const held = new Promise<void>(resolve => state.release = resolve);
          response.json = async () => { state.held = true; await held; state.delivered = true; return data; };
        }
        return response;
      };
    }, path);
    const navigate = async (id: string) => {
      await page.getByRole("main").getByRole("link", { name: label("mini.messages.title"), exact: true }).click();
      await expect(page).toHaveURL(/\/mini\/messages$/);
      const link = page.locator(`a[href="/mini/messages/${id}"]`); await expect(link).toBeVisible(); await link.click();
      await expect(page).toHaveURL(new RegExp(`/mini/messages/${id}$`));
    };
    try {
      await composer.fill(original); await composer.press("Enter");
      await page.waitForFunction(() => (window as unknown as { miniRace: { post: { held: boolean } } }).miniRace.post.held);
      await composer.fill(newerA);
      await expect(page.getByText(label("message.newer"), { exact: true })).toBeVisible();
      const captured = (await miniReceipts(page)).intents[0];
      expect(captured).toMatchObject({ conversation: a, payload: { body: original }, key: posts[0].key });
      await navigate(b); await expect(composer).toHaveValue(""); await composer.fill(draftB);
      const completion = await page.evaluate(() => {
        const qa = (window as unknown as { miniRace: { post: { release: () => void; status: number; data: { id: string; body: string } } } }).miniRace;
        qa.post.release(); return { status: qa.post.status, message: qa.post.data };
      });
      expect(completion.status).toBe(200); expect(completion.message.body).toBe(original);
      await expect.poll(async () => (await miniReceipts(page)).intents.length).toBe(0);
      await expect(composer).toHaveValue(draftB);
      await expect(page.getByText(original.trim(), { exact: true })).toHaveCount(0);
      await expect(page.getByRole("status").filter({ hasText: label("message.saved") })).toHaveCount(0);
      await page.evaluate(() => { (window as unknown as { miniRace: { get: { armed: boolean } } }).miniRace.get.armed = true; });
      await navigate(a);
      await page.waitForFunction(() => (window as unknown as { miniRace: { get: { held: boolean } } }).miniRace.get.held);
      await navigate(b); await expect(composer).toHaveValue(draftB);
      const before = await miniReceipts(page);
      const oldRead = await page.evaluate(() => {
        const get = (window as unknown as { miniRace: { get: { release: () => void; status: number; data: { id: string; messages: { id: string; body: string }[] } } } }).miniRace.get;
        get.release(); return { status: get.status, thread: get.data };
      });
      expect(oldRead.status).toBe(200); expect(oldRead.thread.id).toBe(a);
      expect(oldRead.thread.messages.filter(row => row.body === original)).toEqual([completion.message]);
      await page.waitForFunction(() => (window as unknown as { miniRace: { get: { delivered: boolean } } }).miniRace.get.delivered);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page).toHaveURL(new RegExp(`/mini/messages/${b}$`));
      await expect(composer).toHaveValue(draftB); expect(await miniReceipts(page)).toEqual(before);
      await expect(page.getByText(original.trim(), { exact: true })).toHaveCount(0);
      await assertKeyboardFocus(page, composer); await miniEvidence(page, info, `mini-race-B-${locale}-${width}`);
      await navigate(a); await expect(composer).toHaveValue(newerA);
      await expect(page.getByRole("article").getByText(original.trim(), { exact: true })).toHaveCount(1);
      await expect(page.getByRole("button", { name: label("message.retry"), exact: true })).toHaveCount(0);
      expect(posts).toEqual([{ path, key: captured.key, payload: { body: original } }]);
      const storedA = await (await page.request.get(path)).json();
      expect(storedA.messages.filter((row: { body: string }) => row.body === original)).toEqual([completion.message]);
      const storedB = await (await page.request.get(`/api/mini/proxy/messages/${b}`)).json();
      expect(storedB.messages.some((row: { body: string }) => [original, newerA, draftB].includes(row.body))).toBe(false);
      await miniEvidence(page, info, `mini-race-A-${locale}-${width}`);
    } finally {
      await page.evaluate(() => {
        const qa = (window as unknown as { miniRace?: { post: { release?: () => void }; get: { release?: () => void } } }).miniRace;
        qa?.post.release?.(); qa?.get.release?.();
      });
    }
  });
}

for (const width of [360, 390, 1280]) test(`Mini locale movement ${width} retains the original uncertain receipt across UZ EN RU reloads`, async ({ page, baseURL }, info) => {
  await page.setViewportSize({ width, height: 900 }); await prepareMini(page, baseURL, "uz");
  const created = await page.request.post("/api/mini/proxy/roadside", { data: { description: `QA38 Mini locale ${randomUUID()}` } });
  expect(created.status()).toBe(200);
  const id = (await created.json()).conversation_id as string, path = `/api/mini/proxy/messages/${id}`;
  await page.goto(`/mini/messages/${id}`);
  const body = `  QA38 Mini locale ${randomUUID()} O‘tkir & Русский  `;
  const composer = (locale: Locale) => page.getByRole("textbox", { name: translate(locale, "mini.messages.compose"), exact: true });
  await expect(composer("uz")).toBeVisible(); await composer("uz").fill(body);
  const posts: { key: string; payload: unknown }[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith(path)) posts.push({ key: request.headers()["idempotency-key"], payload: request.postDataJSON() });
  });
  let committed!: { id: string; body: string };
  await page.route(`**${path}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); expect(response.status()).toBe(200); committed = await response.json(); await route.abort("failed");
  });
  await composer("uz").press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: translate("uz", "message.uncertain") })).toBeVisible();
  await page.unroute(`**${path}`);
  const receipt = (await miniReceipts(page)).intents[0];
  expect(receipt).toMatchObject({ conversation: id, key: posts[0].key, payload: { body }, status: "uncertain" });
  for (const locale of ["en", "ru"] as Locale[]) {
    // Mini uses this existing locale cookie; change it in the same tab and reload
    // the actual translated page with normal Telegram and owned-thread reads.
    await page.context().addCookies([{ name: "garageos_locale", value: locale, url: baseURL! }]);
    await page.reload(); await expect(composer(locale)).toHaveValue(body);
    await expect(page.getByRole("alert").filter({ hasText: translate(locale, "message.uncertain") })).toBeVisible();
    expect((await miniReceipts(page)).intents).toEqual([receipt]); expect(posts).toHaveLength(1);
    const retry = page.getByRole("button", { name: translate(locale, "message.retry"), exact: true });
    await assertKeyboardFocus(page, retry); await miniEvidence(page, info, `mini-locale-${locale}-${width}`);
  }
  await page.getByRole("button", { name: translate("ru", "message.retry"), exact: true }).press("Enter");
  await expect(page.getByRole("status").filter({ hasText: translate("ru", "message.saved") })).toBeVisible();
  await expect(composer("ru")).toHaveValue("");
  expect(posts).toEqual([{ key: receipt.key, payload: { body } }, { key: receipt.key, payload: { body } }]);
  const saved = await (await page.request.get(path)).json();
  expect(saved.messages.filter((row: { body: string }) => row.body === body)).toEqual([committed]);
  await miniEvidence(page, info, `mini-locale-sent-ru-${width}`);
});
