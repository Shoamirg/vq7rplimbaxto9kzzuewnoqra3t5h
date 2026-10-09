import { expect, test, request, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { translate, type Locale } from "../lib/i18n/dictionaries";
import { assertAccessible, settleMotion } from "./support/accessibility";

test.use({ trace: "off" });
type Contact = { customer_id: string; vehicle_id: string; customer_name: string; phone: string | null; telegram_username: string | null };
type Profile = { email: string; password: string; center_id: string };
type CalendarProfile = { center_id: string; contacts: Contact; absent: Contact; rescheduled: Record<string, string> };
function privateProfiles(baseURL: string) {
  try {
    const fixture = JSON.parse(readFileSync(process.env.GARAGEOS_BROWSER_FIXTURE!, "utf8"));
    const origin = new URL(baseURL);
    if (!fixture.qa_only || fixture.base_origin !== origin.origin || origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)
      || fixture.issuer_profiles?.length !== 2 || fixture.calendar_profiles?.length !== 2) throw new Error();
    return { staff: fixture.issuer_profiles as Profile[], calendars: fixture.calendar_profiles as CalendarProfile[] };
  } catch { throw new Error("Prepare the private isolated calendar browser fixture before this gate"); }
}

test("calendar drag waits for a real success notification to clear", async ({ page, baseURL }, info) => {
  const fixture = privateProfiles(baseURL!), owner = fixture.staff[0], person = fixture.calendars[0].contacts;
  await page.setViewportSize({ width: 360, height: 700 });
  expect((await page.request.post("/api/auth/login", { data: { email: owner.email, password: owner.password } })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: "garageos_locale", value: "en", url: baseURL! }]);
  const created = await page.request.post("/api/proxy/appointments/direct", { data: {
    customer_id: person.customer_id, vehicle_id: person.vehicle_id, appointment_date: "2034-07-05",
    appointment_time: "09:00", estimated_duration_minutes: 60,
  } });
  expect(created.ok()).toBeTruthy(); const id = (await created.json()).id;
  try {
    await page.goto("/calendar"); const main = page.getByRole("main");
    await expect.poll(async () => {
      // A pre-hydration fill can leave the DOM value ahead of React state.
      // Clear and reenter through the real input until the rendered date changes.
      await main.getByRole("textbox", { name: "Calendar date", exact: true }).fill("");
      await main.getByRole("textbox", { name: "Calendar date", exact: true }).fill("2034-07-05");
      return main.locator("[data-calendar-period]").innerText();
    }).toContain("2034");
    const card = main.getByTestId(`calendar-appointment-${id}`);
    await card.click();
    await page.getByRole("dialog", { name: "Appointment details" }).getByRole("button", { name: "Edit appointment", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit appointment" });
    await edit.locator("#edit-time").fill("10:00");
    const saved = page.waitForResponse(r => r.url().endsWith(`/api/proxy/appointments/${id}`) && r.request().method() === "PATCH");
    await edit.getByRole("button", { name: "Save changes", exact: true }).click();
    expect((await saved).ok()).toBeTruthy(); await expect(edit).toHaveCount(0);
    const moved = page.waitForResponse(r => r.url().endsWith(`/api/proxy/appointments/${id}`) && r.request().method() === "PATCH");
    const initialHit = await dragTo(page, card, 192);
    expect(initialHit, "The drag helper itself must encounter a genuine notification").toMatchObject({ reachesCard: false, hitAlert: true });
    const response = await moved; expect(response.ok()).toBeTruthy();
    expect(response.request().postDataJSON().appointment_time).toBe("11:00");
    const stored = await (await page.request.get(`/api/proxy/appointments/${id}`)).json();
    expect(stored.appointment_time).toBe("11:00"); expect(stored.mechanic_user_id).toBeNull();
    await page.screenshot({ path: info.outputPath("calendar-real-toast-dragged.png") });
  } finally {
    await page.request.patch(`/api/proxy/appointments/${id}/cancel`, { data: {} });
  }
});

test("cross-account collision next-day choice keeps the chosen mechanic", async ({ page, baseURL }, info) => {
  test.setTimeout(90_000);
  const fixture = privateProfiles(baseURL!), owner = fixture.staff[0], person = fixture.calendars[0].contacts;
  const name = `QA32 collision ${randomUUID().slice(0, 8)}`;
  const credentials = [0, 1].map(i => ({ email: `calendar32-collision-${randomUUID()}-${i}@example.com`, password: `CalendarQA-${randomUUID()}` }));
  const users: string[] = [], jobs: string[] = [];
  const native = await Promise.all(credentials.map(() => request.newContext({ baseURL })));
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.request.post("/api/auth/login", { data: { email: owner.email, password: owner.password } })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: "garageos_locale", value: "en", url: baseURL! }]);
  try {
    for (let index = 0; index < 2; index++) {
      const created = await page.request.post("/api/proxy/staff", { data: { ...credentials[index], full_name: name, role: "mechanic" } });
      expect(created.ok()).toBeTruthy(); users.push((await created.json()).id);
      const login = await native[index].post("/api/auth/login", { data: credentials[index] });
      expect(login.status(), "New active mechanic can log in immediately after creation").toBe(200);
    }
    for (let index = 0; index < 2; index++) {
      const created = await page.request.post("/api/proxy/appointments/direct", { data: {
        customer_id: person.customer_id, vehicle_id: person.vehicle_id, appointment_date: "2034-06-05",
        appointment_time: index === 0 ? "09:00" : "11:00", estimated_duration_minutes: 60, mechanic_user_id: users[index],
      } });
      expect(created.ok()).toBeTruthy(); jobs.push((await created.json()).id);
    }
    await page.goto("/calendar"); const main = page.getByRole("main");
    await main.getByRole("textbox", { name: "Calendar date", exact: true }).fill("2034-06-05");
    const source = main.getByTestId(`calendar-appointment-${jobs[0]}`), destination = main.locator(`[data-calendar-lane-grid="account:${users[1]}"]`);
    await expect(source).toBeVisible(); await dragTo(page, source, 384, destination);
    const collision = page.getByRole("dialog", { name: "Mechanic unavailable" });
    await expect(collision).toBeVisible(); await collision.getByRole("button", { name: "Keep original", exact: true }).click();
    const retained = await (await page.request.get(`/api/proxy/appointments/${jobs[0]}`)).json();
    expect(retained.mechanic_user_id).toBe(users[0]); expect(retained.appointment_time).toBe("09:00");
    await dragTo(page, source, 384, destination); await expect(collision).toBeVisible();
    const response = page.waitForResponse(r => r.url().endsWith(`/api/proxy/appointments/${jobs[0]}`) && r.request().method() === "PATCH");
    await collision.getByRole("button", { name: "Next day at 09:00", exact: true }).click();
    const moved = await response; expect(moved.ok()).toBeTruthy(); expect(moved.request().postDataJSON().mechanic_user_id).toBe(users[1]);
    const persisted = await (await page.request.get(`/api/proxy/appointments/${jobs[0]}`)).json();
    expect(persisted.mechanic_user_id).toBe(users[1]); expect(persisted.appointment_date.slice(0, 10)).toBe("2034-06-06");
    expect(persisted.appointment_time).toBe("09:00");
    expect((await native[0].get(`/api/proxy/mechanic/work/${jobs[0]}`)).status()).toBe(404);
    expect((await native[1].get(`/api/proxy/mechanic/work/${jobs[0]}`)).ok()).toBeTruthy();
    await expect(source).toHaveCount(0); await main.getByRole("textbox", { name: "Calendar date", exact: true }).fill("2034-06-06");
    await expect(source).toBeVisible(); await settleMotion(page); await page.screenshot({ path: info.outputPath("calendar-cross-account-next-day.png") });
  } finally {
    for (const id of jobs) await page.request.patch(`/api/proxy/appointments/${id}/cancel`, { data: {} });
    for (const id of users) await page.request.patch(`/api/proxy/staff/${id}`, { data: { is_active: false } });
    for (const client of native) await client.dispose();
  }
});
const nextDay = (date: string, count = 1) => new Date(new Date(date + "T00:00:00Z").getTime() + count * 86400000).toISOString().slice(0, 10);
function weekBounds(date: string) { const start = nextDay(date, -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7)); return [start, nextDay(start, 7)]; }
function monthBounds(date: string) {
  const first = date.slice(0, 7) + "-01";
  const following = new Date(first + "T00:00:00Z"); following.setUTCMonth(following.getUTCMonth() + 1);
  return [weekBounds(first)[0], weekBounds(nextDay(following.toISOString().slice(0, 10), -1))[1]];
}
async function targets(root: Locator) {
  await settleMotion(root.page());
  const small = await root.evaluate(element => Array.from(element.querySelectorAll<HTMLElement>("button,a,input,select,textarea")).filter(control => {
    const style = getComputedStyle(control), box = control.getBoundingClientRect();
    return !control.matches(":disabled") && !control.closest('[aria-hidden="true"],[inert]') && style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
  }).map(control => {
    // A labelled checkbox's complete label is its pointer target.
    const target = control instanceof HTMLInputElement && control.type === "checkbox" ? control.labels?.[0] || control : control;
    const box = target.getBoundingClientRect(); return { name: control.getAttribute("aria-label") || control.id || control.innerText.slice(0, 40), width: box.width, height: box.height };
  }).filter(box => box.width < 44 || box.height < 44));
  expect(small).toEqual([]);
}
async function trapped(page: Page, dialog: Locator) {
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press(index % 3 === 0 ? "Shift+Tab" : "Tab");
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
}
async function dragTo(page: Page, card: Locator, deltaY: number, lane?: Locator) {
  await centerBoardTarget(card);
  const pointerHit = () => card.evaluate(el => {
    const box = el.getBoundingClientRect(), x = box.left + 30, y = box.top + 30;
    const hit = document.elementFromPoint(x, y);
    return { reachesCard: el.contains(hit), hitAlert: !!hit?.closest('[role="alert"]') };
  });
  const initial = await pointerHit();
  // A recent successful edit can temporarily place a toast over this exact
  // point. Await real pointer readiness; a permanently covered card still fails.
  await expect.poll(async () => (await pointerHit()).reachesCard,
    { message: "The real pointer must reach the calendar drag source" }).toBe(true);
  const source = (await card.boundingBox())!;
  const targetX = lane ? (await lane.boundingBox())!.x + 80 : source.x + 30;
  expect(await card.evaluate(el => el.contains(document.elementFromPoint(el.getBoundingClientRect().left + 30, el.getBoundingClientRect().top + 30)))).toBe(true);
  await page.mouse.move(source.x + 30, source.y + 30); await page.mouse.down();
  await page.mouse.move(source.x + 30, source.y + 35);
  // Scroll the actual board during the pointer session so long moves keep the
  // pointer on screen. A sticky lane header must not cover the grabbed control.
  const scrolled = await card.evaluate((el, distance) => {
    const board = el.closest<HTMLElement>("[data-calendar-board]")!;
    const before = board.scrollTop; board.scrollTop += distance; return board.scrollTop - before;
  }, deltaY);
  await page.mouse.move(targetX, source.y + 30 + deltaY - scrolled, { steps: 10 }); await page.mouse.up();
  return initial;
}
async function centerBoardTarget(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.evaluate(el => {
    const board = el.closest<HTMLElement>("[data-calendar-board]")!;
    const header = board.querySelector<HTMLElement>(".sticky")!;
    const area = board.getBoundingClientRect(), target = el.getBoundingClientRect();
    const top = Math.max(area.top, header.getBoundingClientRect().bottom);
    board.scrollTop += target.top + target.height / 2 - (top + Math.min(area.bottom, innerHeight)) / 2;
  });
}

let caseIndex = 0;
for (const locale of ["en", "ru", "uz"] as Locale[]) for (const width of [360, 1280]) {
  const index = caseIndex++;
  test(`real calendar workflow ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
    test.setTimeout(180_000);
    const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
    const fixture = privateProfiles(baseURL!); const staff = fixture.staff[index % 2], profile = fixture.calendars[index % 2];
    const date = `2034-05-${String(3 + index * 2).padStart(2, "0")}`;
    const name = `QA32 usta <saqlangan> & Шерзод ${randomUUID().slice(0, 8)}`;
    const credentials = [0, 1].map(i => ({ email: `calendar32-${randomUUID()}-${i}@example.com`, password: `CalendarQA-${randomUUID()}` }));
    const users: string[] = [], jobs: string[] = [];
    const native = await Promise.all(credentials.map(() => request.newContext({ baseURL })));
    await page.setViewportSize({ width, height: 900 });
    expect((await page.request.post("/api/auth/login", { data: { email: staff.email, password: staff.password } })).ok()).toBeTruthy();
    await context.addCookies([{ name: "garageos_locale", value: locale, url: baseURL! }]);
    const create = async (time: string, user: string | null, person = profile.contacts, duration = 60, legacy = false) => {
      const response = await page.request.post("/api/proxy/appointments/direct", { data: {
        customer_id: person.customer_id, vehicle_id: person.vehicle_id, appointment_date: date, appointment_time: time,
        estimated_duration_minutes: duration, ...(legacy ? { mechanic_name: name } : user ? { mechanic_user_id: user } : {}),
      } });
      expect(response.ok()).toBeTruthy(); const id = (await response.json()).id; jobs.push(id); return id;
    };
    const stored = async (id: string) => (await (await page.request.get(`/api/proxy/appointments/${id}`)).json());
    const main = page.getByRole("main");
    const card = (id: string) => main.getByTestId(`calendar-appointment-${id}`);
    const fillDate = async (day: string) => { await main.getByRole("textbox", { name: t("calendar.date"), exact: true }).fill(day); };
    const details = () => page.getByRole("dialog", { name: t("calendar.details") });
    const inspect = async (id: string) => { await card(id).click(); await expect(details()).toBeVisible(); };
    const close = async (id?: string) => { await page.keyboard.press("Escape"); await expect(details()).toHaveCount(0); if (id) await expect(card(id)).toBeFocused(); };
    const patchPromise = (id: string) => page.waitForResponse(r => r.url().endsWith(`/api/proxy/appointments/${id}`) && r.request().method() === "PATCH");
    const selectAssignment = async (id: string, assignment: string) => {
      await inspect(id); await details().getByRole("button", { name: t("appointment.edit"), exact: true }).click();
      const edit = page.getByRole("dialog", { name: t("appointment.edit") }); await expect(edit).toBeVisible();
      await expect(edit.locator("#edit-mechanic")).toBeEnabled(); await edit.locator("#edit-mechanic").selectOption(assignment);
      const response = patchPromise(id); await edit.getByRole("button", { name: t("invoice.save"), exact: true }).click();
      expect((await response).ok()).toBeTruthy(); await expect(edit).toHaveCount(0); await expect(card(id)).toBeVisible();
    };
    try {
      for (const identity of credentials) {
        const result = await page.request.post("/api/proxy/staff", { data: { ...identity, full_name: name, role: "mechanic" } });
        expect(result.ok()).toBeTruthy(); users.push((await result.json()).id);
      }
      for (let i = 0; i < 2; i++) expect((await native[i].post("/api/auth/login", { data: credentials[i] })).ok()).toBeTruthy();
      const moving = await create("09:00", users[0]); const confirmed = await create("12:00", users[0]);
      expect((await page.request.patch(`/api/proxy/appointments/${confirmed}/confirm`, { data: {} })).ok()).toBeTruthy();
      const working = await create("13:00", users[0]);
      for (const action of ["confirm", "start"]) expect((await page.request.patch(`/api/proxy/appointments/${working}/${action}`, { data: {} })).ok()).toBeTruthy();
      const completed = await create("14:00", users[0]);
      for (const action of ["confirm", "start", "complete"]) expect((await page.request.patch(`/api/proxy/appointments/${completed}/${action}`, { data: action === "complete" ? { service_type: "QA xizmat <ish> & Работа" } : {} })).ok()).toBeTruthy();
      const cancelled = await create("16:00", users[0]); expect((await page.request.patch(`/api/proxy/appointments/${cancelled}/cancel`, { data: {} })).ok()).toBeTruthy();
      const early = await create("06:00", users[1], profile.absent);
      const legacy = await create("15:00", null, profile.contacts, 60, true);
      for (let count = 0; count < 4; count++) await create("18:00", null, profile.absent);
      await page.goto("/calendar"); await fillDate(date); await expect(card(moving)).toBeVisible();
      const headers = main.locator("[data-calendar-lane]").filter({ hasText: name });
      await expect(headers).toHaveCount(3); // Two UUID accounts and one explicit name-only legacy lane.
      const accountHeaders = main.locator('[data-calendar-lane^="account:"]').filter({ hasText: name });
      await expect(accountHeaders).toHaveCount(2); await expect(accountHeaders.nth(0)).toContainText("· 1"); await expect(accountHeaders.nth(1)).toContainText("· 2");
      await expect(main.locator("saqlangan")).toHaveCount(0); await targets(main);
      await settleMotion(page); await page.screenshot({ path: info.outputPath("calendar-day.png") });
      const week = weekBounds(date); const weekResponse = page.waitForResponse(r => r.url().includes(`/api/proxy/calendar?start=${week[0]}&end=${week[1]}`));
      await main.getByRole("button", { name: t("calendar.week"), exact: true }).click(); expect((await weekResponse).ok()).toBeTruthy(); await expect(card(moving)).toBeVisible();
      await expect(main.locator("[data-calendar-day]")).toHaveCount(7); await page.screenshot({ path: info.outputPath("calendar-week.png") });
      await main.getByRole("button", { name: t("calendar.next"), exact: true }).click(); await expect(card(moving)).toHaveCount(0);
      await main.getByRole("button", { name: t("calendar.previous"), exact: true }).click(); await expect(card(moving)).toBeVisible();
      const month = monthBounds(date); const monthResponse = page.waitForResponse(r => r.url().includes(`/api/proxy/calendar?start=${month[0]}&end=${month[1]}`));
      await main.getByRole("button", { name: t("calendar.month"), exact: true }).click(); expect((await monthResponse).ok()).toBeTruthy();
      await expect(main.locator("[data-calendar-day]")).toHaveCount((new Date(month[1]).getTime() - new Date(month[0]).getTime()) / 86400000);
      const day = main.locator(`[data-calendar-day="${date}"]`); await day.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("calendar-month.png") });
      const dayRecords = await (await page.request.get(`/api/proxy/calendar?start=${date}&end=${nextDay(date)}`)).json();
      expect(dayRecords.appointments.map((record: { id: string }) => record.id)).toEqual(expect.arrayContaining(jobs.filter(id => id !== cancelled)));
      await day.getByRole("button", { name: t("calendar.more", { n: dayRecords.appointments.length }), exact: true }).click();
      await expect(main.getByRole("button", { name: t("calendar.day"), exact: true })).toHaveAttribute("aria-pressed", "true"); await expect(card(early)).toBeVisible();
      for (const id of [moving, confirmed, working, completed, profile.rescheduled[date]]) {
        await inspect(id); await expect(details()).toContainText(t(`status.${(await stored(id)).status}`));
        await expect(details().getByRole("link", { name: t("calendar.customer_profile") })).toHaveAttribute("href", `/customers/${(await stored(id)).customer_id}`);
        if ([completed, profile.rescheduled[date]].includes(id)) await expect(details().getByRole("button", { name: t("appointment.edit") })).toHaveCount(0);
        if (id === moving) {
          await expect(details().getByRole("link", { name: t("calendar.call"), exact: true })).toHaveAttribute("href", `tel:${profile.contacts.phone}`);
          await expect(details().getByRole("link", { name: "Telegram", exact: true })).toHaveAttribute("href", `https://t.me/${profile.contacts.telegram_username}`);
          await targets(details()); await trapped(page, details()); await page.screenshot({ path: info.outputPath("calendar-inspector.png") });
        }
        if (id === working) {
          await details().getByRole("button", { name: t("work.complete"), exact: true }).click();
          const complete = page.getByRole("dialog", { name: t("work.complete") }); await expect(complete).toBeVisible();
          await targets(complete); await trapped(page, complete); await page.keyboard.press("Escape"); await expect(details()).toBeVisible();
          expect((await stored(working)).status).toBe("in_progress");
        }
        await close(id);
      }
      await inspect(early); await expect(details()).toContainText(t("calendar.no_phone")); await expect(details()).toContainText(t("calendar.no_telegram"));
      await expect(details().getByRole("link", { name: t("calendar.call"), exact: true })).toHaveCount(0);
      await details().getByRole("button", { name: t("appointment.edit"), exact: true }).click();
      const edit = page.getByRole("dialog", { name: t("appointment.edit") }); await edit.locator("#edit-time").fill("07:00");
      const earlyPatch = patchPromise(early); await edit.getByRole("button", { name: t("invoice.save"), exact: true }).click(); expect((await earlyPatch).ok()).toBeTruthy();
      expect((await stored(early)).mechanic_user_id).toBe(users[1]); await expect(card(early)).toHaveCount(1);
      await main.getByRole("checkbox", { name: t("calendar.show_cancelled") }).check(); await inspect(cancelled);
      await expect(details().getByRole("button", { name: t("appointment.edit") })).toHaveCount(0); await close(cancelled);
      const withCancelled = await (await page.request.get(`/api/proxy/calendar?start=${date}&end=${nextDay(date)}&include_cancelled=true`)).json();
      expect(withCancelled.appointments.map((record: { id: string }) => record.id)).toContain(cancelled);
      for (const mode of ["week", "month"]) {
        await main.getByRole("button", { name: t(`calendar.${mode}`), exact: true }).click();
        if (mode === "month") await main.locator(`[data-calendar-day="${date}"]`).getByRole("button", { name: t("calendar.more", { n: withCancelled.appointments.length }), exact: true }).click();
        await inspect(cancelled); await expect(details().getByRole("button", { name: t("appointment.edit") })).toHaveCount(0); await close();
      }
      await main.getByRole("button", { name: t("calendar.day"), exact: true }).click(); await expect(card(moving)).toBeVisible();
      // Real pointer move and resize retain the account in every locale/viewport.
      const move = patchPromise(moving); await test.step("Pointer time move", () => dragTo(page, card(moving), 192)); const moved = await move; expect(moved.ok()).toBeTruthy();
      expect(moved.request().postDataJSON()).not.toHaveProperty("mechanic_name"); expect(moved.request().postDataJSON()).not.toHaveProperty("mechanic_user_id");
      expect((await stored(moving)).appointment_time).toBe("10:00"); expect((await stored(moving)).mechanic_user_id).toBe(users[0]); await expect(card(moving)).toBeVisible();
      const handle = main.locator(`[data-calendar-resize="${moving}"]`); await centerBoardTarget(handle); const handleBox = (await handle.boundingBox())!;
      const handleHit = await handle.evaluate(el => {
        const box = el.getBoundingClientRect(), hit = document.elementFromPoint(box.left + 20, box.top + 20);
        return { reachesHandle: el.contains(hit), x: box.left + 20, y: box.top + 20, viewport: innerHeight, hit: hit?.tagName, hitLabel: hit?.getAttribute("aria-label") };
      });
      expect(handleHit, "The real pointer must reach the resize handle").toMatchObject({ reachesHandle: true });
      const resized = patchPromise(moving); await page.mouse.move(handleBox.x + 20, handleBox.y + 20); await page.mouse.down(); await page.mouse.move(handleBox.x + 20, handleBox.y + 116, { steps: 8 }); await page.mouse.up();
      expect((await resized).ok()).toBeTruthy(); expect((await stored(moving)).estimated_duration_minutes).toBe(90); expect((await stored(moving)).mechanic_user_id).toBe(users[0]);
      if (width === 1280) { const reassigned = patchPromise(moving); await dragTo(page, card(moving), 0, main.locator(`[data-calendar-lane-grid="account:${users[1]}"]`)); expect((await reassigned).ok()).toBeTruthy(); }
      else await selectAssignment(moving, users[1]);
      expect((await stored(moving)).mechanic_user_id).toBe(users[1]);
      expect((await native[0].get(`/api/proxy/mechanic/work/${moving}`)).status()).toBe(404); expect((await native[1].get(`/api/proxy/mechanic/work/${moving}`)).ok()).toBeTruthy();
      await selectAssignment(moving, ""); expect((await stored(moving)).mechanic_user_id).toBeNull(); expect((await stored(moving)).mechanic_name).toBeNull();
      expect((await native[1].get(`/api/proxy/mechanic/work/${moving}`)).status()).toBe(404);
      await selectAssignment(moving, users[0]);
      // The legacy name conservatively occupies both same-name account schedules.
      await dragTo(page, card(moving), 960);
      const collision = page.getByRole("dialog", { name: t("calendar.collision") }); await expect(collision).toBeVisible(); await targets(collision); await trapped(page, collision);
      await collision.getByRole("button", { name: t("calendar.keep"), exact: true }).click(); expect((await stored(moving)).appointment_time).toBe("10:00");
      await dragTo(page, card(moving), 960); await expect(collision).toBeVisible();
      const tomorrow = patchPromise(moving); await collision.getByRole("button", { name: t("calendar.tomorrow"), exact: true }).click(); const tomorrowResponse = await tomorrow; expect(tomorrowResponse.ok()).toBeTruthy();
      expect(tomorrowResponse.request().postDataJSON().appointment_date.slice(0, 10)).toBe(nextDay(date));
      expect((await tomorrowResponse.json()).appointment_date.slice(0, 10)).toBe(nextDay(date));
      expect(tomorrowResponse.request().postDataJSON()).not.toHaveProperty("mechanic_user_id"); expect((await stored(moving)).appointment_date.slice(0, 10)).toBe(nextDay(date)); expect((await stored(moving)).mechanic_user_id).toBe(users[0]);
      await expect(card(moving)).toHaveCount(0); await fillDate(nextDay(date)); await expect(card(moving)).toBeVisible();
      await main.getByRole("button", { name: t("calendar.week"), exact: true }).click(); await expect(card(moving)).toBeVisible();
      await inspect(moving); const alternate: Locale = locale === "en" ? "ru" : "en";
      // Change locale through the real picker inside the trapped inspector;
      // the selected record, current date and period must survive the change.
      await page.keyboard.press("ArrowRight"); await page.keyboard.press("n"); await expect(details()).toBeVisible();
      await details().getByRole("button", { name: t("menu.language"), exact: true }).click();
      await page.getByRole("menuitem", { name: alternate === "ru" ? /Русский/ : /English/ }).click();
      const translatedDetails = page.getByRole("dialog", { name: translate(alternate, "calendar.details") });
      await expect(translatedDetails).toBeVisible(); await expect(translatedDetails).toContainText(profile.contacts.customer_name);
      await expect(translatedDetails.getByRole("link", { name: translate(alternate, "calendar.customer_profile") })).toHaveAttribute("href", `/customers/${profile.contacts.customer_id}`);
      await translatedDetails.getByRole("button", { name: translate(alternate, "menu.language"), exact: true }).click();
      await page.getByRole("menuitem", { name: locale === "uz" ? /Oʻzbek/ : locale === "ru" ? /Русский/ : /English/ }).click();
      await expect(details()).toBeVisible(); await close();
      await page.getByRole("button", { name: t("menu.language"), exact: true }).click(); await page.getByRole("menuitem", { name: alternate === "ru" ? /Русский/ : /English/ }).click();
      await expect(main.getByRole("button", { name: translate(alternate, "calendar.week"), exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(main.getByRole("textbox", { name: translate(alternate, "calendar.date"), exact: true })).toHaveValue(nextDay(date));
      await page.getByRole("button", { name: translate(alternate, "menu.language"), exact: true }).click(); await page.getByRole("menuitem", { name: locale === "uz" ? /Oʻzbek/ : locale === "ru" ? /Русский/ : /English/ }).click();
      await main.getByRole("button", { name: t("calendar.today"), exact: true }).click(); await expect(main.getByRole("textbox", { name: t("calendar.date") })).toHaveValue(new Date().toISOString().slice(0, 10));
      await fillDate(nextDay(date)); await expect(card(moving)).toBeVisible();
      const book = main.getByRole("button", { name: t("calendar.book"), exact: true }).first(); await book.focus(); await page.keyboard.press("n");
      const booking = page.getByRole("dialog", { name: t("appointment.new") }); await expect(booking).toBeVisible();
      await expect(booking.locator("#appt-date")).toHaveValue(nextDay(date)); await trapped(page, booking);
      await booking.locator("#appt-customer").fill(profile.contacts.customer_name);
      await booking.getByRole("button", { name: new RegExp(profile.contacts.customer_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
      await expect(booking.locator("#appt-vehicle")).not.toHaveValue(""); await booking.locator("#appt-time").fill("11:00");
      await expect(booking.locator("#appt-mechanic")).toBeEnabled(); await booking.locator("#appt-mechanic").selectOption(users[1]);
      await expect(booking.locator("#appt-duration option[value='60']")).toHaveText(t("appointment.minutes", { n: 60 }));
      await targets(booking); await page.screenshot({ path: info.outputPath("calendar-booking.png") });
      const created = page.waitForResponse(r => r.url().includes("/api/proxy/appointments/direct") && r.request().method() === "POST");
      await booking.getByRole("button", { name: t("appointment.book"), exact: true }).click(); const booked = await created; expect(booked.ok()).toBeTruthy();
      const bookedId = (await booked.json()).id; jobs.push(bookedId); await expect(booking).toHaveCount(0); await expect(card(bookedId)).toBeVisible();
      await expect(main.getByRole("button", { name: t("calendar.week"), exact: true })).toHaveAttribute("aria-pressed", "true");
      expect((await native[1].get(`/api/proxy/mechanic/work/${bookedId}`)).ok()).toBeTruthy();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await expect(main).not.toContainText(/calendar\.[a-z_]+/);
      const notifications = page.getByRole("region", { name: t("menu.notifications"), exact: true });
      await expect(notifications).toContainText(t("appointment.booked")); await targets(notifications);
      await settleMotion(page); await assertAccessible(page, info, "calendar-week");
      expect((await page.request.patch(`/api/proxy/staff/${users[0]}`, { data: { is_active: false } })).ok()).toBeTruthy();
      await main.getByRole("button", { name: t("calendar.day"), exact: true }).click(); await expect(card(moving)).toBeVisible();
      await expect(main.locator(`[data-calendar-lane="legacy:${users[0]}"]`)).toContainText(name);
      expect((await native[0].get(`/api/proxy/mechanic/work/${moving}`)).status()).toBe(401);
      // Persisted foreign IDs are rejected by this owner's calendar/business reads.
      const foreign = fixture.calendars[(index + 1) % 2]; expect((await page.request.get(`/api/proxy/customers/${foreign.contacts.customer_id}`)).status()).toBe(404);
      expect((await stored(legacy)).mechanic_user_id).toBeNull();
    } finally {
      for (const id of jobs) await page.request.patch(`/api/proxy/appointments/${id}/cancel`, { data: {} });
      for (const id of users) await page.request.patch(`/api/proxy/staff/${id}`, { data: { is_active: false } });
      for (const client of native) await client.dispose();
    }
  });
}
