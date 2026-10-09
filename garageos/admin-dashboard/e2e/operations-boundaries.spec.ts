import { expect, test } from "@playwright/test";
import { freshOperationsDemoToken } from "./support/demo-session";
import { randomUUID } from "node:crypto";
import { operationCases, caseRow, operationsProfiles, storedCase, storedThread } from "./support/operations";
import { queueLogin, queueProfiles, queueOverflow, queueTargets, switchQueueLocale } from "./support/queue";
import { assertAccessible, settleMotion, assertKeyboardFocus } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off" });

test("same-name prefix-colliding mechanics on phone each persist the selected UUID", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!);
  const profile = operationsProfiles(baseURL!)[0];
  expect(profile.duplicate_ids[0].slice(0, 35)).toBe(profile.duplicate_ids[1].slice(0, 35));
  const actualRoster = await (await page.request.get("/api/proxy/cases/mechanics")).json(); expect(actualRoster.length).toBeGreaterThan(5);
  await queueLogin(page, baseURL!, "en", 390);
  await page.goto(`/operations?case=${items[1].id}`);
  const select = page.getByRole("combobox", { name: "Mechanic", exact: true });
  for (const id of profile.duplicate_ids) {
    await expect(select).toBeEnabled(); await expect(select.locator(`option[value="${id}"]`)).toHaveText(`${profile.duplicate_name} · ${id}`);
    await select.selectOption(id); await page.getByRole("button", { name: "Assign mechanic", exact: true }).click();
    await expect.poll(async () => (await storedCase(page, items[1].id)).assigned_user_id).toBe(id);
    await expect(select).toBeEnabled(); await expect(page.getByText(`${profile.duplicate_name} · ${id}`, { exact: true }).first()).toBeVisible();
  }
  // Real roster records, reversed at the transport presentation seam: stable
  // names still identify the same UUID regardless of list positions.
  await page.route("**/api/proxy/cases/mechanics", async route => { const response = await route.fetch(); expect(response.ok()).toBeTruthy(); await route.fulfill({ response, json: (await response.json()).reverse() }); });
  await page.reload();
  for (const id of profile.duplicate_ids) await expect(select.locator(`option[value="${id}"]`)).toHaveText(`${profile.duplicate_name} · ${id}`);
  await queueOverflow(page); await queueTargets(page, page.locator("[data-operations]"));
});

test("older resolved link remains independent and deliberate browsing replaces URL intent", async ({ page, baseURL }) => {
  test.setTimeout(100_000);
  const { items } = await operationCases(page, baseURL!, 62);
  expect((await page.request.patch(`/api/proxy/cases/${items[0].id}`, { data: { status: "resolved" } })).ok()).toBeTruthy();
  await page.clock.install(); await page.goto(`/operations?case=${items[0].id}`);
  await expect(page.getByRole("heading", { name: items[0].title, exact: true })).toBeVisible();
  await expect(page.getByText("Opened from a link; this case is outside the current page.", { exact: true })).toBeVisible();
  await expect(caseRow(page, items[0].code)).toHaveCount(0);
  await caseRow(page, items[61].code).click(); await expect(page.getByRole("heading", { name: items[61].title, exact: true })).toBeVisible();
  const refreshed = page.waitForResponse(r => r.url().includes("/api/proxy/cases?") && r.ok());
  await page.clock.fastForward(8100); await refreshed;
  await expect(page.getByRole("heading", { name: items[61].title, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: items[0].title, exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search cases", exact: true }).fill(items[60].title); await page.clock.fastForward(350);
  await expect(caseRow(page, items[60].code)).toBeVisible(); await expect(page.getByRole("heading", { name: items[0].title, exact: true })).toHaveCount(0);
});

for (const kind of ["foreign", "missing", "invalid"]) test(`${kind} case link shows unavailable without substituting a first case`, async ({ page, baseURL }) => {
  await queueLogin(page, baseURL!, "en", 1280);
  const foreign = operationsProfiles(baseURL!)[1]; const id = kind === "foreign" ? foreign.legacy_id : kind === "missing" ? randomUUID() : "invalid-case-id";
  const response = await page.request.get(`/api/proxy/cases/${id}`); expect(response.status()).toBe(kind === "invalid" ? 422 : 404);
  await page.goto(`/operations?case=${id}`);
  await expect(page.getByRole("alert").filter({ hasText: "Case not found or unavailable." })).toBeVisible();
  await expect(page.locator('section[aria-label="Case details"] h2')).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
  await expect(page.getByText(foreign.legacy_code, { exact: true })).toHaveCount(0);
});

test("every type/status filter uses server counts and ordinary disappearance clears detail/thread", async ({ page, baseURL }) => {
  const { person, items } = await operationCases(page, baseURL!);
  const kinds = ["emergency", "towing", "warranty", "vip"];
  const typed = [];
  for (const kind of kinds) {
    const response = await page.request.post("/api/proxy/cases", { data: { customer_id: person.customer_id, title: `${person.tag} ${kind}`, case_type: kind } }); expect(response.ok()).toBeTruthy(); typed.push(await response.json());
  }
  await page.goto("/operations"); await page.getByRole("textbox", { name: "Search cases", exact: true }).fill(person.tag);
  await expect(page.getByText("6 matching · 6 open", { exact: true })).toBeVisible();
  for (const [i, kind] of kinds.entries()) {
    await page.getByRole("combobox", { name: "All types", exact: true }).selectOption(kind);
    await expect(caseRow(page, typed[i].code)).toBeVisible(); await expect(page.getByText("1 matching · 1 open", { exact: true })).toBeVisible();
    const server = await (await page.request.get(`/api/proxy/cases?status=active&type=${kind}&q=${person.tag}&limit=20`)).json(); expect(server.items.map((item: { id: string }) => item.id)).toEqual([typed[i].id]);
  }
  await page.getByRole("combobox", { name: "All types", exact: true }).selectOption("support"); await expect(caseRow(page, items[1].code)).toBeVisible();
  await caseRow(page, items[1].code).click(); await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toBeVisible();
  expect((await page.request.patch(`/api/proxy/cases/${items[1].id}`, { data: { status: "resolved" } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "Refresh cases", exact: true }).click(); await expect(caseRow(page, items[1].code)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toHaveCount(0); await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Resolved", exact: true }).click(); await expect(caseRow(page, items[1].code)).toBeVisible();
  await expect(page.getByText("1 matching · 0 open", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "All types", exact: true }).selectOption("all"); await expect(caseRow(page, items[1].code)).toBeVisible();
});

for (const locale of ["uz", "en", "ru"] as Locale[]) for (const width of [390, 1280]) test(`dark unknown/missing recorded data ${locale}/${width} is accessible and truthful`, async ({ page, baseURL }, info) => {
  await queueLogin(page, baseURL!, locale, width);
  const profile = operationsProfiles(baseURL!)[0]; const label = (key: string) => translate(locale, `ops.${key}`);
  await page.addInitScript(() => localStorage.setItem("garageos-theme", "dark"));
  await page.goto(`/operations?case=${profile.legacy_id}`); await expect(page.locator("html")).toHaveClass(/dark/); await settleMotion(page);
  await expect(page.getByRole("heading", { name: profile.legacy_title, exact: true })).toBeVisible();
  await expect(page.getByText(label("unknown"), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(label("coordinates").replace("{lat}", "0").replace("{lng}", "0"), { exact: true })).toBeVisible();
  await expect(page.getByText(label("no_vehicle"), { exact: true })).toBeVisible(); await expect(page.getByText(label("no_events"), { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Request tow|Emergency services|GPS|Notify manager/ })).toHaveCount(0);
  await expect(page.getByText(/Customer informed|ETA shared|AI Triage/)).toHaveCount(0);
  await queueOverflow(page); await queueTargets(page, page.locator("[data-operations]")); await assertAccessible(page, info, `operations-dark-detail-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`operations-dark-detail-${locale}-${width}.png`), fullPage: true });
  if (width < 1280) await page.getByRole("button", { name: label("conversation"), exact: true }).click();
  await expect(page.getByRole("link", { name: label("inbox"), exact: true })).toBeVisible();
  await queueOverflow(page); await queueTargets(page, page.locator("[data-operations]")); await assertAccessible(page, info, `operations-dark-thread-${locale}-${width}`);
  await page.screenshot({ path: info.outputPath(`operations-dark-thread-${locale}-${width}.png`), fullPage: true });
});

test("pending captured PATCH permits browsing another full detail and cannot paint it", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!); const a = items[1], b = items[0];
  await page.goto("/operations"); await expect(caseRow(page, a.code)).toBeVisible();
  await caseRow(page, a.code).click(); await expect(page.getByRole("heading", { name: a.title, exact: true })).toBeVisible();
  let release!: () => void, seen!: () => void, writes = 0;
  const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/cases/${a.id}`, async route => {
    if (route.request().method() !== "PATCH") { await route.continue(); return; }
    writes++; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seen(); await held; await route.fulfill({ response });
  });
  try {
    const button = page.getByRole("button", { name: "Set status: Acknowledged", exact: true });
    await button.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); }); await fetched;
    await caseRow(page, b.code).click(); await expect(page.getByRole("heading", { name: b.title, exact: true })).toBeVisible();
    const stored = await storedCase(page, a.id); expect(stored.status).toBe("acknowledged"); expect(writes).toBe(1);
    release(); await page.unrouteAll({ behavior: "wait" });
    await expect(page.getByRole("heading", { name: b.title, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: a.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Change saved." })).toHaveCount(0);
    expect((await storedCase(page, b.id)).status).toBe("new"); expect(writes).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("fresh acknowledged case becomes writable after a different pending target completes", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!); const a = items[1], b = items[0];
  let releaseB!: () => void, releaseA!: () => void, seenB!: () => void, seenA!: () => void;
  const holdB = new Promise<void>(r => releaseB = r), holdA = new Promise<void>(r => releaseA = r);
  const fetchedB = new Promise<void>(r => seenB = r), fetchedA = new Promise<void>(r => seenA = r);
  let afterBWrite = false, bReads = 0, writes = 0;
  await page.route(`**/api/proxy/cases/${b.id}`, async route => {
    if (route.request().method() === "PATCH") {
      writes++; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); afterBWrite = true; await route.fulfill({ response }); return;
    }
    if (!afterBWrite) { await route.continue(); return; }
    bReads++;
    if (bReads > 2) { await route.fulfill({ status: 503, contentType: "application/json", body: "{}" }); return; }
    const response = await route.fetch(); expect(response.ok()).toBeTruthy();
    if (bReads === 1) { seenB(); await holdB; }
    await route.fulfill({ response });
  });
  await page.route(`**/api/proxy/cases/${a.id}`, async route => {
    if (route.request().method() !== "PATCH") { await route.continue(); return; }
    writes++; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seenA(); await holdA; await route.fulfill({ response });
  });
  try {
    await page.goto(`/operations?case=${b.id}`);
    await page.getByRole("button", { name: "Set status: Acknowledged", exact: true }).click(); await fetchedB;
    await caseRow(page, a.code).click(); await expect(page.getByRole("heading", { name: a.title, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Set status: Acknowledged", exact: true }).click(); await fetchedA;
    await caseRow(page, b.code).click();
    const nextAction = page.getByRole("button", { name: "Set status: Assigned", exact: true });
    await expect(nextAction).toBeVisible(); await expect(nextAction).toBeDisabled(); expect(bReads).toBe(2);
    // B's fresh snapshot has already succeeded while A is pending. Its readiness
    // must not depend on another successful poll (all later reads fail above).
    const ack = page.waitForResponse(response => response.url().endsWith(`/cases/${a.id}`) && response.request().method() === "PATCH" && response.ok());
    releaseA(); await ack; await expect(nextAction).toBeEnabled({ timeout: 5000 });
    expect((await storedCase(page, a.id)).status).toBe("acknowledged");
    expect((await storedCase(page, b.id)).status).toBe("acknowledged"); expect(writes).toBe(2);
  } finally { releaseA(); releaseB(); await page.unrouteAll({ behavior: "wait" }); }
});

test("real read-only demo claims retain case details when its thread has not started", async ({ page, baseURL }) => {
  queueProfiles(baseURL!); // Guard the isolated origin before any request.
  // Actual normal password staff request creates only the case, not its thread.
  expect((await page.request.post("/api/auth/login", { data: { email: "admin@demo.garageos.app", password: "demo1234" } })).ok()).toBeTruthy();
  const customers = await (await page.request.get("/api/proxy/customers?limit=1")).json();
  const response = await page.request.post("/api/proxy/cases", { data: { customer_id: customers.items[0].id, title: `QA37 readonly ${randomUUID()}`, case_type: "support" } }); expect(response.ok()).toBeTruthy(); const item = await response.json();
  const demoToken = await freshOperationsDemoToken(page, baseURL!);
  await page.context().addCookies([{ name: "garageos_token", value: demoToken, url: baseURL!, httpOnly: true }, { name: "garageos_demo", value: "1", url: baseURL!, httpOnly: true }, { name: "garageos_locale", value: "en", url: baseURL! }]);
  const me = await (await page.request.get("/api/proxy/auth/me")).json(); expect(me.permissions).toEqual(["staff.read"]);
  expect((await page.request.patch(`/api/proxy/cases/${item.id}`, { data: { status: "resolved" } })).status()).toBe(403);
  expect((await page.request.get(`/api/proxy/cases/${item.id}/conversation`)).status()).toBe(403);
  await page.goto(`/operations?case=${item.id}`);
  await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
  await expect(page.getByText("This session has read-only access.", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Set status: Acknowledged", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: "You no longer have access" })).toHaveCount(0);
});

test("late prior-filter list and errors cannot overwrite the current query", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!);
  await page.goto("/operations"); await expect(caseRow(page, items[1].code)).toBeVisible();
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route("**/api/proxy/cases?**", async route => {
    if (new URL(route.request().url()).searchParams.get("q") !== items[0].title) { await route.continue(); return; }
    const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seen(); await held; await route.fulfill({ response });
  });
  try {
    const search = page.getByRole("textbox", { name: "Search cases", exact: true }); await search.fill(items[0].title); await fetched;
    await expect(caseRow(page, items[1].code)).toHaveCount(0); await expect(page.getByText(/matching ·/)).toHaveCount(0);
    await search.fill(items[1].title); await expect(caseRow(page, items[1].code)).toBeVisible();
    release(); await page.unrouteAll({ behavior: "wait" }); await settleMotion(page);
    await expect(caseRow(page, items[0].code)).toHaveCount(0); await expect(caseRow(page, items[1].code)).toBeVisible();
    await expect(page.getByText("1 matching · 1 open", { exact: true })).toBeVisible();
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("held polling request does not overlap and failed same-filter refresh is explicitly stale", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!);
  await page.clock.install(); let calls = 0, release!: () => void, seen!: () => void;
  const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route("**/api/proxy/cases?**", async route => { calls++; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); if (calls === 1) { seen(); await held; } await route.fulfill({ response }); });
  try {
    await page.goto("/operations"); await fetched; await expect(page.getByRole("status").filter({ hasText: "Loading…" })).toBeVisible();
    await page.clock.fastForward(16_500); expect(calls).toBe(1);
    release(); await expect(caseRow(page, items[1].code)).toBeVisible(); await page.unrouteAll({ behavior: "wait" });
    await caseRow(page, items[1].code).click(); await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toBeVisible();
    const counts = await page.getByText(/matching ·/).textContent();
    await page.route("**/api/proxy/cases?**", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
    await page.getByRole("button", { name: "Refresh cases", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Showing the last successful data" })).toBeVisible();
    await expect(caseRow(page, items[1].code)).toBeVisible(); await expect(page.getByText(/matching ·/)).toHaveText(counts!);
    await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Retry", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Showing the last successful data" })).toHaveCount(0);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("late thread response cannot paint another case and read failure is not an empty thread", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!); const a = items[1], b = items[0];
  const ta = await storedThread(page, a.id), tb = await storedThread(page, b.id);
  expect((await page.request.post(`/api/proxy/conversations/${ta.id}/messages`, { data: { body: "QA37 actual A-only message", channel: "web", author_role: "dispatcher", kind: "text", is_internal: false } })).ok()).toBeTruthy();
  expect((await page.request.post(`/api/proxy/conversations/${tb.id}/messages`, { data: { body: "QA37 actual B-only message", channel: "web", author_role: "dispatcher", kind: "text", is_internal: false } })).ok()).toBeTruthy();
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/cases/${b.id}/conversation`, async route => { const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seen(); await held; await route.fulfill({ response }); }, { times: 1 });
  try {
    await page.goto(`/operations?case=${a.id}`); await expect(page.getByRole("article").getByText("QA37 actual A-only message", { exact: true })).toBeVisible();
    await caseRow(page, b.code).click(); await fetched; await expect(page.getByRole("article").getByText("QA37 actual A-only message", { exact: true })).toHaveCount(0);
    await caseRow(page, a.code).click(); await expect(page.getByRole("article").getByText("QA37 actual A-only message", { exact: true })).toBeVisible();
    release(); await page.unrouteAll({ behavior: "wait" }); await settleMotion(page); await expect(page.getByRole("article").getByText("QA37 actual B-only message", { exact: true })).toHaveCount(0);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
  await page.route(`**/api/proxy/cases/${b.id}/conversation`, route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
  await caseRow(page, b.code).click(); await expect(page.getByRole("alert").filter({ hasText: "Could not load data." })).toBeVisible();
  await expect(page.getByText("No messages recorded.", { exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry", exact: true }).click(); await expect(page.getByRole("article").getByText("QA37 actual B-only message", { exact: true })).toBeVisible();
});

test("captured send, duplicate Enter guard and acknowledged draft edits stay with their case", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!); const a = items[1], b = items[0];
  await page.goto(`/operations?case=${a.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, a.id); const body = `QA37 captured ${randomUUID()}`;
  const composer = page.getByRole("textbox", { name: "Message", exact: true }); await composer.fill(body);
  let release!: () => void, seen!: () => void, writes = 0;
  const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, async route => { writes++; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seen(); await held; await route.fulfill({ response }); });
  try {
    await composer.evaluate(element => { element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }); await fetched;
    await composer.fill("QA37 newer edit of A draft"); await caseRow(page, b.code).click(); await expect(page.getByRole("heading", { name: b.title, exact: true })).toBeVisible();
    await composer.fill("QA37 B draft must survive A acknowledgement");
    release(); await page.unrouteAll({ behavior: "wait" });
    await expect(composer).toHaveValue("QA37 B draft must survive A acknowledgement"); await expect(page.getByRole("article").getByText(body, { exact: true })).toHaveCount(0);
    expect((await storedThread(page, a.id)).messages.filter((message: { body: string }) => message.body === body)).toHaveLength(1); expect(writes).toBe(1);
    await caseRow(page, a.code).click(); await expect(composer).toHaveValue("QA37 newer edit of A draft"); await expect(page.getByRole("article").getByText(body, { exact: true })).toBeVisible();
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("mechanic roster failure has explicit retry and cannot masquerade as empty", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!);
  await page.route("**/api/proxy/cases/mechanics", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
  await page.goto(`/operations?case=${items[1].id}`);
  await expect(page.getByRole("alert").filter({ hasText: "Could not load mechanics." })).toBeVisible(); await expect(page.getByText("No available mechanics.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click(); await expect(page.getByRole("combobox", { name: "Mechanic", exact: true })).toBeEnabled();
});

test("phone keyboard navigation focuses deliberately and polls/locale changes preserve a draft", async ({ page, baseURL }, info) => {
  const { items, person } = await operationCases(page, baseURL!);
  await queueLogin(page, baseURL!, "en", 390); await page.clock.install();
  await page.goto("/operations"); await settleMotion(page);
  const search = page.getByRole("textbox", { name: "Search cases", exact: true });
  await assertKeyboardFocus(page, search); await search.fill(person.tag); await page.clock.fastForward(350); await expect(caseRow(page, items[1].code)).toBeVisible();
  await assertKeyboardFocus(page, caseRow(page, items[1].code)); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conversation", exact: true })).toBeFocused();
  const composer = page.getByRole("textbox", { name: "Message", exact: true }); await composer.fill("QA37 keyboard draft & Русский"); await composer.focus();
  const refreshed = page.waitForResponse(response => response.url().endsWith(`/cases/${items[1].id}/conversation`) && response.ok()); await page.clock.fastForward(8100); await refreshed;
  await expect(composer).toBeFocused(); await expect(composer).toHaveValue("QA37 keyboard draft & Русский");
  await switchQueueLocale(page, "en", "uz");
  await expect(page.getByRole("textbox", { name: translate("uz", "ops.message"), exact: true })).toHaveValue("QA37 keyboard draft & Русский");
  await expect(page.getByRole("heading", { name: translate("uz", "ops.conversation"), exact: true })).not.toBeFocused();
  await queueOverflow(page); await queueTargets(page, page.locator("[data-operations]")); await assertAccessible(page, info, "operations-keyboard-phone");
});
