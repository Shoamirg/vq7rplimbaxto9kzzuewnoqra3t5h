import { expect, test } from "@playwright/test";

test("public landing showroom switches role previews and fits a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Every vehicle. Every job. One clear view." })).toBeVisible();
  await expect(page.getByText("Sample data", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Illustrative side view of a passenger car" })).toBeVisible();
  await expect(page.locator(".mkt-home__capability")).toHaveCount(5);

  const ownerImage = page.getByRole("img", { name: "Sample GarageOS owner dashboard" });
  await ownerImage.scrollIntoViewIfNeeded();
  await expect.poll(() => ownerImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Car owner" }).click();
  await expect(page.getByRole("heading", { name: "Give customers one place to check." })).toBeVisible();
  await expect(page.getByLabel("Illustrative customer portal preview")).toBeVisible();

  const vehicleRecord = page.getByRole("img", { name: "Example vehicle record with service history, maintenance indicators, and vehicle health overview" });
  await vehicleRecord.scrollIntoViewIfNeeded();
  await expect.poll(() => vehicleRecord.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(pageWidth, `page should fit at ${width}px`).toBeLessThanOrEqual(viewportWidth);
  }
});
