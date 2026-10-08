import { expect, test, type Route } from "@playwright/test";
import { translate, type Locale } from "../lib/i18n/dictionaries";
import { makeFormatters } from "../lib/i18n/formatters";
import { assertAccessible, settleMotion } from "./support/accessibility";
import { queueCustomer, queueJob, queueLogin, queueOverflow, queueTargets } from "./support/queue";

test.use({ trace: "off" });
for (const locale of ["en", "ru", "uz"] as Locale[]) {
  test(`queue stale list and summary errors ${locale}`, async ({ page, baseURL }, info) => {
    test.setTimeout(100_000);
    const t = (key: string) => translate(locale, key), fmt = makeFormatters(locale);
    const { profile } = await queueLogin(page, baseURL!, locale, 360);
    const people = [await queueCustomer(page, profile), await queueCustomer(page, profile)], jobs: string[] = [];
    let releaseList = () => {}, releaseStats = () => {};
    try {
      for (const person of people) jobs.push(await queueJob(page, { customer_id: person.customer_id, vehicle_id: person.vehicle_id }, "2039-05-03"));
      const statsHeld = new Promise<void>(resolve => { releaseStats = resolve; }); let statsFetched = () => {};
      const statsWaiting = new Promise<void>(resolve => { statsFetched = resolve; });
      let holdStats = true;
      const oldStats = async (route: Route) => {
        if (!holdStats) { await route.continue(); return; }
        holdStats = false; const actual = await route.fetch(); expect(actual.ok()).toBeTruthy(); statsFetched(); await statsHeld; await route.fulfill({ response: actual });
      };
      await page.route("**/api/proxy/appointments/stats", oldStats);
      await page.goto("/appointments"); const root = page.getByTestId("appointments-queue"), records = root.getByTestId("queue-records");
      const stats = root.getByRole("region", { name: t("queue.stats_scope"), exact: true });
      const search = root.getByRole("textbox", { name: t("work.search"), exact: true });
      const row = (id: string) => root.getByTestId(`appointment-row-${id}`);
      await statsWaiting; await expect(stats.getByRole("status")).toHaveText(t("queue.stats_loading"));
      await search.fill(people[0].tag); await expect(row(jobs[0])).toBeVisible();
      await row(jobs[0]).getByRole("checkbox").check(); await expect(root.getByTestId("queue-bulk")).toBeVisible();
      const listHeld = new Promise<void>(resolve => { releaseList = resolve; }); let listFetched = () => {};
      const listWaiting = new Promise<void>(resolve => { listFetched = resolve; });
      const oldList = async (route: Route) => { const actual = await route.fetch(); expect(actual.ok()).toBeTruthy(); listFetched(); await listHeld; await route.fulfill({ response: actual }); };
      const pattern = `**/api/proxy/appointments?*q=${people[0].tag}*`;
      await page.route(pattern, oldList);
      await root.getByRole("button", { name: t("queue.refresh"), exact: true }).click(); await listWaiting;
      await expect(records.getByRole("status")).toHaveText(t("queue.loading"));
      await expect(root.getByTestId("queue-bulk")).toHaveCount(0); await expect(row(jobs[0])).toHaveCount(0);
      // The second actual summary read replaces the held original snapshot.
      await expect(stats.getByRole("status")).toHaveCount(0);
      await search.fill(people[1].tag); await expect(row(jobs[1])).toBeVisible();
      const staleList = page.waitForResponse(r => new URL(r.url()).searchParams.get("q") === people[0].tag);
      releaseList(); await staleList; await page.unroute(pattern, oldList); await expect(row(jobs[0])).toHaveCount(0); await expect(row(jobs[1])).toBeVisible();
      expect((await page.request.patch(`/api/proxy/appointments/${jobs[0]}/confirm`, { data: {} })).ok()).toBeTruthy();
      const refreshed = page.waitForResponse(r => r.url().endsWith("/api/proxy/appointments/stats"));
      await root.getByRole("button", { name: t("queue.refresh"), exact: true }).click();
      const currentStats = await (await refreshed).json();
      const pending = stats.getByText(t("work.waiting"), { exact: true }).locator("..");
      await expect(pending).toContainText(fmt.number(currentStats.pending_count));
      const staleStats = page.waitForResponse(r => r.url().endsWith("/api/proxy/appointments/stats"));
      releaseStats(); await staleStats; await page.unroute("**/api/proxy/appointments/stats", oldStats);
      await expect(pending).toContainText(fmt.number(currentStats.pending_count));
      // A failed new list request must clear previous rows/selection, then retry
      // receives the real API's empty list rather than a fabricated record set.
      await expect(row(jobs[1])).toBeVisible(); await row(jobs[1]).getByRole("checkbox").check();
      const empty = `${people[1].tag}nomatch`;
      await page.route(`**/api/proxy/appointments?*q=${empty}*`, async route => {
        expect((await route.fetch()).ok()).toBeTruthy();
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Controlled QA transport failure" }) });
      }, { times: 1 });
      await search.fill(empty); await expect(records.getByRole("alert")).toContainText(t("queue.failed"));
      await expect(row(jobs[1])).toHaveCount(0); await expect(root.getByTestId("queue-bulk")).toHaveCount(0);
      await expect(records).not.toContainText(t("work.empty"));
      await settleMotion(page); await assertAccessible(page, info, "queue-list-error"); await page.screenshot({ path: info.outputPath("queue-list-error.png") });
      await records.getByRole("button", { name: t("queue.retry"), exact: true }).click();
      await expect(records.getByRole("alert")).toHaveCount(0); await expect(records).toContainText(t("work.empty"));
      await page.route("**/api/proxy/appointments/stats", async route => {
        expect((await route.fetch()).ok()).toBeTruthy();
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Controlled QA transport failure" }) });
      }, { times: 1 });
      await root.getByRole("button", { name: t("queue.refresh"), exact: true }).click();
      await expect(stats.getByRole("alert")).toContainText(t("queue.stats_failed")); await expect(stats.getByText(t("work.waiting"), { exact: true })).toHaveCount(0);
      await queueTargets(page, root); await queueOverflow(page); await assertAccessible(page, info, "queue-summary-error");
      await page.screenshot({ path: info.outputPath("queue-summary-error.png") });
      await stats.getByRole("button", { name: t("queue.stats_retry"), exact: true }).click();
      await expect(stats.getByRole("alert")).toHaveCount(0); await expect(stats.getByText(t("work.waiting"), { exact: true })).toBeVisible();
      await expect(records).toContainText(t("work.empty"));
      // Explicitly controlled optional-enrichment presentation seam: retain
      // actual records/counts/state/billing; omit only optional health fields.
      await page.route(`**/api/proxy/appointments?*q=${people[1].tag}`, async route => {
        const actual = await route.fetch(); expect(actual.ok()).toBeTruthy(); const body = await actual.json();
        const persisted = body.items.find((item: { id: string }) => item.id === jobs[1]); expect(persisted).toBeTruthy();
        delete persisted.health_score; delete persisted.health_band;
        await route.fulfill({ response: actual, json: body });
      }, { times: 1 });
      await search.fill(people[1].tag); await expect(row(jobs[1])).toBeVisible();
      await expect(row(jobs[1]).getByRole("group", { name: t("work.health"), exact: true })).toHaveText(`${t("work.health")}${t("queue.no_health")}`);
      await settleMotion(page); await assertAccessible(page, info, "queue-missing-enrichment-presentation");
      await page.screenshot({ path: info.outputPath("queue-missing-enrichment-presentation.png") });
      await root.getByRole("button", { name: t("queue.refresh"), exact: true }).click();
      await expect(row(jobs[1]).getByRole("group", { name: t("work.health"), exact: true })).toContainText(t("band.poor"));
    } finally {
      releaseList(); releaseStats(); await page.unrouteAll({ behavior: "wait" });
      for (const id of jobs) await page.request.patch(`/api/proxy/appointments/${id}/cancel`, { data: {} });
    }
  });
}
