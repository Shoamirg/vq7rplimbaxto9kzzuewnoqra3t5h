import { test, expect } from "@playwright/test";

test("mechanic sign-in opens the assigned work order queue", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("carlos.mendez@demo.garageos.app");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/work-orders$/);
  await expect(page.getByRole("heading", { name: /work orders|ish buyurtmalari/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/the dashboard couldn't load/i);
});

test("office sign-in keeps the dashboard landing page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@demo.garageos.app");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /dashboard|boshqaruv paneli/i })).toBeVisible();
});
