import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { operationCases, storedThread, caseRow } from "./support/operations";
import { queueLogin, queueOverflow, queueTargets, switchQueueLocale } from "./support/queue";
import { assertAccessible, assertKeyboardFocus, settleMotion } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off" });

for (const movement of ["query", "deselect"]) test(`Operations late session verification preserves ${movement} movement instead of reopening A`, async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), [a, b] = items;
  await page.route("**/api/proxy/auth/me", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
  await page.goto(`/operations?case=${a.id}`);
  await expect(page.getByRole("alert").filter({ hasText: "Could not verify your session" })).toBeVisible();
  await page.evaluate(() => {
    const fetch = window.fetch; let first = true;
    const qa = window as unknown as { qaVerificationHeld: boolean; releaseQAVerification: () => void };
    window.fetch = async (...args) => {
      const captured = first && String(args[0]).endsWith("/api/proxy/auth/me");
      if (captured) first = false;
      const response = await fetch(...args);
      if (captured) { qa.qaVerificationHeld = true; await new Promise<void>(r => qa.releaseQAVerification = r); }
      return response;
    };
  });
  try {
    await page.getByRole("button", { name: "Verify session and access", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { qaVerificationHeld: boolean }).qaVerificationHeld);
    if (movement === "query") {
      await page.evaluate(id => history.pushState(null, "", `/operations?case=${id}`), b.id);
      await expect(page).toHaveURL(new RegExp(`case=${b.id}$`));
    } else await page.getByRole("textbox", { name: "Search cases", exact: true }).fill(`QA38 absent ${randomUUID()}`);
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.evaluate(() => (window as unknown as { releaseQAVerification: () => void }).releaseQAVerification());
    if (movement === "query") await expect(page.getByRole("heading", { name: b.title, exact: true })).toBeVisible();
    else await expect(page.getByText("No matching cases.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: a.title, exact: true })).toHaveCount(0);
    if (movement === "query") await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toHaveAttribute("href", `/inbox?c=${(await storedThread(page, b.id)).id}`);
    else await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
  } finally { await page.evaluate(() => (window as unknown as { releaseQAVerification?: () => void }).releaseQAVerification?.()); }
});

test("Operations departed write preflight cannot dispatch after ordinary SPA navigation", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1];
  await page.goto(`/operations?case=${item.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  // Delay a genuine preflight response after the initial identity is verified.
  await page.evaluate(() => {
    const fetch = window.fetch; let first = true;
    const qa = window as unknown as { qaPreflightHeld: boolean; qaPreflightDecoded: boolean; releaseQAPreflight: () => void };
    window.fetch = async (...args) => {
      const captured = first && String(args[0]).endsWith("/api/proxy/auth/me");
      if (captured) first = false;
      const response = await fetch(...args);
      if (captured) {
        qa.qaPreflightHeld = true; await new Promise<void>(r => qa.releaseQAPreflight = r);
        const json = response.json.bind(response);
        response.json = async () => { const body = await json(); qa.qaPreflightDecoded = true; return body; };
      }
      return response;
    };
  });
  let posts = 0;
  page.on("request", r => { if (r.method() === "POST" && r.url().includes("/conversations/") && r.url().endsWith("/messages")) posts++; });
  const body = `QA38 preflight canceled ${randomUUID()}`;
  try {
    await page.getByRole("textbox", { name: "Message", exact: true }).fill(body);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { qaPreflightHeld: boolean }).qaPreflightHeld);
    await page.getByRole("link", { name: "Customers", exact: true }).click(); await expect(page).toHaveURL(/\/customers$/);
    await page.evaluate(() => (window as unknown as { releaseQAPreflight: () => void }).releaseQAPreflight());
    await page.waitForFunction(() => (window as unknown as { qaPreflightDecoded: boolean }).qaPreflightDecoded);
    await expect.poll(() => page.evaluate(() => {
      const active = sessionStorage.getItem("garageos.message-intents.v1:actor")!;
      return JSON.parse(sessionStorage.getItem(active)!).intents[0]?.status;
    })).toBe("suspended");
    expect(posts).toBe(0);
    expect((await storedThread(page, item.id)).messages.some((m: { body: string }) => m.body === body)).toBe(false);
  } finally { await page.evaluate(() => (window as unknown as { releaseQAPreflight?: () => void }).releaseQAPreflight?.()); }
});

test("Operations session transport error is truthful and verification retry does not send a message", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1];
  await page.route("**/api/proxy/auth/me", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
  let posts = 0;
  page.on("request", r => { if (r.method() === "POST" && r.url().includes("/messages")) posts++; });
  await page.goto(`/operations?case=${item.id}`);
  await expect(page.getByRole("alert").filter({ hasText: "Could not verify your session" })).toBeVisible();
  await expect(page.getByText(translate("en", "message.storage"), { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Verify session and access", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible(); expect(posts).toBe(0);
});

test("Operations lost committed response preserves exact draft and replays the original key after reload", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!);
  const item = items[1];
  await page.goto(`/operations?case=${item.id}`);
  await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id);
  const path = `/api/proxy/conversations/${thread.id}/messages`;
  const body = `  QA38 Operations ${randomUUID()}\nO‘tkir & Русский  `;
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill(body);
  let firstKey: string | undefined, committed!: { id: string; body: string };
  await page.route(`**${path}`, async route => {
    firstKey = route.request().headers()["idempotency-key"];
    const response = await route.fetch(); expect(response.ok()).toBeTruthy();
    committed = await response.json(); await route.abort("failed");
  }, { times: 1 });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
  expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(committed.body).toBe(body);
  await expect(composer).toHaveValue(body);
  await page.reload(); await expect(composer).toHaveValue(body);
  const retry = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(path));
  await page.getByRole("button", { name: "Retry original message", exact: true }).click();
  const request = await retry;
  expect(request.headers()["idempotency-key"]).toBe(firstKey);
  expect(request.postDataJSON().body).toBe(body);
  await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible();
  await expect(composer).toHaveValue("");
  const saved = await storedThread(page, item.id);
  expect(saved.messages.filter((message: { body: string }) => message.body === body)).toEqual([committed]);
  await expect(page.getByRole("article").getByText(body.trim(), { exact: true })).toHaveCount(1);
});

test("Operations captured A ACK retires A while B thread is loading and preserves A's newer draft", async ({ page, baseURL }) => {
  const { items, person } = await operationCases(page, baseURL!);
  const [a, b] = items;
  await page.goto(`/operations?case=${a.id}`);
  await page.getByRole("textbox", { name: "Search cases", exact: true }).fill(person.tag);
  await expect(caseRow(page, b.code)).toBeVisible(); await caseRow(page, a.code).click();
  await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const aThread = await storedThread(page, a.id), original = `QA38 held ACK ${randomUUID()}`, newer = "  A newer revision  ";
  let releaseAck!: () => void, releaseRead!: () => void, sawAck!: () => void, sawRead!: () => void;
  const ackHeld = new Promise<void>(r => releaseAck = r), readHeld = new Promise<void>(r => releaseRead = r);
  const ackFetched = new Promise<void>(r => sawAck = r), readFetched = new Promise<void>(r => sawRead = r);
  await page.route(`**/api/proxy/conversations/${aThread.id}/messages`, async route => {
    const response = await route.fetch(); expect(response.ok()).toBeTruthy(); sawAck(); await ackHeld; await route.fulfill({ response });
  }, { times: 1 });
  await page.route(`**/api/proxy/cases/${b.id}/conversation`, async route => {
    const response = await route.fetch(); expect(response.ok()).toBeTruthy(); sawRead(); await readHeld;
    try { await route.fulfill({ response }); } catch (error) { if (!(error instanceof Error) || !error.message.includes("already handled")) throw error; }
  }, { times: 1 });
  try {
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await composer.fill(original); await composer.press("Enter"); await ackFetched;
    await composer.fill(newer); await caseRow(page, b.code).click(); await readFetched;
    await expect(composer).toBeDisabled(); releaseAck();
    await expect.poll(() => page.evaluate(() => {
      const active = sessionStorage.getItem("garageos.message-intents.v1:actor")!;
      return JSON.parse(sessionStorage.getItem(active)!).intents.length;
    })).toBe(0);
    await expect(page.getByRole("heading", { name: b.title, exact: true })).toBeVisible();
    releaseRead(); await expect(composer).toBeEnabled(); await expect(composer).toHaveValue("");
    await expect(page.getByRole("article").getByText(original, { exact: true })).toHaveCount(0);
    await caseRow(page, a.code).click(); await expect(composer).toHaveValue(newer);
    await expect(page.getByRole("article").getByText(original, { exact: true })).toHaveCount(1);
    await page.reload(); await expect(composer).toHaveValue(newer);
    await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
  } finally { releaseAck(); releaseRead(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Operations real content conflict requires explicit resolution and preserves exact note across reload", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1];
  await page.goto(`/operations?case=${item.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id), path = `/api/proxy/conversations/${thread.id}/messages`;
  const body = `  QA38 conflict note ${randomUUID()}  `, other = `QA38 different ${randomUUID()}`;
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await page.getByRole("button", { name: "Internal note", exact: true }).click(); await composer.fill(body);
  let originalKey: string | undefined;
  await page.route(`**${path}`, async route => {
    originalKey = route.request().headers()["idempotency-key"];
    const prior = await page.request.post(path, { headers: { "Idempotency-Key": originalKey! }, data: { ...route.request().postDataJSON(), body: other } });
    expect(prior.status()).toBe(201); await route.continue();
  }, { times: 1 });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This submission key belongs to different content" })).toBeVisible();
  await expect(composer).toHaveValue(body); await page.reload();
  await expect(page.getByRole("button", { name: "Internal note", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(composer).toHaveValue(body);
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Keep draft and resolve", exact: true }).click(); await expect(composer).toHaveValue(body);
  const sent = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith(path));
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  expect((await sent).headers()["idempotency-key"]).not.toBe(originalKey);
  await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible();
  const saved = await storedThread(page, item.id);
  expect(saved.messages.filter((m: { body: string; is_internal: boolean; channel: string }) => m.body === body && m.is_internal && m.channel === "internal")).toHaveLength(1);
  expect(saved.messages.filter((m: { body: string }) => m.body === other)).toHaveLength(1);
});

test("Operations invalidated same-actor session preserves the uncertain key and only deliberate recovery resends", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1];
  await page.goto(`/operations?case=${item.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id), path = `/api/proxy/conversations/${thread.id}/messages`, body = `QA38 invalidated ${randomUUID()}`;
  let key: string | undefined, posts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(path)) posts++; });
  await page.route(`**${path}`, async route => {
    key = route.request().headers()["idempotency-key"];
    const response = await route.fetch(); expect(response.ok()).toBeTruthy(); await route.abort("failed");
  }, { times: 1 });
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill(body); await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
  await page.context().addCookies([{ name: "garageos_token", value: "QA-invalidated-token", url: baseURL!, httpOnly: true }]);
  await page.getByRole("button", { name: "Retry original message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Verify session and access", exact: true })).toBeVisible();
  await expect(composer).toHaveCount(0); expect(posts).toBe(1);
  const receipt = await page.evaluate(() => {
    const active = sessionStorage.getItem("garageos.message-intents.v1:actor")!;
    return JSON.parse(sessionStorage.getItem(active)!).intents[0];
  });
  expect(receipt.key).toBe(key); expect(receipt.payload.body).toBe(body); expect(receipt.status).toBe("suspended");
  await queueLogin(page, baseURL!, "en", 1280);
  await page.getByRole("button", { name: "Verify session and access", exact: true }).click();
  await expect(composer).toHaveValue(body); expect(posts).toBe(1);
  const recovered = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith(path));
  await page.getByRole("button", { name: "Retry original message", exact: true }).click();
  expect((await recovered).headers()["idempotency-key"]).toBe(key);
  await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible();
  expect(posts).toBe(2); expect((await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
});

test("Operations staff BFF forwards empty malformed and valid keys and new identical submissions get new keys", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1], thread = await storedThread(page, item.id);
  const path = `/api/proxy/conversations/${thread.id}/messages`, body = `QA38 BFF ${randomUUID()}`;
  for (const key of ["", "bad-key", "x".repeat(1024)]) {
    expect((await page.request.post(path, { headers: { "Idempotency-Key": key }, data: { body } })).status()).toBe(422);
  }
  const key = randomUUID();
  const first = await page.request.post(path, { headers: { "Idempotency-Key": key }, data: { body } }); expect(first.status()).toBe(201);
  const replay = await page.request.post(path, { headers: { "Idempotency-Key": key }, data: { body } }); expect(replay.status()).toBe(201);
  expect(await replay.json()).toEqual(await first.json());
  await page.goto(`/operations?case=${item.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const keys: string[] = [], repeated = `QA38 intentional twice ${randomUUID()}`;
  page.on("request", r => { if (r.method() === "POST" && r.url().endsWith(path)) keys.push(r.headers()["idempotency-key"]); });
  for (let i = 0; i < 2; i++) {
    await page.getByRole("textbox", { name: "Message", exact: true }).fill(repeated);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
  }
  expect(keys).toHaveLength(2); expect(keys[0]).not.toBe(keys[1]);
  expect((await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === repeated)).toHaveLength(2);
  expect((await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
});

test("Operations ACK keeps newer mode draft and sent status when the follow-up GET fails", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1];
  await page.goto(`/operations?case=${item.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id), path = `/api/proxy/conversations/${thread.id}/messages`, body = `QA38 follow GET ${randomUUID()}`, newer = "  Other mode draft  ";
  let release!: () => void, seen!: () => void, posts = 0;
  const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**${path}`, async route => {
    posts++; const response = await route.fetch(); expect(response.ok()).toBeTruthy();
    await page.route(`**/api/proxy/cases/${item.id}/conversation`, read => read.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    seen(); await held; await route.fulfill({ response });
  }, { times: 1 });
  try {
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await composer.fill(body); await composer.press("Enter"); await fetched;
    await composer.press("Enter"); await page.getByRole("button", { name: "Internal note", exact: true }).click(); await composer.fill(newer);
    release(); await expect(page.getByRole("status").filter({ hasText: "Message sent" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Message is sent, but the conversation refresh failed" })).toBeVisible();
    await expect(composer).toHaveValue(newer); expect(posts).toBe(1);
    await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
    await expect(page.getByRole("article").getByText(body, { exact: true })).toHaveCount(1);
    await page.unrouteAll({ behavior: "wait" });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(composer).toBeEnabled(); await expect(composer).toHaveValue(newer);
    expect((await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

for (const locale of ["uz", "en", "ru"] as Locale[]) for (const width of [360, 390, 1280]) test(`Operations message recovery ${locale} ${width} is localized keyboard accessible and preserves separate modes`, async ({ page, baseURL }, info) => {
  const { items } = await operationCases(page, baseURL!), item = items[1];
  await queueLogin(page, baseURL!, locale, width); await page.goto(`/operations?case=${item.id}`);
  const label = (key: string) => translate(locale, key);
  if (width < 1280) await page.getByRole("button", { name: label("ops.conversation"), exact: true }).click();
  await expect(page.getByRole("link", { name: label("ops.inbox"), exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id), original = `QA38 ${randomUUID()} ${"O‘tkir Русский <literal> & ".repeat(20)}`, separate = "  Separate reply  ";
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
  await page.getByRole("button", { name: label("ops.note"), exact: true }).click();
  const composer = page.getByRole("textbox", { name: label("ops.message"), exact: true });
  await composer.fill(original); await composer.press("Enter");
  const retry = page.getByRole("button", { name: label("message.retry"), exact: true }); await expect(retry).toBeVisible();
  await page.getByRole("button", { name: label("ops.reply"), exact: true }).click(); await composer.fill(separate);
  await expect(page.getByText(label("message.newer"), { exact: true })).toBeVisible();
  await assertKeyboardFocus(page, retry); await settleMotion(page);
  await queueOverflow(page); await queueTargets(page, page.locator("[data-operations]"));
  await assertAccessible(page, info, `operations-message-recovery-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`operations-message-recovery-${locale}-${width}.png`), fullPage: true });
  if (locale === "en" && width === 390) {
    await switchQueueLocale(page, "en", "ru");
    await expect(page.getByRole("textbox", { name: translate("ru", "ops.message"), exact: true })).toHaveValue(separate);
    await page.getByRole("button", { name: translate("ru", "ops.note"), exact: true }).click();
    await expect(page.getByRole("textbox", { name: translate("ru", "ops.message"), exact: true })).toHaveValue(original);
  }
});

test("Operations real ACK across ordinary SPA navigation retires only the captured receipt", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!), item = items[1];
  await page.goto(`/operations?case=${item.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id), body = `QA38 route ACK ${randomUUID()}`;
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, async route => {
    const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seen(); await held; await route.fulfill({ response });
  }, { times: 1 });
  try {
    await page.getByRole("textbox", { name: "Message", exact: true }).fill(body);
    await page.getByRole("button", { name: "Send message", exact: true }).click(); await fetched;
    await page.getByRole("link", { name: "Customers", exact: true }).click(); await expect(page).toHaveURL(/\/customers$/);
    release();
    await expect.poll(() => page.evaluate(() => {
      const active = sessionStorage.getItem("garageos.message-intents.v1:actor")!;
      return JSON.parse(sessionStorage.getItem(active)!).intents.length;
    })).toBe(0);
    await page.goto(`/operations?case=${item.id}`);
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
    expect((await storedThread(page, item.id)).messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Operations confirmed different garage cannot expose the previous actor case list when its own list fails", async ({ page, baseURL }) => {
  const { items, person } = await operationCases(page, baseURL!), item = items[1];
  await page.goto(`/operations?case=${item.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id), body = `QA38 changed actor ${randomUUID()}`;
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(body);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
  await page.context().addCookies([{ name: "garageos_token", value: "QA-expired-invalid-token", url: baseURL!, httpOnly: true }]);
  await page.getByRole("button", { name: "Retry original message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Verify session and access", exact: true })).toBeVisible();
  await queueLogin(page, baseURL!, "en", 1280, 1);
  await page.route("**/api/proxy/cases?**", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  const failedList = page.waitForResponse(r => r.request().method() === "GET" && r.url().includes("/api/proxy/cases?") && r.status() === 503);
  await page.getByRole("button", { name: "Verify session and access", exact: true }).click();
  await failedList;
  await expect(caseRow(page, item.code)).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "ops.read_error") })).toBeVisible();
  await expect(page.getByText(person.name, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: item.title, exact: true })).toHaveCount(0);
  expect(await page.evaluate(body => Object.keys(sessionStorage).some(key => key.startsWith("garageos.message-intents.v1:") && sessionStorage.getItem(key)?.includes(body)), body)).toBe(false);
});

test("Operations obsolete held A authentication response cannot purge verified B recovery", async ({ page, baseURL }) => {
  const { items: bItems } = await operationCases(page, baseURL!, 2, 1), b = bItems[1];
  await queueLogin(page, baseURL!, "en", 1280, 0);
  // Delay consumption of a genuine authenticated response in JavaScript. A
  // transport route can be canceled by navigation and cannot prove this race.
  await page.addInitScript(() => {
    const fetch = window.fetch; let first = true;
    const qa = window as unknown as { qaAuthHeld: boolean; qaAuthDecoded: boolean; releaseQAAuth: () => void };
    window.fetch = async (...args) => {
      const captured = first && String(args[0]).endsWith("/api/proxy/auth/me");
      if (captured) first = false;
      const response = await fetch(...args);
      if (captured) {
        qa.qaAuthHeld = true; await new Promise<void>(r => qa.releaseQAAuth = r);
        const json = response.json.bind(response);
        response.json = async () => { const body = await json(); qa.qaAuthDecoded = true; return body; };
      }
      return response;
    };
  });
  try {
    await page.goto("/operations"); await page.waitForFunction(() => (window as unknown as { qaAuthHeld: boolean }).qaAuthHeld);
    await page.getByRole("link", { name: "Customers", exact: true }).click(); await expect(page).toHaveURL(/\/customers$/);
    await queueLogin(page, baseURL!, "en", 1280, 1);
    await page.getByRole("link", { name: "Operations", exact: true }).click(); await expect(page).toHaveURL(/\/operations$/);
    await expect(caseRow(page, b.code)).toBeVisible(); await caseRow(page, b.code).click();
    await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
    const thread = await storedThread(page, b.id), body = `QA38 B receipt ${randomUUID()}`;
    await page.route(`**/api/proxy/conversations/${thread.id}/messages`, route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
    await page.getByRole("textbox", { name: "Message", exact: true }).fill(body);
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
    const state = await page.evaluate(() => Object.fromEntries(Object.keys(sessionStorage).filter(key => key.startsWith("garageos.message-intents.v1:")).map(key => [key, sessionStorage.getItem(key)])));
    await page.evaluate(() => (window as unknown as { releaseQAAuth: () => void }).releaseQAAuth());
    await page.waitForFunction(() => (window as unknown as { qaAuthDecoded: boolean }).qaAuthDecoded);
    expect(await page.evaluate(() => Object.fromEntries(Object.keys(sessionStorage).filter(key => key.startsWith("garageos.message-intents.v1:")).map(key => [key, sessionStorage.getItem(key)])))).toEqual(state);
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(body);
  } finally { await page.evaluate(() => (window as unknown as { releaseQAAuth?: () => void }).releaseQAAuth?.()); await page.unrouteAll({ behavior: "wait" }); }
});

test("Operations late 404 for captured A does not clear selected B or its separate draft", async ({ page, baseURL }) => {
  const { items, person } = await operationCases(page, baseURL!);
  const [a, b] = items;
  await page.goto(`/operations?case=${a.id}`);
  await page.getByRole("textbox", { name: "Search cases", exact: true }).fill(person.tag);
  await expect(caseRow(page, b.code)).toBeVisible();
  await caseRow(page, a.code).click();
  await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, a.id), original = `QA38 unavailable ${randomUUID()}`, newer = "  B independent draft  ";
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>(resolve => release = resolve), intercepted = new Promise<void>(resolve => seen = resolve);
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, async route => {
    seen(); await held;
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "NOT_FOUND" } }) });
  }, { times: 1 });
  try {
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await composer.fill(original); await page.getByRole("button", { name: "Send message", exact: true }).click(); await intercepted;
    await caseRow(page, b.code).click();
    await expect(page.getByRole("heading", { name: b.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toHaveAttribute("href", `/inbox?c=${(await storedThread(page, b.id)).id}`);
    await composer.fill(newer); release();
    await expect(composer).toHaveValue(newer);
    await expect(page.getByRole("heading", { name: b.title, exact: true })).toBeVisible();
    await caseRow(page, a.code).click();
    await expect(composer).toHaveValue(original);
    await expect(page.getByRole("alert").filter({ hasText: "Recovery is paused" })).toBeVisible();
    expect((await storedThread(page, a.id)).messages.some((message: { body: string }) => message.body === original)).toBe(false);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});
