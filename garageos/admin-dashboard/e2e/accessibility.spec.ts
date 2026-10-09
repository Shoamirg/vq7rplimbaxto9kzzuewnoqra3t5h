import { expect, test } from "@playwright/test";
import { prepareMini } from "./support/mini-auth";
import { brandCssVars } from "../lib/branding";
import { withFailureDiagnostics } from "./support/failure-diagnostics";
import {
  assertAccessible,
  assertKeyboardFocus,
  assertTargets,
  assertReducedMotion,
  assertNoActiveScaling,
  settleMotion,
} from "./support/accessibility";

test.use({ trace: "off" }); // Never retain synthetic launch bodies/auth cookies.
const labels = {
  en: {
    create: "New customer",
    name: "Full name",
    phone: "Phone",
    close: "Close",
    cancel: "Cancel",
    notifications: "Notifications",
    roadside: "Need help now?",
    problem: "What's happening?",
    request: "Request assistance",
  },
  ru: {
    create: "Новый клиент",
    name: "Полное имя",
    phone: "Телефон",
    close: "Закрыть",
    cancel: "Отмена",
    notifications: "Уведомления",
    roadside: "Нужна помощь?",
    problem: "Что случилось?",
    request: "Запросить помощь",
  },
  uz: {
    create: "Yangi mijoz",
    name: "Ism va familiya",
    phone: "Telefon",
    close: "Yopish",
    cancel: "Bekor qilish",
    notifications: "Bildirishnomalar",
    roadside: "Yordam kerakmi?",
    problem: "Nima bo‘ldi?",
    request: "Yordam so‘rash",
  },
} as const;

for (const locale of ["en", "ru", "uz"] as const)
  for (const width of [360, 1280]) {
    test(`Mini accessibility ${locale} ${width}`, async ({
      page,
      baseURL,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await prepareMini(page, baseURL, locale);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/mini");
      const sos = page.getByRole("link", {
        name: labels[locale].roadside,
        exact: true,
      });
      await expect(sos).toBeVisible();
      await settleMotion(page);
      expect(
        await page.locator('meta[name="viewport"]').getAttribute("content"),
      ).not.toMatch(/user-scalable=no|maximum-scale=1(?:,|$)/);
      await assertAccessible(page, info, "mini-home");
      await assertTargets(page);
      await assertNoActiveScaling(page, sos);
      await assertKeyboardFocus(page, sos);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/mini\/roadside$/);
      const problem = page.getByRole("textbox", {
        name: labels[locale].problem,
        exact: true,
      });
      await expect(problem).toBeVisible();
      await settleMotion(page);
      await assertAccessible(page, info, "mini-roadside");
      await assertTargets(page);
      await assertKeyboardFocus(page, problem);
      await page.keyboard.type("Accessibility QA - not submitted");
      const request = page.getByRole("button", {
        name: labels[locale].request,
        exact: true,
      });
      await expect(request).toBeEnabled();
      await settleMotion(page);
      await assertAccessible(page, info, "mini-roadside-enabled");
      await assertNoActiveScaling(page, request);
      await assertKeyboardFocus(page, request);
      await assertTargets(page);
      await page.screenshot({
        path: info.outputPath("mini-roadside-keyboard.png"),
      });
    });

    for (const theme of ["light", "dark"] as const)
      test(`Staff accessibility ${locale} ${theme} ${width}`, async ({
        page,
        baseURL,
        context,
      }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await context.addCookies([
          { name: "garageos_locale", value: locale, url: baseURL! },
        ]);
        await page.addInitScript(
          (t) => localStorage.setItem("garageos-theme", t),
          theme,
        );
        const auth = await page.request.post("/api/auth/login", {
          data: { email: "admin@demo.garageos.app", password: "demo1234" },
        });
        expect(auth.ok()).toBeTruthy();
        await withFailureDiagnostics(page, info, "staff-initial-navigation", async () => {
          await page.goto("/customers");
        });
        const trigger = page.getByRole("button", {
          name: labels[locale].create,
          exact: true,
        });
        await expect(trigger).toBeVisible();
        await settleMotion(page);
        await expect(
          page.getByRole("button", {
            name: labels[locale].notifications,
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("region", {
            name: labels[locale].notifications,
            exact: true,
          }),
        ).toBeAttached();
        if (width === 360) {
          await page.emulateMedia({ reducedMotion: "reduce" });
          const menu = page.getByTestId("sidebar-open");
          await assertKeyboardFocus(page, menu);
          await page.keyboard.press("Enter");
          await expect(page.locator("#staff-sidebar")).toBeVisible();
          await assertReducedMotion(page.locator("#staff-sidebar"));
          await settleMotion(page);
          await assertAccessible(page, info, "staff-phone-navigation");
          await assertTargets(page);
          await page.keyboard.press("Escape");
          await expect(page.locator("#staff-sidebar")).toBeHidden();
          await expect(menu).toBeFocused();
          await page.emulateMedia({ reducedMotion: "no-preference" });
        }
        await assertAccessible(page, info, "staff-list");
        await assertTargets(page);
        await assertKeyboardFocus(page, trigger);
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", {
          name: labels[locale].create,
          exact: true,
        });
        await expect(dialog).toBeVisible();
        await settleMotion(page);
        await expect(
          dialog.getByRole("button", {
            name: labels[locale].close,
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", {
            name: labels[locale].cancel,
            exact: true,
          }),
        ).toBeVisible();
        const name = dialog.getByRole("textbox", {
          name: labels[locale].name,
          exact: true,
        });
        await expect(name).toBeFocused();
        await name.fill("Accessibility QA - not saved");
        await dialog
          .getByRole("textbox", { name: labels[locale].phone, exact: true })
          .fill("+998901234567");
        await settleMotion(page);
        await assertAccessible(page, info, "staff-dialog");
        await assertTargets(page);
        const controls = await dialog
          .locator("button:not(:disabled),input:not(:disabled)")
          .count();
        for (const key of ["Tab", "Shift+Tab"])
          for (let i = 0; i < controls * 2 + 1; i++) {
            await page.keyboard.press(key);
            expect(
              await page.evaluate(
                () => !!document.activeElement?.closest('[role="dialog"]'),
              ),
              "Dialog must trap keyboard focus away from its hidden background",
            ).toBeTruthy();
          }
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.keyboard.press("Enter");
        await expect(dialog).toBeVisible();
        await assertReducedMotion(dialog);
        await assertReducedMotion(
          page.locator('[data-state="open"].backdrop-blur-xs'),
        );
        await settleMotion(page);
        await page.screenshot({
          path: info.outputPath("staff-dialog-reduced-motion.png"),
        });
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
      });
  }

test("Accessibility focus gate refuses transparent and inset rings", async ({
  page,
}) => {
  for (const shadow of [
    "rgba(0,0,0,0) 0 0 0 2px",
    "inset rgb(0,0,255) 0 0 0 2px",
    "rgb(0,0,255) 0 0 2px 0",
  ]) {
    await page.setContent(
      `<button style="outline:none;box-shadow:${shadow}">Focus probe</button>`,
    );
    await expect(
      assertKeyboardFocus(
        page,
        page.getByRole("button", { name: "Focus probe" }),
      ),
    ).rejects.toThrow(/Settled keyboard focus/);
  }
  await page.setContent(
    '<button style="outline:none;box-shadow:rgb(0,0,255) 0 0 0 2px">Focus probe</button>',
  );
  await assertKeyboardFocus(
    page,
    page.getByRole("button", { name: "Focus probe" }),
  );
});

test("Reduced-motion gate rejects independent CSS active scaling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(
    "<style>button:active{scale:.99}</style><button>Scaling probe</button>",
  );
  await expect(
    assertNoActiveScaling(
      page,
      page.getByRole("button", { name: "Scaling probe" }),
    ),
  ).rejects.toThrow(/Reduced-motion pointer/);
  await page.setContent(
    "<style>@media(prefers-reduced-motion:no-preference){button:active{scale:.99}}</style><button>Scaling probe</button>",
  );
  await assertNoActiveScaling(
    page,
    page.getByRole("button", { name: "Scaling probe" }),
  );
});

test("Tenant primary button text stays readable across brand colors", async ({
  page,
}, info) => {
  for (const color of [
    "#2563eb",
    "#ffff00",
    "#ffffff",
    "#000000",
    "#777777",
    "#f97316",
  ]) {
    const vars = brandCssVars({
      name: "QA",
      monogram: "Q",
      tagline: null,
      slug: null,
      primary_color: color,
      accent_color: "#ffffff",
    });
    const style = Object.entries(vars)
      .map(([key, value]) => `${key}:${value}`)
      .join(";");
    await page.setContent(
      `<html lang="en"><head><title>Brand contrast probe</title></head><body><main style="${style}"><button style="background:hsl(var(--primary));color:hsl(var(--primary-foreground));padding:16px">Branded action</button></main></body></html>`,
    );
    await assertAccessible(page, info, "brand-" + color.slice(1));
  }
});
