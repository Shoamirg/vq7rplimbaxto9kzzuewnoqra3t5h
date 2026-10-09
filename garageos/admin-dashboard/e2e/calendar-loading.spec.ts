import { expect, test, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { translate, type Locale } from "../lib/i18n/dictionaries";
import { makeFormatters } from "../lib/i18n/formatters";
import { assertTargets, settleMotion } from "./support/accessibility";

test.use({ trace: "off" });

// Only latency/failure presentation is intercepted. Every appointment and every
// successful response comes from the guarded, migrated private QA API/database.
for (const locale of ["en", "ru", "uz"] as Locale[]) {
  test(`calendar loading, stale responses and retry ${locale}`, async ({ page, context, baseURL }) => {
    test.setTimeout(90_000);
    let fixture;
    try {
      fixture = JSON.parse(readFileSync(process.env.GARAGEOS_BROWSER_FIXTURE!, "utf8"));
      const origin = new URL(baseURL!);
      if (!fixture.qa_only || fixture.base_origin !== origin.origin || origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error();
    } catch { throw new Error("Prepare the isolated private calendar fixture before this gate"); }
    const owner = fixture.issuer_profiles[0], person = fixture.calendar_profiles[0].contacts;
    const t = (key: string) => translate(locale, key);
    const openDayName = (date: string) => translate(locale, "calendar.open_day", { date: makeFormatters(locale).date(date, { weekday: "short", day: "numeric", month: "short" }) });
    await page.setViewportSize({ width: 360, height: 900 });
    expect((await page.request.post("/api/auth/login", { data: { email: owner.email, password: owner.password } })).ok()).toBeTruthy();
    await context.addCookies([{ name: "garageos_locale", value: locale, url: baseURL! }]);
    const tag = randomUUID().slice(0, 8), jobs: string[] = [];
    let release = () => {};
    try {
      for (const date of ["2036-02-04", "2036-02-05"]) {
        const result = await page.request.post("/api/proxy/appointments/direct", { data: {
          customer_id: person.customer_id, vehicle_id: person.vehicle_id, appointment_date: date,
          appointment_time: "10:00", estimated_duration_minutes: 60, service_type: `QA latency ${tag} ${date}`,
        } });
        expect(result.ok()).toBeTruthy(); jobs.push((await result.json()).id);
      }
      await page.goto("/calendar");
      const main = page.getByRole("main"), dateInput = main.getByRole("textbox", { name: t("calendar.date"), exact: true });
      const held = new Promise<void>(resolve => { release = resolve; });
      let notifyFetched = () => {};
      const fetched = new Promise<void>(resolve => { notifyFetched = resolve; });
      const slow = async (route: Route) => {
        const actual = await route.fetch(); expect(actual.ok()).toBeTruthy(); notifyFetched();
        await held; await route.fulfill({ response: actual });
      };
      await page.route("**/api/proxy/calendar?start=2036-02-04&**", slow);
      await dateInput.fill("2036-02-04"); await fetched;
      await expect(main.getByRole("status")).toHaveText(t("feedback.loading_calendar"));
      await expect(main.getByTestId(`calendar-appointment-${jobs[0]}`)).toHaveCount(0);
      await dateInput.fill("2036-02-05"); await expect(main.getByTestId(`calendar-appointment-${jobs[1]}`)).toBeVisible();
      const stale = page.waitForResponse(response => response.url().includes("calendar?start=2036-02-04&"));
      release(); await stale; await page.unroute("**/api/proxy/calendar?start=2036-02-04&**", slow);
      await expect(dateInput).toHaveValue("2036-02-05"); await expect(main.getByTestId(`calendar-appointment-${jobs[1]}`)).toBeVisible();
      await expect(main.getByTestId(`calendar-appointment-${jobs[0]}`)).toHaveCount(0);
      await expect(main.getByRole("status")).toHaveCount(0);

      const pendingDay = new Promise<void>(resolve => { release = resolve; });
      let notifyDay = () => {};
      const dayFetched = new Promise<void>(resolve => { notifyDay = resolve; });
      const dayPattern = "**/api/proxy/calendar?start=2036-02-04&end=2036-02-05&**";
      const staleDay = async (route: Route) => {
        const actual = await route.fetch(); expect(actual.ok()).toBeTruthy(); notifyDay();
        await pendingDay; await route.fulfill({ response: actual });
      };
      await page.route(dayPattern, staleDay); await dateInput.fill("2036-02-04"); await dayFetched;
      await expect(main.getByRole("status")).toHaveText(t("feedback.loading_calendar"));
      await main.getByRole("button", { name: t("calendar.week"), exact: true }).click();
      await expect(main.locator("[data-calendar-day]")).toHaveCount(7);
      await expect(main.getByTestId(`calendar-appointment-${jobs[1]}`)).toBeVisible();
      const oldDay = page.waitForResponse(response => response.url().includes("calendar?start=2036-02-04&end=2036-02-05&"));
      release(); await oldDay; await page.unroute(dayPattern, staleDay);
      await expect(main.locator("[data-calendar-day]")).toHaveCount(7);
      await expect(main.getByTestId(`calendar-appointment-${jobs[1]}`)).toBeVisible();
      const monthResponse = page.waitForResponse(response => response.url().includes("/api/proxy/calendar?") && !response.url().includes("start=2036-02-04"));
      await main.getByRole("button", { name: t("calendar.month"), exact: true }).click();
      const monthRecords = await (await monthResponse).json();
      expect(monthRecords.appointments.map((record: { id: string }) => record.id)).toEqual(expect.arrayContaining(jobs));
      await main.locator('[data-calendar-day="2036-02-04"]').getByRole("button", { name: openDayName("2036-02-04"), exact: true }).click();
      await expect(main.getByTestId(`calendar-appointment-${jobs[0]}`)).toBeVisible();
      await main.getByRole("button", { name: t("calendar.month"), exact: true }).click();
      await main.locator('[data-calendar-day="2036-02-05"]').getByRole("button", { name: openDayName("2036-02-05"), exact: true }).click();
      await expect(main.getByTestId(`calendar-appointment-${jobs[1]}`)).toBeVisible();
      await dateInput.fill("2036-02-04");
      await expect(main.getByTestId(`calendar-appointment-${jobs[0]}`)).toBeVisible();

      await page.route("**/api/proxy/calendar?start=2036-02-06&**", async route => {
        expect((await route.fetch()).ok()).toBeTruthy();
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Controlled QA transport failure" }) });
      }, { times: 1 });
      await dateInput.fill("2036-02-06"); await expect(main.getByRole("alert")).toContainText(t("common.load_failed"));
      await expect(main.getByTestId(`calendar-appointment-${jobs[1]}`)).toHaveCount(0);
      await main.getByRole("button", { name: t("common.retry"), exact: true }).click();
      await expect(main.getByRole("alert")).toHaveCount(0); await expect(main).toContainText(t("calendar.available_hint"));
      await expect(main.locator('[data-testid^="calendar-appointment-"]')).toHaveCount(0);
      await dateInput.focus(); await page.keyboard.press("n"); await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(dateInput).toHaveValue("2036-02-06");
      await dateInput.fill("2036-02-05"); await expect(main.getByTestId(`calendar-appointment-${jobs[1]}`)).toBeVisible();
      for (const path of [`vehicles/${person.vehicle_id}/health`, `customers/${person.customer_id}`]) {
        expect((await page.request.get(`/api/proxy/${path}`)).ok()).toBeTruthy();
        await page.route(`**/api/proxy/${path}`, async route => {
          await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Controlled QA transport failure" }) });
        }, { times: 1 });
      }
      await main.getByTestId(`calendar-appointment-${jobs[1]}`).click();
      const details = page.getByRole("dialog", { name: t("calendar.details") });
      await expect(details.getByRole("alert").filter({ hasText: t("calendar.health_failed") })).toBeVisible();
      await expect(details.getByRole("alert").filter({ hasText: t("calendar.contact_failed") })).toBeVisible();
      await details.getByRole("alert").filter({ hasText: t("calendar.health_failed") }).getByRole("button", { name: t("common.retry") }).click();
      await expect(details.getByRole("alert")).toHaveCount(0); await expect(details.getByRole("status")).toHaveCount(0);
      await expect(details.getByRole("link", { name: t("calendar.call"), exact: true })).toHaveAttribute("href", `tel:${person.phone}`);
      await expect(details.getByRole("link", { name: t("calendar.telegram"), exact: true })).toHaveAttribute("href", `https://t.me/${person.telegram_username}`);
      await page.route("**/api/proxy/mechanics", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Controlled QA transport failure" }) }), { times: 1 });
      await details.getByRole("button", { name: t("appointment.edit"), exact: true }).click();
      const edit = page.getByRole("dialog", { name: t("appointment.edit") });
      await expect(edit.getByRole("alert")).toContainText(t("common.load_failed"));
      await expect(edit.locator("#edit-mechanic")).toBeDisabled(); await settleMotion(page);
      try {
        await assertTargets(page);
      } catch (error) {
        // Capture the actual failing state before cleanup can change it. This
        // records styles and geometry, never input values or auth material.
        const diagnostics = await edit.evaluate(dialog => ({
          rootSpacing: getComputedStyle(document.documentElement).getPropertyValue("--spacing"),
          dialogSpacing: getComputedStyle(dialog).getPropertyValue("--spacing"),
          stylesheets: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(link => ({
            href: link.href, media: link.media, disabled: link.disabled, loaded: link.sheet !== null,
          })),
          controls: Array.from(dialog.querySelectorAll<HTMLElement>("button,input,select,textarea")).map(control => {
            const style = getComputedStyle(control), box = control.getBoundingClientRect();
            return { tag: control.tagName, id: control.id, classes: control.className,
              width: box.width, height: box.height, minWidth: style.minWidth, minHeight: style.minHeight,
              display: style.display, fontSize: style.fontSize };
          }),
        }));
        const diagnosticPath = test.info().outputPath("calendar-edit-target-styles.json");
        await writeFile(diagnosticPath, JSON.stringify(diagnostics, null, 2), "utf8");
        await test.info().attach("calendar-edit-target-styles", { path: diagnosticPath, contentType: "application/json" });
        await page.screenshot({ path: test.info().outputPath("calendar-edit-target-failure.png"), fullPage: true });
        throw error;
      }
      await edit.getByRole("button", { name: t("common.retry"), exact: true }).click();
      await expect(edit.getByRole("alert")).toHaveCount(0); await expect(edit.locator("#edit-mechanic")).toBeEnabled();
      await page.keyboard.press("Escape"); await expect(details).toBeVisible();
      await page.keyboard.press("Escape"); await expect(details).toHaveCount(0);
      await expect(main.getByTestId(`calendar-appointment-${jobs[1]}`)).toBeFocused();
    } finally {
      release(); await page.unrouteAll({ behavior: "wait" });
      for (const id of jobs) await page.request.patch(`/api/proxy/appointments/${id}/cancel`, { data: {} });
    }
  });
}
