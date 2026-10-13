import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InternalNoteBubble } from "../components/inbox/internal-note-bubble";
import { conversationMessageTimestamp } from "../components/inbox/shared";
import { makeFormatters } from "../lib/i18n/formatters";
import { translate, type Locale } from "../lib/i18n/dictionaries";

test("Inbox internal notes display their recorded localized timestamp", async ({ page }) => {
  const now = Date.UTC(2026, 9, 13, 12);
  const date = new Date(now - 5 * 60_000).toISOString();
  const expected: Record<Locale, string> = {
    en: "5 min ago",
    ru: "5 мин назад",
    uz: "5 daq oldin",
  };

  for (const locale of ["en", "ru", "uz"] as const) {
    const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
    const time = conversationMessageTimestamp(date, now, t, makeFormatters(locale).number, "text-xs");
    const markup = renderToStaticMarkup(createElement(InternalNoteBubble, {
      label: translate(locale, "message.note"), body: "Recorded private note", timestamp: time,
    }));
    await page.setContent(markup);
    await expect(page.getByText(translate(locale, "message.note"), { exact: true })).toBeVisible();
    await expect(page.getByText("Recorded private note", { exact: true })).toBeVisible();
    await expect(page.locator("time")).toHaveText(expected[locale]);
    await expect(page.locator("time")).toHaveAttribute("datetime", date);
  }
});
