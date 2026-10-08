import { test, expect } from "@playwright/test";
import { prepareMini } from './support/mini-auth';

test.use({ trace: 'off' });

// i18n regression — render key surfaces in Russian and assert translated chrome
// appears (and no raw dotted keys leak through). Catches missing translations
// the static coverage check can't (e.g. a hardcoded English string).

test("Mini App renders in Russian", async ({ context, page, baseURL }) => {
  await prepareMini(page, baseURL, 'ru');
  // Scope the locale cookie to the actual base origin — a cookie set for
  // localhost is not sent to 127.0.0.1 (and vice-versa), which would silently
  // fall back to English regardless of BASE_URL.
  await context.addCookies([{ name: "garageos_locale", value: "ru", url: baseURL! }]);
  await page.goto("/mini", { waitUntil: "networkidle" });
  // Home greeting + SOS in Russian; bottom tabs in Russian.
  await expect(page.getByText("Нужна помощь?")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('a[href="/mini"]')).toContainText("Главная");
  // No untranslated dotted keys leaked into the UI.
  await expect(page.locator("body")).not.toContainText(/mini\.[a-z_.]+/);
});

test("staff dashboard renders in Russian", async ({ context, page, baseURL }) => {
  const res = await page.request.post("/api/auth/login", {
    data: { email: "admin@demo.garageos.app", password: "demo1234" },
  });
  expect(res.ok()).toBeTruthy();
  await context.addCookies([{ name: "garageos_locale", value: "ru", url: baseURL! }]);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  // Sidebar nav + dashboard body localized.
  await expect(page.locator('a[href="/vehicles"]').first()).toContainText("Автомобили");
  await expect(page.locator("body")).not.toContainText(/dash\.[a-z_.]+/);
});
