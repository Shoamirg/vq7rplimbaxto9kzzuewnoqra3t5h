/** Genuine delayed JavaScript delivery must not lose early queue actions.
 * Uses normal authentication and API records; production scripts are delivered
 * unchanged after inspecting the server-rendered shell.
 */
import { expect, test, type Request } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { queueCustomer, queueJob, queueLogin } from "./support/queue";
import { translate } from "../lib/i18n/dictionaries";

test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe.configure({ retries: 0 });

test("controlled genuine slow JavaScript delivery blocks SSR queue actions until handlers are ready", async ({ page, baseURL }, info) => {
  test.setTimeout(180_000);
  const t = (key: string) => translate("en", key);
  const { profile } = await queueLogin(page, baseURL!, "en", 360, 0);
  const person = await queueCustomer(page, profile), jobs: string[] = [];
  const started = Date.now();
  let release!: () => void, released = false, heldScripts = 0, finishedScripts = 0;
  const gate = new Promise<void>(done => { release = done; });
  const events: Record<string, string | number | boolean>[] = [];
  const record = (event: Record<string, string | number | boolean>) => {
    if (events.length < 128) events.push({ elapsedMs: Date.now() - started, ...event });
  };
  const onRequest = (request: Request) => {
    const url = new URL(request.url());
    if (url.pathname !== "/api/proxy/appointments" && url.pathname !== "/api/proxy/appointments/stats") return;
    record({ event: "request", path: url.pathname, beforeRelease: !released,
      qEqualsExpected: url.searchParams.get("q") === person.tag,
      qPresent: url.searchParams.has("q"), statusFilterPresent: url.searchParams.has("status"),
      dateFilterPresent: url.searchParams.has("date_from") || url.searchParams.has("date_to") });
  };
  const releaseOwnedScripts = () => { released = true; release(); };
  let observation: Record<string, unknown> = {};
  try {
    for (let day = 1; day <= 18; day++) jobs.push(await queueJob(page,
      { customer_id: person.customer_id, vehicle_id: person.vehicle_id },
      `2037-02-${String(day).padStart(2, "0")}`));
    const seeded = await page.request.get(`/api/proxy/appointments?page=1&page_size=100&q=${encodeURIComponent(person.tag)}`);
    expect(seeded.status()).toBe(200); const seedData = await seeded.json();
    expect(seedData.total).toBe(18);
    expect(seedData.items.map((row: { id: string }) => row.id).sort()).toEqual([...jobs].sort());

    page.on("request", onRequest);
    await page.route("**/_next/static/**", async route => {
      const url = new URL(route.request().url());
      if (route.request().resourceType() !== "script" || !url.pathname.endsWith(".js")) return route.continue();
      // Consume the actual production server response first. Its bytes, status
      // and headers are fulfilled unchanged only after the owned delivery gate.
      const response = await route.fetch(); expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toMatch(/javascript/);
      if (!released) { heldScripts++; record({ event: "genuine-script-held", status: response.status() }); await gate; }
      await route.fulfill({ response }); finishedScripts++;
    });

    // Commit permits inspecting genuine parsed SSR while actual scripts remain
    // withheld. This new controlled navigation scope does not alter the frozen
    // original normal-load reproduction.
    await page.goto("/appointments", { waitUntil: "commit" });
    const root = page.getByTestId("appointments-queue"); await expect(root).toBeVisible();
    await expect.poll(() => heldScripts).toBeGreaterThan(0);
    const search = root.getByRole("textbox", { name: t("work.search"), exact: true });
    const statusGroup = root.getByRole("group", { name: t("work.status"), exact: true });
    const dateGroup = root.getByRole("group", { name: t("work.when"), exact: true });
    const blocked = await root.evaluate((element, names) => {
      const input = element.querySelector<HTMLInputElement>(`input[aria-label="${names.search}"]`);
      const intrinsic = (control: HTMLElement) => control.matches(":disabled") || !!control.closest("[inert]")
        || control instanceof HTMLInputElement && control.readOnly;
      const buttons = (name: string) => Array.from(element.querySelectorAll<HTMLElement>(`[role="group"][aria-label="${name}"] button`));
      const status = buttons(names.status), dates = buttons(names.when);
      return { searchPresent: !!input, searchBlocked: !!input && intrinsic(input),
        statusCount: status.length, statusBlocked: status.map(intrinsic),
        dateCount: dates.length, dateBlocked: dates.map(intrinsic) };
    }, { search: t("work.search"), status: t("work.status"), when: t("work.when") });
    expect(blocked.searchPresent).toBe(true); expect(blocked.statusCount).toBe(6); expect(blocked.dateCount).toBe(5);
    // Soft boundary assertions retain the owning RED but let genuine script
    // release and the ordinary functional search proof complete in this run.
    expect.soft(blocked.searchBlocked, "SSR search must not accept edits before production handlers load").toBe(true);
    expect.soft(blocked.statusBlocked.every(Boolean), "Every SSR status control must block an unhandled action").toBe(true);
    expect.soft(blocked.dateBlocked.every(Boolean), "Every SSR date control must block an unhandled action").toBe(true);

    // Only if the current product leaves a native control usable, demonstrate
    // its actual early action. No forced action is used on blocked controls.
    if (!blocked.searchBlocked) await search.fill(person.tag);
    const confirm = statusGroup.getByRole("button", { name: t("status.confirmed"), exact: true });
    const tomorrow = dateGroup.getByRole("button", { name: t("work.tomorrow"), exact: true });
    const intrinsicallyBlocked = (element: HTMLElement) => element.matches(":disabled") || !!element.closest("[inert]");
    if (!await confirm.evaluate(intrinsicallyBlocked)) await confirm.click();
    if (!await tomorrow.evaluate(intrinsicallyBlocked)) await tomorrow.click();
    observation = { blocked, earlyDomSearchEqualsExpected: await search.inputValue() === person.tag,
      earlyConfirmedPressed: await confirm.getAttribute("aria-pressed") === "true",
      earlyTomorrowPressed: await tomorrow.getAttribute("aria-pressed") === "true" };
    expect(events.filter(event => event.event === "request" && event.beforeRelease)).toHaveLength(0);

    const initialStats = page.waitForResponse(response => response.request().method() === "GET"
      && new URL(response.url()).pathname === "/api/proxy/appointments/stats");
    const initialList = page.waitForResponse(response => response.request().method() === "GET"
      && new URL(response.url()).pathname === "/api/proxy/appointments");
    releaseOwnedScripts();
    expect((await initialStats).status()).toBe(200); expect((await initialList).status()).toBe(200);
    await expect(root.getByRole("button", { name: t("queue.refresh"), exact: true })).toBeEnabled();
    await expect(search).toBeEnabled();
    observation = { ...observation, afterReleaseDomSearchEqualsExpected: await search.inputValue() === person.tag,
      afterReleaseConfirmedPressed: await confirm.getAttribute("aria-pressed") === "true",
      afterReleaseTomorrowPressed: await tomorrow.getAttribute("aria-pressed") === "true" };

    // A fresh, deliberate normal action after readiness. Clearing here belongs
    // only to this new experiment; the original reproduction still fills once.
    await statusGroup.getByRole("button", { name: t("work.all"), exact: true }).click();
    await dateGroup.getByRole("button", { name: t("work.all_dates"), exact: true }).click();
    await search.fill("");
    const searched = page.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === "GET" && url.pathname === "/api/proxy/appointments"
        && url.searchParams.get("q") === person.tag;
    });
    await search.fill(person.tag);
    const response = await searched; expect(response.status()).toBe(200); const data = await response.json();
    expect(data.total).toBe(18); expect(data.items).toHaveLength(15);
    const expected = data.items.map((row: { id: string }) => row.id);
    expect(expected.every((id: string) => jobs.includes(id))).toBe(true); expect(new Set(expected).size).toBe(15);
    await expect(root.locator('[data-testid^="appointment-row-"]')).toHaveCount(15, { timeout: 15_000 });
    for (const id of expected) await expect(root.getByTestId(`appointment-row-${id}`)).toHaveCount(1);
    observation = { ...observation, realSearchTotal: data.total, realVisibleOwnRows: expected.length };
  } finally {
    releaseOwnedScripts(); await page.unrouteAll({ behavior: "wait" }); page.off("request", onRequest);
    try {
      const file = info.outputPath("slow-hydration-boundary.json"); await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({ controlledBoundaryOnly: true, heldScripts, finishedScripts,
        elapsedMs: Date.now() - started, events, observation }, null, 2));
      await info.attach("slow-hydration-boundary", { path: file, contentType: "application/json" });
    } catch { /* Diagnostic I/O does not replace an owning failure. */ }
    for (const id of jobs) await page.request.patch(`/api/proxy/appointments/${id}/cancel`, { data: {} });
  }
});
