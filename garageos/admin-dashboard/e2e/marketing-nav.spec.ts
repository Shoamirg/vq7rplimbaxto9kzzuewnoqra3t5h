import { expect, test } from "@playwright/test";

test("marketing navigation stays readable on narrow mobile screens", async ({ page }) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const nav = page.getByRole("banner");
    const signIn = nav.getByRole("link", { name: "Sign in" });
    const bookDemo = nav.getByRole("link", { name: "Book a demo" });

    await expect(signIn).toBeVisible();
    await expect(bookDemo).toBeVisible();
    const layout = await nav.evaluate((header) => {
      const signInRect = header.querySelector('a[href="/login"]')!.getBoundingClientRect();
      const demoRect = header.querySelector('a[href^="mailto:hello@garageos.app"]')!.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        signInCenter: signInRect.top + signInRect.height / 2,
        demoCenter: demoRect.top + demoRect.height / 2,
        demoHeight: demoRect.height,
        demoRight: demoRect.right,
      };
    });

    expect(layout.documentWidth).toBe(width);
    expect(Math.abs(layout.signInCenter - layout.demoCenter)).toBeLessThanOrEqual(1);
    expect(layout.demoHeight).toBeLessThanOrEqual(48);
    expect(layout.demoRight).toBeLessThanOrEqual(width);
  }
});
