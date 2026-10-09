import { expect, test } from "@playwright/test";
import { freshOperationsDemoToken } from "./support/demo-session";
import { randomUUID } from "node:crypto";
import { operationCases, caseRow, storedCase, storedThread } from "./support/operations";
import { queueLogin, queueProfiles, queueOverflow, queueTargets, switchQueueLocale } from "./support/queue";
import { assertAccessible } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off" });

test("search is trimmed, bounded and distinguishes empty results from read failure", async ({ page, baseURL }) => {
  const { person, items } = await operationCases(page, baseURL!);
  await page.goto("/operations");
  const search = page.getByRole("textbox", { name: "Search cases", exact: true });
  const trimmed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/proxy/cases" && new URL(response.url()).searchParams.get("q") === person.tag && response.ok());
  await search.fill(`   ${person.tag}   `); await trimmed;
  await expect(caseRow(page, items[1].code)).toBeVisible(); await expect(page.getByText("2 matching · 2 open", { exact: true })).toBeVisible();
  await search.fill("x".repeat(201)); await expect(search).toHaveValue("x".repeat(200));
  await expect(page.getByText("No matching cases.", { exact: true })).toBeVisible(); await expect(page.getByText("0 matching · 0 open", { exact: true })).toBeVisible();
  await expect(page.locator("[data-operations]").getByRole("alert")).toHaveCount(0);
  const blank = page.waitForResponse(response => new URL(response.url()).pathname === "/api/proxy/cases" && !new URL(response.url()).searchParams.has("q") && response.ok());
  await search.fill("   "); await blank; await expect(caseRow(page, items[1].code)).toBeVisible();
});

test("a held old page cannot restore its records, counts or selection after a new search", async ({ page, baseURL }) => {
  const { person, items } = await operationCases(page, baseURL!, 25);
  await page.goto("/operations"); await page.getByRole("textbox", { name: "Search cases", exact: true }).fill(person.tag);
  await expect(caseRow(page, items[24].code)).toBeVisible(); await caseRow(page, items[24].code).click();
  await expect(page.getByRole("heading", { name: items[24].title, exact: true })).toBeVisible();
  let release!: () => void, seen!: () => void;
  const hold = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route("**/api/proxy/cases?**", async route => {
    if (new URL(route.request().url()).searchParams.get("offset") !== "20") { await route.continue(); return; }
    const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seen(); await hold; await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Next page", exact: true }).click(); await fetched;
    await expect(page.getByRole("heading", { name: items[24].title, exact: true })).toHaveCount(0);
    await expect(page.getByText(/matching ·/)).toHaveCount(0); await expect(caseRow(page, items[24].code)).toHaveCount(0);
    await page.getByRole("textbox", { name: "Search cases", exact: true }).fill(items[24].title);
    await expect(caseRow(page, items[24].code)).toBeVisible();
    release(); await page.unrouteAll({ behavior: "wait" });
    await expect(caseRow(page, items[0].code)).toHaveCount(0); await expect(page.getByText("1 matching · 1 open", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: items[24].title, exact: true })).toHaveCount(0);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("a held pre-write detail poll cannot roll back a fresh acknowledged snapshot", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!); const a = items[1], b = items[0];
  await page.clock.install(); await page.goto(`/operations?case=${a.id}`);
  await expect(page.getByRole("button", { name: "Set status: Acknowledged", exact: true })).toBeEnabled();
  let release!: () => void, seen!: () => void;
  const hold = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/cases/${a.id}`, async route => {
    if (route.request().method() !== "GET") { await route.continue(); return; }
    const response = await route.fetch(); expect((await response.json()).status).toBe("new"); seen(); await hold; await route.fulfill({ response });
  }, { times: 1 });
  try {
    await page.clock.fastForward(8100); await fetched;
    await caseRow(page, b.code).click(); await expect(page.getByRole("heading", { name: b.title, exact: true })).toBeVisible();
    await caseRow(page, a.code).click(); await page.getByRole("button", { name: "Set status: Acknowledged", exact: true }).click();
    await expect(page.getByText("Change saved.", { exact: true })).toBeVisible();
    const next = page.getByRole("button", { name: "Set status: Assigned", exact: true }); await expect(next).toBeEnabled();
    release(); await page.unrouteAll({ behavior: "wait" });
    await expect(next).toBeEnabled(); await expect(page.getByRole("button", { name: "Set status: Acknowledged", exact: true })).toHaveCount(0);
    expect((await storedCase(page, a.id)).status).toBe("acknowledged");
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("pre-upstream rejected PATCH is not saved or replayed and requires deliberate reconciliation", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!); const item = items[1];
  let writes = 0;
  await page.route(`**/api/proxy/cases/${item.id}`, async route => {
    if (route.request().method() !== "PATCH") { await route.continue(); return; }
    writes++; await route.fulfill({ status: 422, contentType: "application/json", body: "{}" });
  });
  await page.goto(`/operations?case=${item.id}`); await page.getByRole("button", { name: "Set status: Acknowledged", exact: true }).click();
  await expect(page.getByText("Change was rejected. Check the current state before trying again.", { exact: true })).toBeVisible();
  expect((await storedCase(page, item.id)).status).toBe("new"); expect(writes).toBe(1);
  await expect(page.getByRole("button", { name: "Set status: Acknowledged", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Refresh current state", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set status: Acknowledged", exact: true })).toBeEnabled(); expect(writes).toBe(1);
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Set status: Acknowledged", exact: true }).click();
  await expect.poll(async () => (await storedCase(page, item.id)).status).toBe("acknowledged");
});

test("an acknowledged message stays saved when its follow-up thread read fails", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!); const item = items[1];
  await page.goto(`/operations?case=${item.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id), body = `QA37 ACK ${randomUUID()}`; let writes = 0;
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, async route => {
    writes++; const response = await route.fetch(); expect(response.ok()).toBeTruthy();
    await page.route(`**/api/proxy/cases/${item.id}/conversation`, read => read.fulfill({ status: 503, contentType: "application/json", body: "{}" }), { times: 1 });
    await route.fulfill({ response });
  });
  const composer = page.getByRole("textbox", { name: "Message", exact: true }); await composer.fill(body);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText(translate("en", "message.saved"), { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: translate("en", "message.refresh_error") })).toBeVisible();
  await expect(composer).toHaveValue(""); await expect(page.getByText(translate("en", "message.rejected"), { exact: true })).toHaveCount(0);
  expect((await storedThread(page, item.id)).messages.filter((message: { body: string }) => message.body === body)).toHaveLength(1); expect(writes).toBe(1);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("article").getByText(body, { exact: true })).toBeVisible(); expect(writes).toBe(1);
});

test("rejected internal note keeps exact text, mode and case through phone and locale changes", async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!); const item = items[1];
  await queueLogin(page, baseURL!, "en", 390); await page.goto(`/operations?case=${item.id}`);
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id), body = "  QA37 note\nO‘tkir <literal> & Русский  ";
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, route => route.fulfill({ status: 422, contentType: "application/json", body: "{}" }), { times: 1 });
  await page.getByRole("button", { name: "Internal note", exact: true }).click(); await page.getByRole("textbox", { name: "Message", exact: true }).fill(body);
  await page.getByRole("button", { name: "Send message", exact: true }).click(); await expect(page.getByText(translate("en", "message.rejected"), { exact: true })).toBeVisible();
  await switchQueueLocale(page, "en", "ru");
  const label = (key: string) => translate("ru", `ops.${key}`);
  await expect(page.getByRole("textbox", { name: label("message"), exact: true })).toHaveValue(body);
  await expect(page.getByRole("button", { name: label("note"), exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: label("detail"), exact: true }).click();
  await page.getByRole("button", { name: label("conversation"), exact: true }).click();
  await expect(page.getByRole("textbox", { name: label("message"), exact: true })).toHaveValue(body);
  expect((await storedThread(page, item.id)).messages.some((message: { body: string }) => message.body === body)).toBe(false);
  await expect(page.getByRole("button", { name: label("send"), exact: true })).toBeDisabled();
  await page.getByRole("button", { name: translate("ru", "message.resolve"), exact: true }).click();
  await expect(page.getByRole("textbox", { name: label("message"), exact: true })).toHaveValue(body);
  await page.getByRole("button", { name: label("send"), exact: true }).click();
  await expect.poll(async () => (await storedThread(page, item.id)).messages.filter((message: { body: string; is_internal: boolean; channel: string }) => message.body === body && message.is_internal && message.channel === "internal").length).toBe(1);
});

for (const action of ["patch", "message"]) test(`real backend read-only session downgrade rejects a previously enabled ${action}`, async ({ page, baseURL }) => {
  queueProfiles(baseURL!); // Guard the isolated origin before any request.
  expect((await page.request.post("/api/auth/login", { data: { email: "admin@demo.garageos.app", password: "demo1234" } })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: "garageos_locale", value: "en", url: baseURL! }]);
  const customer = (await (await page.request.get("/api/proxy/customers?limit=1")).json()).items[0];
  const response = await page.request.post("/api/proxy/cases", { data: { customer_id: customer.id, title: `QA37 downgrade ${randomUUID()}` } }); expect(response.ok()).toBeTruthy(); const item = await response.json();
  await page.goto(`/operations?case=${item.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id), body = `QA37 denied ${randomUUID()}`;
  const control = action === "patch" ? page.getByRole("button", { name: "Set status: Acknowledged", exact: true }) : page.getByRole("button", { name: "Send message", exact: true });
  if (action === "message") await page.getByRole("textbox", { name: "Message", exact: true }).fill(body);
  await expect(control).toBeEnabled();
  // Same owned demo center, actual AuthService read-only token and normal backend
  // authorization. No permission override or transport-invented denial.
  const demoToken = await freshOperationsDemoToken(page, baseURL!);
  await page.context().addCookies([{ name: "garageos_token", value: demoToken, url: baseURL!, httpOnly: true }, { name: "garageos_demo", value: "1", url: baseURL!, httpOnly: true }]);
  let messagePosts = 0;
  page.on("request", r => { if (r.method() === "POST" && r.url().endsWith(`/conversations/${thread.id}/messages`)) messagePosts++; });
  const denied = page.waitForResponse(r => action === "patch" ? r.request().method() === "PATCH" && r.status() === 403 : r.url().endsWith("/api/proxy/auth/me") && r.ok());
  await control.click(); const verified = await denied;
  if (action === "message") { expect((await verified.json()).permissions).not.toContain("staff.write"); expect(messagePosts).toBe(0); }
  await expect(page.getByRole("alert").filter({ hasText: "You no longer have access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: item.title, exact: true })).toHaveCount(0); await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
  expect((await storedCase(page, item.id)).status).toBe("new");
  const stored = await (await page.request.get(`/api/proxy/conversations/${thread.id}`)).json();
  expect(stored.messages.some((message: { body: string }) => message.body === body)).toBe(false);
});

for (const action of ["patch", "message"]) test(`pending ${action} keeps its real target and draft through locale and phone pane changes`, async ({ page, baseURL }, info) => {
  const { items } = await operationCases(page, baseURL!); const item = items[1];
  await queueLogin(page, baseURL!, "en", 360); await page.goto(`/operations?case=${item.id}`);
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const thread = await storedThread(page, item.id), body = `  QA37 pending ${action} <literal> & Ўзбек Русский\n${randomUUID()}  `;
  await page.getByRole("button", { name: "Internal note", exact: true }).click(); await page.getByRole("textbox", { name: "Message", exact: true }).fill(body);
  let release!: () => void, seen!: () => void, writes = 0;
  const hold = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(action === "patch" ? `**/api/proxy/cases/${item.id}` : `**/api/proxy/conversations/${thread.id}/messages`, async route => {
    if (route.request().method() !== (action === "patch" ? "PATCH" : "POST")) { await route.continue(); return; }
    writes++; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seen(); await hold; await route.fulfill({ response });
  });
  try {
    if (action === "patch") { await page.getByRole("button", { name: "Case details", exact: true }).click(); await page.getByRole("button", { name: "Set status: Acknowledged", exact: true }).click(); }
    else await page.getByRole("button", { name: "Send message", exact: true }).click();
    await fetched; await switchQueueLocale(page, "en", "uz"); await switchQueueLocale(page, "uz", "ru");
    const label = (key: string) => translate("ru", `ops.${key}`);
    if (action === "patch") {
      await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: label("saving"), exact: true }).first()).toBeDisabled();
      await page.getByRole("button", { name: label("conversation"), exact: true }).click();
    } else await expect(page.getByRole("button", { name: label("sending"), exact: true })).toBeDisabled();
    await expect(page.getByRole("textbox", { name: label("message"), exact: true })).toHaveValue(body);
    await expect(page.getByRole("button", { name: label("note"), exact: true })).toHaveAttribute("aria-pressed", "true");
    await queueOverflow(page); await queueTargets(page, page.locator("[data-operations]")); await assertAccessible(page, info, `operations-pending-locale-${action}`);
    release(); await page.unrouteAll({ behavior: "wait" });
    if (action === "patch") {
      await expect(page.getByRole("textbox", { name: label("message"), exact: true })).toHaveValue(body);
      await page.getByRole("button", { name: label("detail"), exact: true }).click(); await expect(page.getByText(label("saved"), { exact: true })).toBeVisible();
      expect((await storedCase(page, item.id)).status).toBe("acknowledged");
    } else {
      await expect(page.getByRole("textbox", { name: label("message"), exact: true })).toHaveValue(""); await expect(page.getByText(translate("ru", "message.saved"), { exact: true })).toBeVisible();
      expect((await storedThread(page, item.id)).messages.filter((message: { body: string; is_internal: boolean }) => message.body === body && message.is_internal)).toHaveLength(1);
    }
    expect(writes).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

for (const source of ["detail", "thread"]) for (const status of [401, 403]) test(`transport ${source} read ${status} clears protected display`, async ({ page, baseURL }) => {
  const { items } = await operationCases(page, baseURL!); const item = items[1];
  await page.goto(`/operations?case=${item.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  await page.route(`**/api/proxy/cases/${item.id}${source === "thread" ? "/conversation" : ""}`, route => route.fulfill({ status, contentType: "application/json", body: "{}" }));
  await page.getByRole("button", { name: source === "thread" ? "Refresh conversation" : "Refresh case details", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: status === 401 ? "Your session has expired" : "You no longer have access" })).toBeVisible();
  await expect(caseRow(page, item.code)).toHaveCount(0); await expect(page.getByRole("heading", { name: item.title, exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
});

for (const locale of ["uz", "en", "ru"] as Locale[]) for (const width of [360, 1280]) test(`localized loading empty error and pending states ${locale}/${width} are accessible`, async ({ page, baseURL }, info) => {
  const { items, person } = await operationCases(page, baseURL!); const item = items[1];
  await queueLogin(page, baseURL!, locale, width); const label = (key: string) => translate(locale, `ops.${key}`);
  let releaseList!: () => void, seenList!: () => void, releaseWrite!: () => void, seenWrite!: () => void;
  const holdList = new Promise<void>(r => releaseList = r), listFetched = new Promise<void>(r => seenList = r);
  const holdWrite = new Promise<void>(r => releaseWrite = r), writeFetched = new Promise<void>(r => seenWrite = r);
  const check = async (state: string) => { await queueOverflow(page); await queueTargets(page, page.locator("[data-operations]")); await assertAccessible(page, info, `operations-${state}-${locale}-${width}`); await page.screenshot({ path: info.outputPath(`operations-${state}-${locale}-${width}.png`), fullPage: true }); };
  await page.route("**/api/proxy/cases?**", async route => { const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seenList(); await holdList; await route.fulfill({ response }); }, { times: 1 });
  try {
    await page.goto("/operations"); await listFetched; await expect(page.getByRole("status").filter({ hasText: label("loading") })).toBeVisible(); await check("loading");
    releaseList(); await expect(caseRow(page, item.code)).toBeVisible();
    const search = page.getByRole("textbox", { name: label("search"), exact: true }); await search.fill(`QA37 missing ${randomUUID()}`);
    await expect(page.getByText(label("empty"), { exact: true })).toBeVisible(); await check("empty");
    await page.route("**/api/proxy/cases?**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "CASE_SEARCH_UNAVAILABLE" } }) }), { times: 1 });
    await search.fill(person.tag); await expect(page.getByText(label("search_unavailable"), { exact: true })).toBeVisible(); await check("error");
    await page.getByRole("button", { name: label("retry"), exact: true }).click(); await expect(caseRow(page, item.code)).toBeVisible(); await caseRow(page, item.code).click();
    await page.route(`**/api/proxy/cases/${item.id}`, async route => { if (route.request().method() !== "PATCH") { await route.continue(); return; } const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seenWrite(); await holdWrite; await route.fulfill({ response }); });
    await page.getByRole("button", { name: label("set_status").replace("{status}", label("status.acknowledged")), exact: true }).click(); await writeFetched;
    await expect(page.getByRole("button", { name: label("saving"), exact: true }).first()).toBeDisabled(); await check("pending");
    releaseWrite(); await expect(page.getByText(label("saved"), { exact: true })).toBeVisible();
    expect((await storedCase(page, item.id)).status).toBe("acknowledged");
  } finally { releaseList(); releaseWrite(); await page.unrouteAll({ behavior: "wait" }); }
});
