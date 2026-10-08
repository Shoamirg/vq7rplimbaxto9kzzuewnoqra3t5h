import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { settleMotion } from "./support/accessibility";

test.use({ trace: "off" });

const copy = {
  en: { bell: "Notifications", mark: "Mark all read", all: "All", vehicle: "Vehicles", empty: "You're all caught up.", new: "2 new notifications", now: "just now", minute: "5 minutes ago", hour: "2 hours ago", day: "yesterday", days: "3 days ago", loading: ["Loading calendar", "Loading dashboard", "Loading vehicle health", "Loading vehicles"], errors: ["The calendar couldn't load", "The dashboard couldn't load"], retry: "Try again" },
  ru: { bell: "Уведомления", mark: "Прочитать все", all: "Все", vehicle: "Автомобили", empty: "Новых уведомлений нет.", new: "2 новых уведомления", now: "только что", minute: "5 минут назад", hour: "2 часа назад", day: "вчера", days: "3 дня назад", loading: ["Загрузка календаря", "Загрузка панели", "Загрузка состояния автомобиля", "Загрузка автомобилей"], errors: ["Не удалось загрузить календарь", "Не удалось загрузить панель"], retry: "Повторить" },
  uz: { bell: "Bildirishnomalar", mark: "Barchasini o‘qilgan deb belgilash", all: "Barchasi", vehicle: "Avtomobillar", empty: "Yangi bildirishnomalar yo‘q.", new: "2 ta yangi bildirishnoma", now: "hozirgina", minute: "5 daqiqa oldin", hour: "2 soat oldin", day: "kecha", days: "3 kun oldin", loading: ["Kalendar yuklanmoqda", "Panel yuklanmoqda", "Avtomobil holati yuklanmoqda", "Avtomobillar yuklanmoqda"], errors: ["Kalendarni yuklab bo‘lmadi", "Panelni yuklab bo‘lmadi"], retry: "Qayta urinish" },
} as const;

// Explicit presentation fixtures for age/empty states only. Login and page
// remain real; existing workflows cover notification/server authorization.
const NOW = new Date("2026-10-08T10:00:00Z");
function fixture(ageMinutes: number, i: number) {
  return { id: `feedback-qa-${i}`, category: "appointment", severity: "info", title: `Stored message ${i}`, body: "Mijozning asl xabari", entity_type: null, entity_id: null, link: null, is_read: true, created_at: new Date(NOW.getTime() - ageMinutes * 60_000).toISOString() };
}

for (const locale of ["en", "ru", "uz"] as const) {
  test(`feedback server rendering ${locale}`, async ({ page }) => {
    // Real components/provider rendered on the server, with the locale the
    // authenticated layout selects from its cookie; no substitute UI modules.
    const { skeletons, errors, legacyIssuer }: { skeletons: string[]; errors: string[]; legacyIssuer: string } = JSON.parse(execFileSync(process.execPath, ["e2e/support/feedback-render.cjs", locale], { encoding: "utf8" }));
    expect(skeletons).toHaveLength(4);
    expect(errors).toHaveLength(2);
    for (const [i, html] of skeletons.entries()) {
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain(`aria-label="${copy[locale].loading[i]}"`);
      // A label on a generic div is not an accessible name. Check the actual
      // browser accessibility role/name on the unmodified server-rendered UI.
      await page.setContent(html);
      await expect(page.getByRole("status")).toHaveAccessibleName(copy[locale].loading[i]);
    }
    for (const [i, html] of errors.entries()) {
      expect(html).toContain(copy[locale].errors[i].replaceAll("'", "&#x27;"));
      expect(html).toContain(copy[locale].retry);
      if (locale !== "en") expect(html).not.toMatch(/We couldn&#x27;t|Retry, or check|Loading calendar/);
      expect(html).not.toMatch(/feedback\.[a-z_.]+/);
    }
    // An older document payload supplies no identity/contacts. Render the real
    // shared issuer's translated fallback without creating a mock API issuer.
    await page.setContent(legacyIssuer);
    const generic = { en: "Your garage", ru: "Ваш автосервис", uz: "Avtoservisingiz" };
    await expect(page.locator("[data-document-issuer]")).toContainText(generic[locale]);
    await expect(page.getByRole("link")).toHaveCount(0);
    expect(legacyIssuer).not.toMatch(/Demo Workshop|Precision Auto Care|\+998|public\.garage/);
  });

  for (const width of [360, 1280]) {
    test(`notification localization ${locale} ${width}`, async ({ page, context, baseURL }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const login = await page.request.post("/api/auth/login", { data: { email: "admin@demo.garageos.app", password: "demo1234" } });
      expect(login.ok()).toBeTruthy();
      await context.addCookies([{ name: "garageos_locale", value: locale, url: baseURL! }]);
      await page.clock.setFixedTime(NOW);
      let selected = "all";
      await page.route("**/api/proxy/notifications*", async route => {
        expect(route.request().method()).toBe("GET");
        selected = new URL(route.request().url()).searchParams.get("category") ?? "all";
        await route.fulfill({ json: { items: selected === "vehicle" ? [] : [...[0, 5, 120, 1440, 4320].map(fixture), { ...fixture(0, 5), created_at: "invalid-date" }], unread_count: 2 } });
      });
      const response = await page.goto("/dashboard");
      // Inspect the actual initial production response, before hydration. This
      // couples the SSR component check to the layout's real locale cookie.
      expect(await response!.text()).toContain(`aria-label="${copy[locale].loading[1]}"`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await page.getByRole("button", { name: copy[locale].bell, exact: true }).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("button", { name: copy[locale].mark, exact: true })).toBeVisible();
      await expect(menu).toContainText(copy[locale].new);
      for (const text of [copy[locale].now, copy[locale].minute, copy[locale].hour, copy[locale].day, copy[locale].days, "Stored message 0", "Mijozning asl xabari"])
        await expect(menu).toContainText(text);
      await expect(menu).not.toContainText(/NaN|feedback\.[a-z_.]+/);
      await expect(menu.getByRole("button").filter({ hasText: "Stored message 5" })).toContainText("—");
      await settleMotion(page);
      const box = await menu.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      for (const button of await menu.getByRole("button").all()) {
        const target = await button.boundingBox();
        expect(target!.width).toBeGreaterThanOrEqual(44);
        expect(target!.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: info.outputPath("notifications.png") });
      await menu.getByRole("button", { name: copy[locale].vehicle, exact: true }).click();
      await expect(menu).toContainText(copy[locale].empty);
      expect(selected).toBe("vehicle");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: copy[locale].bell, exact: true })).toBeFocused();
    });
  }
}

test("locale transition preserves notification filter and read action", async ({ page, context, baseURL }) => {
  const login = await page.request.post("/api/auth/login", { data: { email: "admin@demo.garageos.app", password: "demo1234" } });
  expect(login.ok()).toBeTruthy();
  await context.addCookies([{ name: "garageos_locale", value: "ru", url: baseURL! }]);
  await page.clock.setFixedTime(NOW);
  const reads: string[] = [];
  let readAll = false;
  await page.route(url => url.pathname.startsWith("/api/proxy/notifications"), async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/read-all")) {
      expect(route.request().method()).toBe("POST");
      readAll = true;
      await route.fulfill({ json: { success: true } });
      return;
    }
    expect(route.request().method()).toBe("GET");
    reads.push(url.searchParams.get("category") ?? "all");
    await route.fulfill({ json: { items: [fixture(21, 0)], unread_count: 21 } });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: copy.ru.bell, exact: true }).click();
  let menu = page.getByRole("menu");
  await expect(menu).toContainText("21 новое уведомление");
  await expect(menu).toContainText("21 минуту назад");
  await menu.getByRole("button", { name: copy.ru.vehicle, exact: true }).click();
  await expect.poll(() => reads.at(-1)).toBe("vehicle");
  await page.keyboard.press("Escape");
  const before = reads.length;
  await page.getByRole("button", { name: "Язык", exact: true }).click();
  await page.getByRole("menuitem", { name: /Oʻzbek/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "uz");
  expect(reads).toHaveLength(before); // Locale change alone must not refetch/reset.
  await page.getByRole("button", { name: copy.uz.bell, exact: true }).click();
  menu = page.getByRole("menu");
  await expect(menu.getByRole("button", { name: copy.uz.vehicle, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(menu).toContainText("21 ta yangi bildirishnoma");
  await expect(menu).toContainText("21 daqiqa oldin");
  await expect(menu).toContainText("Mijozning asl xabari");
  await menu.getByRole("button", { name: copy.uz.mark, exact: true }).click();
  await expect.poll(() => readAll).toBe(true);
  await expect(menu).not.toContainText("21 ta yangi bildirishnoma");
  await expect(menu).toContainText("Mijozning asl xabari");
});

test("audit all mode reports the same remaining backlog", () => {
  const normal = execFileSync(process.execPath, ["scripts/i18n-audit.mjs"], { encoding: "utf8" });
  const all = execFileSync(process.execPath, ["scripts/i18n-audit.mjs", "--all"], { encoding: "utf8" });
  const backlog = (output: string) => output.match(/Strings:.*\((\d+) in backlog\)/)?.[1];
  expect(Number(backlog(normal))).toBeGreaterThan(0); // This slice leaves other screens.
  expect(backlog(all)).toBe(backlog(normal));
  expect(all).not.toContain("100.0%");
  expect(all.match(/\((\d+) files\)/)?.[1]).toBe(normal.match(/\((\d+) files\)/)?.[1]);
});
