import { expect, test } from "@playwright/test";

test("public landing showroom switches role previews and fits a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Every vehicle. Every job. One clear view." })).toBeVisible();
  await expect(page.getByText("Sample data", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Car owner" }).click();
  await expect(page.getByRole("heading", { name: "Give customers one place to check." })).toBeVisible();
  await expect(page.getByLabel("Illustrative customer portal preview")).toBeVisible();

  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(pageWidth).toBeLessThanOrEqual(viewportWidth);
});
