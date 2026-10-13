import { expect, test } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";

import { activityMessageTimestamp } from "../components/inbox/shared";
import { makeFormatters } from "../lib/i18n/formatters";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test("Inbox activity messages render their timestamps in the selected locale", async ({ page }) => {
  const now = Date.UTC(2026, 9, 13, 12);
  const date = new Date(now - 5 * 60_000).toISOString();
  const expected: Record<Locale, string> = {
    en: "5 min ago",
    ru: "5 мин назад",
    uz: "5 daq oldin",
  };

  for (const locale of ["en", "ru", "uz"] as const) {
    const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
    const element = activityMessageTimestamp(date, now, t, makeFormatters(locale).number);
    await page.setContent(renderToStaticMarkup(element));
    const time = page.locator("time");
    await expect(time, `${locale} activity timestamp`).toHaveText(expected[locale]);
    await expect(time).toHaveAttribute("datetime", date);
  }
});

test("Inbox activity messages omit unavailable timestamps", () => {
  const element = activityMessageTimestamp(null, Date.UTC(2026, 9, 13, 12), key => key, String);
  expect(element).toBeNull();
});
