import { operationCases as cases, caseRow as row } from "./support/operations";
import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { queueLogin } from "./support/queue";
import { queueOverflow, queueTargets, switchQueueLocale } from "./support/queue";
import { assertAccessible, settleMotion } from "./support/accessibility";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test.use({ trace: "off" });

// Real password auth, normal FK/UoW and the guarded, owned PostgreSQL fixture.
// Route failures below are explicitly pre-upstream transport presentation seams.

for (const owner of [0, 1]) test(`Operations garage ${owner} traverses server pages and searches the oldest literal match on phone`, async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const { person, items } = await cases(page, baseURL!, 66, owner);
  await queueLogin(page, baseURL!, "en", owner ? 390 : 360, owner);
  const response = await page.request.get(`/api/proxy/cases?status=active&q=${encodeURIComponent(person.tag)}&limit=20`);
  const actual = await response.json(); expect(actual.total).toBe(66);
  await page.goto("/operations");
  await page.getByRole("textbox", { name: "Search cases" }).fill(person.tag);
  await expect(row(page, items[65].code)).toBeVisible();
  const visited = new Set<string>();
  for (let p = 0; p < 4; p++) {
    for (const item of items) if (await row(page, item.code).count()) visited.add(item.id);
    if (p < 3) {
      const loaded = page.waitForResponse(r => r.url().includes("/api/proxy/cases?") && new URL(r.url()).searchParams.get("offset") === String((p + 1) * 20));
      await page.getByRole("button", { name: "Next page", exact: true }).click(); await loaded;
      await expect(row(page, items[Math.max(0, 65 - (p + 1) * 20)].code)).toBeVisible();
    }
  }
  expect(visited.size).toBe(66);
  await page.getByRole("textbox", { name: "Search cases" }).fill(items[0].title);
  await expect(row(page, items[0].code)).toBeVisible();
  await row(page, items[0].code).click();
  await expect(page.getByRole("heading", { name: items[0].title, exact: true })).toBeVisible();
  expect((await page.request.get(`/api/proxy/cases?status=active&q=${encodeURIComponent(items[0].title)}`)).ok()).toBeTruthy();
});

test("acknowledged status uses full detail and every real mechanic remains reachable", async ({ page, baseURL }) => {
  const { person, items } = await cases(page, baseURL!);
  const name = `zzzz ${person.tag} mechanic beyond five`;
  const response = await page.request.post("/api/proxy/staff", { data: { full_name: name, email: `${randomUUID()}@example.com`, password: randomBytes(24).toString("base64url"), role: "mechanic" } });
  expect(response.ok()).toBeTruthy(); const mechanic = await response.json();
  const roster = await (await page.request.get("/api/proxy/cases/mechanics")).json();
  expect(roster.length).toBeGreaterThan(5);
  expect(roster.findIndex((entry: { id: string }) => entry.id === mechanic.id)).toBeGreaterThan(4);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(`/operations?case=${items[1].id}`);
  await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Mechanic", exact: true }).selectOption(mechanic.id);
  await page.getByRole("button", { name: "Assign mechanic", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/proxy/cases/${items[1].id}`)).json()).assigned_user_id).toBe(mechanic.id);
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Set status: En route", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/proxy/cases/${items[1].id}`)).json()).status).toBe("en_route");
  await expect(page.getByRole("heading", { name: "Recorded events", exact: true })).toBeVisible();
  await expect(page.getByText(person.name, { exact: true }).first()).toBeVisible(); expect(errors).toEqual([]);
});

test("failed send retains exact draft and reply/internal drafts stay separate per case", async ({ page, baseURL }) => {
  const { items } = await cases(page, baseURL!);
  await page.goto(`/operations?case=${items[1].id}`);
  const thread = await (await page.request.get(`/api/proxy/cases/${items[1].id}/conversation`)).json();
  const draft = "Exact failed draft <literal> & Русский O‘tkir";
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toBeEnabled(); await composer.fill(draft);
  await page.route(`**/api/proxy/conversations/${thread.id}/messages`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "QA pre-upstream failure" }) }), { times: 1 });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Delivery is uncertain" })).toBeVisible();
  await expect(composer).toHaveValue(draft);
  expect((await (await page.request.get(`/api/proxy/cases/${items[1].id}/conversation`)).json()).messages.length).toBe(thread.messages.length);
  await page.getByRole("button", { name: "Internal note", exact: true }).click();
  await expect(composer).toHaveValue(""); await composer.fill("Separate internal note");
  await page.getByRole("button", { name: "Reply", exact: true }).click(); await expect(composer).toHaveValue(draft);
  await row(page, items[0].code).click(); await expect(composer).toHaveValue("");
  await row(page, items[1].code).click(); await expect(composer).toHaveValue(draft);
  await page.getByRole("button", { name: "Internal note", exact: true }).click(); await expect(composer).toHaveValue("Separate internal note");
});

test("late real detail cannot replace a newer selected case", async ({ page, baseURL }) => {
  const { items } = await cases(page, baseURL!);
  await page.goto("/operations"); await expect(row(page, items[1].code)).toBeVisible();
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/cases/${items[0].id}`, async route => {
    const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seen(); await held;
    await route.fulfill({ response });
  }, { times: 1 });
  try {
    await row(page, items[0].code).click(); await fetched;
    await row(page, items[1].code).click();
    await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toBeVisible();
    // Abort legitimately prevents a browser response event. Await the real
    // routed upstream completion/fulfilment, then let React commit its turn.
    release(); await page.unrouteAll({ behavior: "wait" });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: items[0].title, exact: true })).toHaveCount(0);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

for (const locale of ["uz", "en", "ru"] as Locale[]) for (const width of [360, 1280]) {
  test(`Operations ${locale}/${width} uses fresh viewport, keeps drafts and meets whole-page accessibility`, async ({ page, baseURL }, info) => {
    const { items } = await cases(page, baseURL!);
    await queueLogin(page, baseURL!, locale, width);
    await page.goto(`/operations?case=${items[1].id}`); await settleMotion(page);
    const label = (key: string) => translate(locale, `ops.${key}`);
    await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toBeVisible();
    await queueOverflow(page); await queueTargets(page, page.locator("[data-operations]"));
    await assertAccessible(page, info, `operations-detail-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`operations-detail-${locale}-${width}.png`), fullPage: true });
    if (width < 1280) await page.getByRole("button", { name: label("conversation"), exact: true }).click();
    const composer = page.getByRole("textbox", { name: label("message"), exact: true });
    await expect(composer).toBeEnabled(); await composer.fill("Per-case reply <literal> & O‘tkir Русский");
    if (width < 1280) {
      await page.getByRole("button", { name: label("detail"), exact: true }).click();
      await page.getByRole("button", { name: label("conversation"), exact: true }).click();
      await expect(composer).toHaveValue("Per-case reply <literal> & O‘tkir Русский");
    }
    await queueOverflow(page); await queueTargets(page, page.locator("[data-operations]"));
    await assertAccessible(page, info, `operations-conversation-${locale}-${width}`);
    await page.screenshot({ path: info.outputPath(`operations-conversation-${locale}-${width}.png`), fullPage: true });
    const next: Locale = locale === "ru" ? "uz" : "ru";
    await switchQueueLocale(page, locale, next);
    await expect(page.getByRole("textbox", { name: translate(next, "ops.message"), exact: true })).toHaveValue("Per-case reply <literal> & O‘tkir Русский");
  });
}

test("changing search hides prior counts, selection and thread; search503 is explicit", async ({ page, baseURL }) => {
  const { items } = await cases(page, baseURL!);
  await page.goto(`/operations?case=${items[1].id}`); await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toBeVisible();
  await page.route("**/api/proxy/cases?**", async route => {
    if (new URL(route.request().url()).searchParams.get("q") === items[0].title) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "CASE_SEARCH_UNAVAILABLE" } }) });
    else await route.continue();
  });
  await page.getByRole("textbox", { name: "Search cases", exact: true }).fill(items[0].title);
  await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Search is temporarily unavailable" })).toBeVisible();
  await expect(page.getByText(/matching ·/)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(row(page, items[0].code)).toBeVisible();
  await expect(page.getByRole("heading", { name: items[1].title, exact: true })).toHaveCount(0);
});

test("acknowledged PATCH remains saved when enrichment GET fails", async ({ page, baseURL }) => {
  const { items } = await cases(page, baseURL!); const target = items[1];
  await page.goto(`/operations?case=${target.id}`); await expect(page.getByRole("heading", { name: target.title, exact: true })).toBeVisible();
  let wrote = false;
  await page.route(`**/api/proxy/cases/${target.id}`, async route => {
    if (route.request().method() === "PATCH") { const response = await route.fetch(); expect(response.ok()).toBeTruthy(); wrote = true; await route.fulfill({ response }); }
    else if (wrote) await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Set status: Acknowledged", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Change saved." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Showing the last successful data" })).toBeVisible();
  const full = await (await page.request.get(`/api/proxy/cases/${target.id}`)).json(); expect(full.status).toBe("acknowledged"); expect(Array.isArray(full.timeline)).toBe(true);
  await expect(page.getByRole("alert").filter({ hasText: "Change was rejected" })).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" }); await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set status: Assigned", exact: true })).toBeEnabled();
});

test("committed PATCH with lost response reconciles without replay", async ({ page, baseURL }) => {
  const { items } = await cases(page, baseURL!); const target = items[1];
  await page.goto(`/operations?case=${target.id}`); await expect(page.getByRole("heading", { name: target.title, exact: true })).toBeVisible();
  let writes = 0;
  await page.route(`**/api/proxy/cases/${target.id}`, async route => {
    if (route.request().method() !== "PATCH") { await route.continue(); return; }
    writes++; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); await route.abort("failed");
  });
  await page.getByRole("button", { name: "Set status: Acknowledged", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Save outcome is uncertain" })).toBeVisible();
  const stored = await (await page.request.get(`/api/proxy/cases/${target.id}`)).json(); expect(stored.status).toBe("acknowledged"); expect(writes).toBe(1);
  await expect(page.getByRole("button", { name: "Set status: Assigned", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Refresh current state", exact: true }).click();
  await expect(page.getByRole("button", { name: "Set status: Assigned", exact: true })).toBeEnabled();
  expect(writes).toBe(1); const after = await (await page.request.get(`/api/proxy/cases/${target.id}`)).json(); expect(after.timeline).toEqual(stored.timeline);
});

test("committed message with lost response retains draft and reconciles the shared thread", async ({ page, baseURL }) => {
  const { items } = await cases(page, baseURL!); const target = items[1];
  await page.goto(`/operations?case=${target.id}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true }); await expect(composer).toBeEnabled();
  await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const before = await (await page.request.get(`/api/proxy/cases/${target.id}/conversation`)).json();
  const body = `Committed uncertain ${randomUUID()}`; let writes = 0;
  await page.route(`**/api/proxy/conversations/${before.id}/messages`, async route => { writes++; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); await route.abort("failed"); });
  await composer.fill(body); await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Delivery is uncertain" })).toBeVisible();
  await expect(composer).toHaveValue(body); await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  const stored = await (await page.request.get(`/api/proxy/cases/${target.id}/conversation`)).json(); expect(stored.id).toBe(before.id); expect(stored.messages.filter((m: { body: string }) => m.body === body)).toHaveLength(1);
  await page.getByRole("button", { name: "Refresh conversation", exact: true }).click();
  await expect(page.getByRole("article").getByText(body, { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
  await expect(page.locator(`a[href="/inbox?c=${stored.id}"]`)).toBeVisible(); expect(writes).toBe(1);
});

for (const status of [401, 403]) test(`revoked read ${status} clears all protected data`, async ({ page, baseURL }) => {
  const { items } = await cases(page, baseURL!); const target = items[1];
  await page.goto(`/operations?case=${target.id}`); await expect(page.getByRole("heading", { name: target.title, exact: true })).toBeVisible();
  await page.route("**/api/proxy/cases?**", route => route.fulfill({ status, contentType: "application/json", body: "{}" }));
  await page.getByRole("button", { name: "Refresh cases", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: status === 401 ? "Your session has expired" : "You no longer have access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: target.title, exact: true })).toHaveCount(0); await expect(row(page, target.code)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveCount(0);
});

test("write is blocked until the acknowledged action has a fresh full snapshot", async ({ page, baseURL }) => {
  const { items } = await cases(page, baseURL!); const target = items[1];
  await page.goto(`/operations?case=${target.id}`); await expect(page.getByRole("heading", { name: target.title, exact: true })).toBeVisible();
  let written = false, writes = 0, release!: () => void, seen!: () => void;
  const held = new Promise<void>(r => release = r), fetched = new Promise<void>(r => seen = r);
  await page.route(`**/api/proxy/cases/${target.id}`, async route => {
    if (route.request().method() === "PATCH") { writes++; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); written = true; await route.fulfill({ response }); }
    else if (written) { const response = await route.fetch(); expect(response.ok()).toBeTruthy(); seen(); await held; await route.fulfill({ response }); }
    else await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Set status: Acknowledged", exact: true }).click(); await fetched;
    await expect(page.getByRole("status").filter({ hasText: "Change saved." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Set status: Acknowledged", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Set status: Acknowledged", exact: true }).dispatchEvent("click"); expect(writes).toBe(1);
    release(); await page.unrouteAll({ behavior: "wait" });
    await expect(page.getByRole("button", { name: "Set status: Assigned", exact: true })).toBeEnabled(); expect(writes).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("internal note followed by reply stores distinct modes and a non-internal reply channel", async ({ page, baseURL }) => {
  const { items } = await cases(page, baseURL!); const target = items[1];
  await page.goto(`/operations?case=${target.id}`); await expect(page.getByRole("link", { name: "Open in Inbox", exact: true })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  const note = `Internal ${randomUUID()}`, reply = `Reply ${randomUUID()}`;
  await page.getByRole("button", { name: "Internal note", exact: true }).click(); await composer.fill(note);
  await page.getByRole("button", { name: "Send message", exact: true }).click(); await expect(page.getByRole("article").getByText(note, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).click(); await composer.fill(reply);
  await page.getByRole("button", { name: "Send message", exact: true }).click(); await expect(page.getByRole("article").getByText(reply, { exact: true })).toBeVisible();
  const stored = await (await page.request.get(`/api/proxy/cases/${target.id}/conversation`)).json();
  const savedNote = stored.messages.find((m: { body: string }) => m.body === note), savedReply = stored.messages.find((m: { body: string }) => m.body === reply);
  expect(savedNote).toMatchObject({ kind: "note", is_internal: true, channel: "internal" });
  expect(savedReply).toMatchObject({ kind: "text", is_internal: false, channel: "web" }); expect(stored.last_channel).toBe("web");
});

test("two later list shrinkages each recover the valid final page", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const { items, person } = await cases(page, baseURL!, 66);
  await page.goto("/operations"); await page.getByRole("textbox", { name: "Search cases", exact: true }).fill(person.tag);
  await expect(row(page, items[65].code)).toBeVisible();
  for (let p = 0; p < 3; p++) { await page.getByRole("button", { name: "Next page", exact: true }).click(); await expect(row(page, items[Math.max(0, 65 - (p + 1) * 20)].code)).toBeVisible(); }
  for (const item of items.slice(0, 16)) expect((await page.request.patch(`/api/proxy/cases/${item.id}`, { data: { status: "resolved" } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "Refresh cases", exact: true }).click(); await expect(row(page, items[25].code)).toBeVisible();
  for (const item of items.slice(16, 30)) expect((await page.request.patch(`/api/proxy/cases/${item.id}`, { data: { status: "resolved" } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "Refresh cases", exact: true }).click(); await expect(row(page, items[45].code)).toBeVisible();
  await expect(page.getByText("21–36 of 36", { exact: true })).toBeVisible();
});

test("concurrent first opens of one case resolve to the same persisted Inbox thread", async ({ page, baseURL }) => {
  const { items } = await cases(page, baseURL!); const target = items[1];
  const responses = await Promise.all(Array.from({ length: 8 }, () => page.request.get(`/api/proxy/cases/${target.id}/conversation`)));
  for (const response of responses) expect(response.ok()).toBeTruthy();
  const threads = await Promise.all(responses.map(response => response.json()));
  expect(new Set(threads.map(thread => thread.id)).size).toBe(1);
});
