import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { operationCases, storedThread } from "./support/operations";
import { queueLogin, queueProfiles, queueOverflow, queueTargets, switchQueueLocale } from "./support/queue";
import { prepareMini } from "./support/mini-auth";
import { assertAccessible, assertKeyboardFocus } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off" });
const prefix = "garageos.message-intents.v1:";
const protectedKeys = (page: Page) => page.evaluate(p => Object.keys(sessionStorage).filter(key => key.startsWith(p)), prefix);
async function assertUncoveredText(locator: Locator) {
  await expect(locator).toBeVisible();
  const evidence = await locator.evaluate(el => {
    const fragments: { left: number; top: number; right: number; bottom: number; uncovered: boolean }[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue;
        const onScreen = rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
        const uncovered = onScreen && [0.05, 0.5, 0.95].every(fraction =>
          el.contains(document.elementFromPoint(rect.left + rect.width * fraction, rect.top + rect.height / 2)));
        fragments.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, uncovered });
      }
    }
    return fragments;
  });
  expect(evidence.length, "The explanation must contain rendered text").toBeGreaterThan(0);
  expect(evidence.filter(fragment => !fragment.uncovered), "Every text line must be on screen and uncovered by the logout banner or shell").toEqual([]);
}
async function uncertain(page: Page, baseURL: string) {
  const { items } = await operationCases(page, baseURL), thread = await storedThread(page, items[1].id);
  const path = `/api/proxy/conversations/${thread.id}/messages`, body = `  QA38 Logout ${randomUUID()}  `;
  await page.goto(`/inbox?c=${thread.id}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  await page.evaluate(() => sessionStorage.setItem("unrelated-logout-preference", "kept"));
  await page.route(`**${path}`, async route => { const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort("failed"); }, { times: 1 });
  await composer.fill(body); await composer.press("Enter");
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toBeVisible();
  expect((await protectedKeys(page)).length).toBeGreaterThan(0);
  return { thread, body, path, caseId: items[1].id };
}
async function topBarLogout(page: Page) {
  await page.getByRole("button", { name: "User menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign Out", exact: true }).click();
}
async function loginSameActorSPA(page: Page, baseURL: string, thread: string) {
  const owner = queueProfiles(baseURL).owners[0];
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.locator('a[href="/inbox"]').first().click(); await expect(page).toHaveURL(/\/inbox$/);
  await page.evaluate(id => history.pushState(null, "", `/inbox?c=${id}`), thread);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEnabled();
}

for (const entry of ["topbar", "dashboard", "platform"]) test(`explicit ${entry} logout purges protected receipts but preserves unrelated storage`, async ({ page, baseURL }) => {
  const state = await uncertain(page, baseURL!);
  if (entry === "dashboard") { await page.goto("/dashboard"); await page.getByRole("button", { name: "Sign out", exact: true }).click(); }
  else if (entry === "platform") {
    expect((await page.request.post("/api/auth/login", { data: { email: "platform-browser@example.com", password: "Platform-browser-only-2026!" } })).ok()).toBeTruthy();
    await page.goto("/platform"); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  } else await topBarLogout(page);
  await expect(page).toHaveURL(/\/login$/);
  expect(await protectedKeys(page)).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("unrelated-logout-preference"))).toBe("kept");
  await queueLogin(page, baseURL!, "en", 390); await page.goto(`/inbox?c=${state.thread.id}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
  expect((await storedThread(page, state.caseId)).messages.filter((m: { body: string }) => m.body === state.body)).toHaveLength(1);
});

test("logout hides protected UI synchronously while its server response is held", async ({ page, baseURL }) => {
  await uncertain(page, baseURL!);
  let release!: () => void, seen!: () => void; const held = new Promise<void>(r => release = r), received = new Promise<void>(r => seen = r);
  await page.route("**/api/auth/logout", async route => { seen(); await held; const response = await route.fetch(); await route.fulfill({ response }); }, { times: 1 });
  try {
    await topBarLogout(page); await received;
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
    expect(await protectedKeys(page)).toEqual([]);
    release(); await expect(page).toHaveURL(/\/login$/);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("blocked storage cleanup cannot stop logout or expose old content after reload and same-actor login", async ({ page, baseURL }) => {
  const state = await uncertain(page, baseURL!);
  await page.evaluate(p => {
    const remove = Storage.prototype.removeItem, set = Storage.prototype.setItem;
    Storage.prototype.removeItem = function(key) { if (key.startsWith(p)) throw new Error("QA logout cleanup blocked"); return remove.call(this, key); };
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("garageos.message")) throw new Error("QA logout storage blocked"); return set.call(this, key, value); };
  }, prefix);
  await topBarLogout(page); await expect(page).toHaveURL(/\/login$/);
  expect((await protectedKeys(page)).length).toBeGreaterThan(0);
  await page.reload(); await queueLogin(page, baseURL!, "en", 390); await page.goto(`/inbox?c=${state.thread.id}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
  const records = await page.evaluate(p => Object.entries(sessionStorage).filter(([key]) => key.startsWith(p)).map(([,value]) => value), prefix);
  expect(records.join(" ")).not.toContain(state.body);
});

test("server-only logout reset purges a same-tab receipt after same-actor reauthentication", async ({ page, baseURL }) => {
  const state = await uncertain(page, baseURL!);
  expect((await page.request.post("/api/auth/logout")).ok()).toBeTruthy();
  await queueLogin(page, baseURL!, "en", 390); await page.goto(`/inbox?c=${state.thread.id}`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
});

for (const reset of ["missing", "malformed"]) test(`${reset} reset epoch cannot restore legacy protected content`, async ({ page, baseURL }) => {
  const state = await uncertain(page, baseURL!);
  await page.evaluate(reset => { document.cookie = `garageos_message_reset=${reset === "missing" ? "" : "invalid"}; Path=/; SameSite=Lax${reset === "missing" ? "; Max-Age=0" : ""}`; }, reset);
  await page.reload(); await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
  expect(await page.evaluate(body => Object.keys(sessionStorage).filter(k => k.startsWith("garageos.message-intents.v1:")).some(k => sessionStorage.getItem(k)?.includes(body)), state.body)).toBe(false);
});

test("rejected reset-cookie write plus failed HTTP logout still purges and keeps recovery revoked until logout retry", async ({ page, baseURL }) => {
  await uncertain(page, baseURL!);
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
    Object.defineProperty(document, "cookie", { configurable: true, get() { return descriptor.get!.call(document); }, set(value: string) { if (value.startsWith("garageos_message_reset=")) throw new Error("QA reset cookie blocked"); descriptor.set!.call(document, value); } });
  });
  await page.route("**/api/auth/logout", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
  await topBarLogout(page);
  await expect(page.getByRole("alert").filter({ hasText: "Could not sign out. Please retry." })).toBeVisible();
  expect(await protectedKeys(page)).toEqual([]);
  await page.getByRole("button", { name: "Verify session and access", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "message.storage") })).toBeVisible();
  await topBarLogout(page); await expect(page).toHaveURL(/\/login$/);
});

test("late pre-logout staff verification cannot dispatch after same-actor SPA login", async ({ page, baseURL }) => {
  const state = await uncertain(page, baseURL!);
  await page.evaluate(() => {
    const original = window.fetch; let first = true;
    const qa = window as unknown as { qaLogoutAuthHeld: boolean; qaLogoutAuthResumed: boolean; releaseLogoutAuth: () => void; qaSameWindow: string };
    qa.qaSameWindow = "same-window";
    window.fetch = async (...args) => {
      const capture = first && String(args[0]).endsWith("/api/proxy/auth/me"); if (capture) first = false;
      const response = await original(...args);
      if (capture) { await new Promise<void>(resolve => { qa.releaseLogoutAuth = resolve; qa.qaLogoutAuthHeld = true; }); qa.qaLogoutAuthResumed = true; }
      return response;
    };
  });
  let posts = 0; page.on("request", request => { if (request.method() === "POST" && request.url().endsWith(state.path)) posts++; });
  try {
    await page.getByRole("button", { name: "Retry original message", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { qaLogoutAuthHeld: boolean }).qaLogoutAuthHeld);
    await topBarLogout(page); await expect(page).toHaveURL(/\/login$/);
    await loginSameActorSPA(page, baseURL!, state.thread.id);
    expect(await page.evaluate(() => (window as unknown as { qaSameWindow: string }).qaSameWindow)).toBe("same-window");
    const composer = page.getByRole("textbox", { name: "Message", exact: true }); await composer.fill("Fresh independent draft");
    await page.evaluate(() => (window as unknown as { releaseLogoutAuth: () => void }).releaseLogoutAuth());
    await page.waitForFunction(() => (window as unknown as { qaLogoutAuthResumed: boolean }).qaLogoutAuthResumed);
    await expect(composer).toHaveValue("Fresh independent draft");
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled(); expect(posts).toBe(0);
    await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
  } finally { await page.evaluate(() => (window as unknown as { releaseLogoutAuth?: () => void }).releaseLogoutAuth?.()); }
});

test("late pre-logout ACK cannot clear or unblock a new same-actor pending send", async ({ page, baseURL }) => {
  const state = await uncertain(page, baseURL!);
  let releaseOld!: () => void, releaseNew!: () => void, oldSeen!: () => void, newSeen!: () => void, calls = 0;
  const oldHeld = new Promise<void>(r => releaseOld = r), newHeld = new Promise<void>(r => releaseNew = r);
  const oldReceived = new Promise<void>(r => oldSeen = r), newReceived = new Promise<void>(r => newSeen = r);
  await page.route(`**${state.path}`, async route => {
    const old = calls++ === 0, response = await route.fetch(); expect(response.status()).toBe(201);
    if (old) { oldSeen(); await oldHeld; } else { newSeen(); await newHeld; }
    await route.fulfill({ response });
  });
  try {
    await page.evaluate(() => (window as unknown as { qaSameWindow: string }).qaSameWindow = "same-window");
    await page.getByRole("button", { name: "Retry original message", exact: true }).click(); await oldReceived;
    await topBarLogout(page); await expect(page).toHaveURL(/\/login$/); await loginSameActorSPA(page, baseURL!, state.thread.id);
    expect(await page.evaluate(() => (window as unknown as { qaSameWindow: string }).qaSameWindow)).toBe("same-window");
    const composer = page.getByRole("textbox", { name: "Message", exact: true }), body = `QA38 Logout new ${randomUUID()}`;
    await composer.fill(body); await composer.press("Enter"); await newReceived;
    const snapshot = await page.evaluate(p => Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => key.startsWith(p))), prefix);
    const oldACK = page.waitForResponse(r => r.url().endsWith(state.path) && r.request().method() === "POST"); releaseOld(); await oldACK;
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    expect(await page.evaluate(p => Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => key.startsWith(p))), prefix)).toEqual(snapshot);
    await expect(composer).toHaveValue(body); await expect(page.getByRole("button", { name: "Sending…", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toHaveCount(0);
    releaseNew(); await expect(page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible(); await expect(composer).toHaveValue("");
    const messages = (await storedThread(page, state.caseId)).messages;
    expect(messages.filter((m: { body: string }) => m.body === state.body)).toHaveLength(1); expect(messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
  } finally { releaseOld(); releaseNew(); await page.unrouteAll({ behavior: "wait" }); }
});

test("Mini held old verification401 cannot invalidate a new session after actual staff logout", async ({ page, baseURL }) => {
  await prepareMini(page, baseURL!);
  const created = await page.request.post("/api/mini/proxy/roadside", { data: { description: `QA38 Logout Mini ${randomUUID()}` } }); expect(created.ok()).toBeTruthy();
  const id = (await created.json()).conversation_id as string; await page.goto(`/mini/messages/${id}`);
  const composer = page.getByRole("textbox", { name: "Message…", exact: true }); await expect(composer).toBeEnabled(); await composer.fill("Old Mini draft");
  await page.evaluate(() => (window as unknown as { qaSameWindow: string }).qaSameWindow = "same-window");
  await page.context().addCookies([{ name: "garageos_customer_token", value: "QA-invalidated-session", url: baseURL! }]);
  let release!: () => void, seen!: () => void; const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route("**/api/mini/proxy/me", async route => { const response = await route.fetch(); expect(response.status()).toBe(401); seen(); await held; await route.fulfill({ response }); }, { times: 1 });
  const staff = await page.context().newPage();
  try {
    await composer.press("Enter"); await fetched;
    await queueLogin(staff, baseURL!, "en", 1280); await staff.goto("/dashboard"); await topBarLogout(staff); await expect(staff).toHaveURL(/\/login$/);
    let auths = 0; page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/mini/auth")) auths++; });
    const listRead = page.waitForResponse(r => r.url().endsWith("/api/mini/proxy/messages") && r.ok());
    await page.getByRole("link", { name: "Messages", exact: true }).first().click(); await listRead; expect(auths).toBe(1);
    const old401 = page.waitForResponse(r => r.url().endsWith("/api/mini/proxy/me") && r.status() === 401); release(); await old401;
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const homeRead = page.waitForResponse(r => r.url().endsWith("/api/mini/proxy/home") && r.ok());
    await page.getByRole("link", { name: "Home", exact: true }).click(); await homeRead;
    expect(await page.evaluate(() => (window as unknown as { qaSameWindow: string }).qaSameWindow)).toBe("same-window");
    expect(auths).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await staff.close(); }
});

test("Mini delayed authenticated response body cannot establish identity after logout reset", async ({ page, baseURL }) => {
  await prepareMini(page, baseURL!);
  const created = await page.request.post("/api/mini/proxy/roadside", { data: { description: `QA38 Logout JSON ${randomUUID()}` } }); expect(created.ok()).toBeTruthy();
  const id = (await created.json()).conversation_id as string;
  await page.addInitScript(() => {
    const original = window.fetch; let first = true;
    const qa = window as unknown as { qaLogoutJSONHeld: boolean; releaseLogoutJSON: () => void };
    window.fetch = async (...args) => {
      const captured = first && String(args[0]).endsWith("/api/mini/proxy/me"); if (captured) first = false;
      const response = await original(...args);
      if (captured) {
        const readJSON = response.json.bind(response);
        response.json = async () => { const data: unknown = await readJSON(); await new Promise<void>(r => { qa.releaseLogoutJSON = r; qa.qaLogoutJSONHeld = true; }); return data; };
      }
      return response;
    };
  });
  let threads = 0; page.on("request", r => { if (r.method() === "GET" && r.url().endsWith(`/api/mini/proxy/messages/${id}`)) threads++; });
  await page.goto(`/mini/messages/${id}`); await page.waitForFunction(() => (window as unknown as { qaLogoutJSONHeld: boolean }).qaLogoutJSONHeld);
  const staff = await page.context().newPage();
  try {
    await queueLogin(staff, baseURL!, "en", 1280); await staff.goto("/dashboard"); await topBarLogout(staff); await expect(staff).toHaveURL(/\/login$/);
    await page.evaluate(() => (window as unknown as { releaseLogoutJSON: () => void }).releaseLogoutJSON());
    await expect(page.getByRole("button", { name: "Verify session and access", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message…", exact: true })).toHaveCount(0); expect(threads).toBe(0);
    await page.getByRole("button", { name: "Verify session and access", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Message…", exact: true })).toBeEnabled(); expect(threads).toBe(1);
  } finally { await page.evaluate(() => (window as unknown as { releaseLogoutJSON?: () => void }).releaseLogoutJSON?.()); await staff.close(); }
});

test("missing unwritable reset cookie hides receipts and refuses restoration", async ({ page, baseURL }) => {
  const state = await uncertain(page, baseURL!);
  await page.evaluate(() => { document.cookie = "garageos_message_reset=; Path=/; Max-Age=0"; });
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
    Object.defineProperty(document, "cookie", { configurable: true, get() { return descriptor.get!.call(document); }, set(value: string) { if (value.startsWith("garageos_message_reset=")) throw new Error("QA reset epoch unavailable"); descriptor.set!.call(document, value); } });
  });
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "message.storage") })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry original message", exact: true })).toHaveCount(0);
  expect(await page.getByText(state.body, { exact: true }).count()).toBe(0);
  expect((await protectedKeys(page)).length).toBeGreaterThan(0);
});

for (const locale of ["uz", "en", "ru"] as Locale[]) for (const width of [360, 390, 1280]) test(`logout failure ${locale} ${width} is localized accessible and keeps old recovery hidden`, async ({ page, baseURL }, info) => {
  const state = await uncertain(page, baseURL!); await page.setViewportSize({ width, height: 900 });
  if (locale !== "en") await switchQueueLocale(page, "en", locale);
  await page.route("**/api/auth/logout", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
  const user = page.getByRole("button", { name: translate(locale, "menu.user"), exact: true });
  await user.click(); await page.getByRole("menuitem", { name: translate(locale, "menu.signout"), exact: true }).click();
  const failure = page.getByRole("alert").filter({ hasText: translate(locale, "platform.logout_failed") });
  await expect(failure).toBeVisible();
  // HTTP logout failed: the server still accepts the old cookie, but the
  // browser must keep its revoked receipt hidden and both explanations readable.
  expect((await page.request.get("/api/proxy/auth/me")).status()).toBe(200);
  await assertUncoveredText(failure);
  await assertUncoveredText(page.getByRole("alert").filter({ hasText: translate(locale, "message.auth") }));
  await expect(page.getByRole("textbox", { name: translate(locale, "ops.message"), exact: true })).toHaveCount(0);
  expect(await protectedKeys(page)).toEqual([]); await expect(page.getByText(state.body, { exact: true })).toHaveCount(0);
  await expect(user).toBeFocused(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await expect(user).toBeFocused();
  await assertKeyboardFocus(page, user); await queueTargets(page, page.locator("header").first()); await queueOverflow(page);
  await assertAccessible(page, info, `logout-failed-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`logout-failed-${locale}-${width}.png`), fullPage: true });
});
