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
    data: { email: "admin@demo.garageos.app", password: "parol12345" },
  });
  expect(res.ok()).toBeTruthy();
  await context.addCookies([{ name: "garageos_locale", value: "ru", url: baseURL! }]);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  // Sidebar nav + dashboard body localized.
  // The floating dock starts with icons; its accessible label stays localized.
  await expect(page.locator('a[href="/vehicles"]').first()).toHaveAccessibleName("Автомобили");
  await expect(page.locator("body")).not.toContainText(/dash\.[a-z_.]+/);
});

// Vehicles surface (list + Intelligence Center detail) in every locale. Asserts
// three things per language, per the localization-regression contract:
//   1. Correct language renders — no raw `veh.*` / `band.*` keys and no English
//      fallback leak into RU/UZ (we positively assert localized labels appear).
//   2. Layout stays intact — no horizontal overflow (the usual symptom of long
//      Russian strings pushing buttons/badges off-screen).
//   3. Core interactions still work — open list → open Intelligence Center →
//      switch tab → open Passport → open delete confirmation → navigate back.
type VehLabels = {
  heading: string;
  bookService: string;
  passportTab: string;
  certifiedPassport: string;
  del: string;
  deleteTitle: string;
  cancel: string;
};
const VEH_LABELS: Record<"en" | "ru" | "uz", VehLabels> = {
  "en": {
    "heading": "Vehicles",
    "bookService": "Book service",
    "passportTab": "Passport",
    "certifiedPassport": "Vehicle service record",
    "del": "Delete",
    "deleteTitle": "Delete this vehicle?",
    "cancel": "Cancel"
  },
  "ru": {
    "heading": "Автомобили",
    "bookService": "Записать на обслуживание",
    "passportTab": "Паспорт",
    "certifiedPassport": "История обслуживания автомобиля",
    "del": "Удалить",
    "deleteTitle": "Удалить автомобиль?",
    "cancel": "Отмена"
  },
  "uz": {
    "heading": "Avtomobillar",
    "bookService": "Servisga yozish",
    "passportTab": "Pasport",
    "certifiedPassport": "Avtomobilga xizmat ko‘rsatish qaydlari",
    "del": "O‘chirish",
    "deleteTitle": "Bu avtomobil o‘chirilsinmi?",
    "cancel": "Bekor qilish"
  }
};

const overflowPx = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const locale of ["en", "ru", "uz"] as const) {
  test(`vehicles surface: correct language, intact layout, working interactions (${locale})`, async ({ context, page, baseURL }) => {
    const L = VEH_LABELS[locale];
    const res = await page.request.post("/api/auth/login", {
      data: { email: "admin@demo.garageos.app", password: "parol12345" },
    });
    expect(res.ok()).toBeTruthy();
    await context.addCookies([{ name: "garageos_locale", value: locale, url: baseURL! }]);

    // ── (1/2) List: correct language + no key leaks + no overflow ─────────────
    await page.goto("/vehicles", { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toHaveText(L.heading, { timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(/veh\.[a-z_.]+/);
    await expect(page.locator("body")).not.toContainText(/band\.(excellent|good|fair|poor)/);
    expect(await overflowPx(page), "vehicles list overflows horizontally").toBeLessThanOrEqual(2);

    const firstCard = page.locator('a[href^="/vehicles/"]').first();
    if ((await firstCard.count()) === 0) {
      test.info().annotations.push({ type: "note", description: "no vehicles in demo data — detail flow skipped" });
      return;
    }

    // ── Detail (Vehicle Intelligence Center): correct language + no overflow ──
    await firstCard.click();
    await page.waitForURL(/\/vehicles\/[^/]+$/, { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await expect(page.locator('a[href="/vehicles"]').first()).toHaveAccessibleName(L.heading);
    // Positively assert a real localized action label — catches English fallback.
    await expect(page.getByRole("button", { name: L.bookService })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/veh\.[a-z_.]+/);
    await expect(page.locator("body")).not.toContainText(/band\.(excellent|good|fair|poor)/);
    expect(await overflowPx(page), "vehicle detail overflows horizontally").toBeLessThanOrEqual(2);

    // ── (3) Interactions ─────────────────────────────────────────────────────
    // Switch to the Passport tab → the passport card renders.
    await page.getByRole("button", { name: L.passportTab, exact: true }).click();
    await expect(page.getByText(L.certifiedPassport).first()).toBeVisible();

    // Open the delete confirmation dialog, verify its localized title, cancel it.
    await page.getByRole("button", { name: L.del, exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(L.deleteTitle);
    await dialog.getByRole("button", { name: L.cancel }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // Navigate back to the list via the breadcrumb.
    await page.locator('a[href="/vehicles"]').first().click();
    await expect(page.locator("h1")).toHaveText(L.heading);
  });
}
