import { expect, test, request, type Route } from "@playwright/test";
import { translate, type Locale } from "../lib/i18n/dictionaries";
import { makeFormatters } from "../lib/i18n/formatters";
import { assertAccessible, settleMotion } from "./support/accessibility";
import { queueCustomer, queueJob, queueLogin, queueStored, queueTargets, queueOverflow, switchQueueLocale, queueDate } from "./support/queue";

test.use({ trace: "off" });
let caseIndex = 0;
for (const locale of ["en", "ru", "uz"] as Locale[]) for (const width of [360, 1280]) {
  const index = caseIndex++;
  test(`real operational queue ${locale} ${width}`, async ({ page, baseURL }, info) => {
    test.setTimeout(180_000);
    const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params), fmt = makeFormatters(locale);
    const { profile, fixture } = await queueLogin(page, baseURL!, locale, width, index);
    const person = await queueCustomer(page, profile), jobs: string[] = [];
    const other = await request.newContext({ baseURL });
    let release = () => {};
    try {
      for (let day = 1; day <= 18; day++) jobs.push(await queueJob(page, { customer_id: person.customer_id, vehicle_id: person.vehicle_id }, `2037-02-${String(day).padStart(2, "0")}`, day === 18 ? 75 : day === 17 ? 30 : 120));
      expect((await page.request.patch(`/api/proxy/appointments/${jobs[16]}/confirm`, { data: {} })).ok()).toBeTruthy();
      expect((await page.request.patch(`/api/proxy/appointments/${jobs[15]}/cancel`, { data: {} })).ok()).toBeTruthy();
      const otherOwner = fixture.owners[(index + 1) % 2];
      expect((await other.post("/api/auth/login", { data: { email: otherOwner.email, password: otherOwner.password } })).ok()).toBeTruthy();
      expect((await other.get(`/api/proxy/appointments/${jobs[17]}`)).status()).toBe(404);
      const foreignBefore = await (await other.get(`/api/proxy/appointments/${fixture.queues[(index + 1) % 2].legacy_id}`)).json();
      await page.goto("/appointments"); const root = page.getByTestId("appointments-queue"), records = root.getByTestId("queue-records");
      const search = () => root.getByRole("textbox", { name: t("work.search"), exact: true });
      const row = (id: string) => root.getByTestId(`appointment-row-${id}`), count = () => root.locator('[data-testid^="appointment-row-"]');
      await search().fill(person.tag); await expect(count()).toHaveCount(15);
      await expect(root.getByTestId("queue-pagination")).toHaveText(t("queue.page", { page: fmt.number(1), pages: fmt.number(2), total: fmt.number(18) }));
      await expect(row(jobs[17])).toContainText(person.name); await expect(row(jobs[17])).toContainText(profile.vehicle_label);
      await expect(row(jobs[17])).toContainText(person.plate); await expect(row(jobs[17])).toContainText(t("common.general_service"));
      await expect(row(jobs[17]).getByRole("group", { name: t("work.duration"), exact: true })).toContainText(t("queue.hours_minutes", { h: "1", m: "15" }));
      await expect(row(jobs[16]).getByRole("group", { name: t("work.duration"), exact: true })).toContainText(t("appointment.minutes", { n: "30" }));
      await expect(row(jobs[17]).getByRole("group", { name: t("work.health"), exact: true })).toContainText(`0 · ${t("band.poor")}`);
      await expect(row(jobs[17])).toContainText(t("queue.no_billing"));
      expect(await row(jobs[17]).locator("literal").count()).toBe(0);
      await queueTargets(page, root); await queueOverflow(page); await settleMotion(page);
      await page.screenshot({ path: info.outputPath("queue-records.png"), fullPage: true }); await assertAccessible(page, info, "queue-records");
      await row(jobs[17]).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("queue-row-viewport.png") });
      if (width === 1280) {
        await records.evaluate(el => { el.scrollLeft = el.scrollWidth; }); await page.screenshot({ path: info.outputPath("queue-right-columns.png") });
        await records.evaluate(el => { el.scrollLeft = 0; });
      }

      const trigger = row(jobs[17]).getByRole("button", { name: t("work.actions"), exact: true });
      await trigger.focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("menu")).toBeVisible();
      await queueTargets(page, page.getByRole("menu")); await page.keyboard.press("ArrowDown");
      expect(await page.getByRole("menu").evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
      await root.getByRole("checkbox", { name: t("queue.select_all"), exact: true }).check();
      await expect(root.getByTestId("queue-bulk")).toContainText(t("work.bulk_selected", { count: "15" }));
      await root.getByRole("button", { name: t("queue.next"), exact: true }).click();
      await expect(count()).toHaveCount(3); await expect(root.getByTestId("queue-bulk")).toHaveCount(0);
      await row(jobs[0]).getByRole("checkbox").check();
      const alternate: Locale = locale === "en" ? "ru" : "en";
      await switchQueueLocale(page, locale, alternate);
      await expect(root.getByRole("textbox", { name: translate(alternate, "work.search") })).toHaveValue(person.tag);
      await expect(row(jobs[0]).getByRole("checkbox")).toBeChecked(); await expect(count()).toHaveCount(3);
      await expect(root.getByTestId("queue-pagination")).toHaveText(translate(alternate, "queue.page", { page: "2", pages: "2", total: "18" }));
      await switchQueueLocale(page, alternate, locale);
      await root.getByRole("button", { name: t("queue.previous"), exact: true }).click(); await expect(count()).toHaveCount(15);
      await expect(root.getByTestId("queue-bulk")).toHaveCount(0);
      await root.getByRole("checkbox", { name: t("queue.select_all"), exact: true }).check();
      // A competing actual cancellation makes the old visible pending row fail
      // confirm. Completed/cancelled/confirmed rows must not be silently sent.
      expect((await page.request.patch(`/api/proxy/appointments/${jobs[14]}/cancel`, { data: {} })).ok()).toBeTruthy();
      const sent: string[] = [];
      const held = new Promise<void>(resolve => { release = resolve; }); let fetched = () => {};
      const waiting = new Promise<void>(resolve => { fetched = resolve; });
      const pending = async (route: Route) => { sent.push(route.request().url()); const response = await route.fetch(); fetched(); await held; await route.fulfill({ response }); };
      await page.route("**/api/proxy/appointments/*/confirm", pending);
      const bulk = root.getByTestId("queue-bulk"), confirm = bulk.getByRole("button", { name: t("work.confirm"), exact: true });
      await confirm.click(); await waiting; await expect(confirm).toBeDisabled();
      await confirm.press("Enter"); await confirm.press("Enter");
      await expect(root.getByRole("checkbox", { name: t("queue.select_all"), exact: true })).toBeDisabled();
      await expect(root.getByRole("status", { name: t("queue.working") })).toBeVisible();
      release(); await expect(root.getByTestId("queue-bulk")).toHaveCount(0);
      await expect(page.getByText(t("queue.bulk_result", { done: "12", failed: "1", skipped: "2" }), { exact: true })).toBeVisible();
      await page.unroute("**/api/proxy/appointments/*/confirm", pending);
      expect(sent).toHaveLength(13); expect(new Set(sent).size).toBe(13);
      for (const id of jobs.slice(0, 3)) expect((await queueStored(page, id)).status).toBe("pending");
      expect((await queueStored(page, jobs[14])).status).toBe("cancelled"); expect((await queueStored(page, jobs[15])).status).toBe("cancelled");
      expect((await other.get(`/api/proxy/appointments/${fixture.queues[(index + 1) % 2].legacy_id}`)).ok()).toBeTruthy();
      expect((await (await other.get(`/api/proxy/appointments/${fixture.queues[(index + 1) % 2].legacy_id}`)).json()).status).toBe(foreignBefore.status);
      await settleMotion(page); await assertAccessible(page, info, "queue-partial");
      await page.screenshot({ path: info.outputPath("queue-partial.png") });
      await root.getByRole("group", { name: t("work.status"), exact: true }).getByRole("button", { name: t("status.confirmed"), exact: true }).click();
      await expect(count()).toHaveCount(13); await expect(root.getByTestId("queue-bulk")).toHaveCount(0);
      await root.getByRole("group", { name: t("work.status"), exact: true }).getByRole("button", { name: t("work.all"), exact: true }).click();
      await expect(count()).toHaveCount(15);
      await search().fill(profile.legacy_name); await expect(row(profile.legacy_id)).toBeVisible(); await expect(count()).toHaveCount(1);
      await expect(row(profile.legacy_id)).toContainText(t("status.rescheduled"));
      await expect(row(profile.legacy_id)).toContainText(`0 · ${t("band.poor")}`); await expect(row(profile.legacy_id)).toContainText(t("queue.unknown"));
      await queueTargets(page, root); await assertAccessible(page, info, "queue-legacy");
      await page.screenshot({ path: info.outputPath("queue-legacy.png") });

      // Real browser-local inclusive quick filter: today, tomorrow and +6 are
      // included, +7 and yesterday excluded; overdue is pending/confirmed only.
      const dates = [-1, 0, 1, 6, 7]; const dated = [];
      const datedPerson = await queueCustomer(page, profile);
      for (const offset of dates) { const id = await queueJob(page, { customer_id: datedPerson.customer_id, vehicle_id: datedPerson.vehicle_id }, queueDate(offset)); jobs.push(id); dated.push(id); }
      await search().fill(datedPerson.tag); await expect(count()).toHaveCount(5);
      for (const [key, expected] of [["work.today", 1], ["work.tomorrow", 1], ["queue.next_seven", 3], ["work.overdue", 1], ["work.all_dates", 5]] as const) {
        await root.getByRole("group", { name: t("work.when"), exact: true }).getByRole("button", { name: t(key), exact: true }).click();
        await expect(count()).toHaveCount(expected);
        if (key === "queue.next_seven") for (const id of dated.slice(1, 4)) await expect(row(id)).toBeVisible();
      }
      await search().fill(`${person.tag} no match`); await expect(count()).toHaveCount(0); await expect(records).toContainText(t("work.empty"));
      await expect(root.getByRole("region", { name: t("queue.stats_scope"), exact: true })).toContainText(t("queue.stats_date"));
      await queueOverflow(page);
    } finally {
      release(); await page.unrouteAll({ behavior: "wait" });
      for (const id of jobs) await page.request.patch(`/api/proxy/appointments/${id}/cancel`, { data: {} });
      await other.dispose();
    }
  });
}
