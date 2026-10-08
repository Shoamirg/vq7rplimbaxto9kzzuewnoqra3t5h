import { test, expect, type Page } from "@playwright/test";

// Staff journey — walks every core surface and asserts it renders (no error
// boundary). Locale-resilient: checks URLs, the persistent shell, and stable
// hrefs/testids rather than translated copy.

const CREDS = { email: "admin@demo.garageos.app", password: "demo1234" };

async function login(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: CREDS });
  expect(res.ok(), "BFF login should succeed").toBeTruthy();
}

async function expectHealthyPage(page: Page, urlPart: string) {
  await expect(page).toHaveURL(new RegExp(urlPart.replace(/\//g, "\\/")));
  // Error boundaries render these; a healthy page must not.
  await expect(page.locator("body")).not.toContainText(/something went wrong|unexpected error/i);
  // The (app) shell sidebar is present on every authenticated page.
  await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("login lands on the dashboard", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expectHealthyPage(page, "/dashboard");
});

test("every core staff surface renders", async ({ page }) => {
  for (const path of [
    "/dashboard", "/calendar", "/appointments", "/vehicles",
    "/customers", "/operations", "/inbox", "/billing", "/reports",
  ]) {
    // Inbox prefetches a linked operations page. Its background request is
    // unrelated to the already-loaded queue/thread and can prevent networkidle.
    const inbox = path === '/inbox' ? page.waitForResponse((response) =>
      response.url().includes('/api/proxy/conversations?') && response.ok()) : null;
    await page.goto(path, { waitUntil: path === '/inbox' ? 'domcontentloaded' : 'networkidle' });
    if (inbox) {
      const data = await (await inbox).json();
      expect(data.items.length).toBeGreaterThan(0);
      await expect(page.getByText(data.items[0].customer_name, { exact:true }).first()).toBeVisible();
    }
    await expectHealthyPage(page, path);
  }
});

test("Vehicle Intelligence Center opens for a vehicle", async ({ page }) => {
  await page.goto("/vehicles", { waitUntil: "networkidle" });
  const firstCard = page.locator('a[href^="/vehicles/"]').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();

  // Landed on a vehicle detail (uuid) with the digital-twin hero + hotspots.
  await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("vic-hero")).toBeVisible();
  await expect(page.getByTestId("vic-hotspot").first()).toBeVisible();
  const hotspots = await page.getByTestId("vic-hotspot").count();
  expect(hotspots, "hero should show subsystem hotspots").toBeGreaterThanOrEqual(3);

  // Clicking a subsystem hotspot reveals its detail (no crash).
  await page.getByTestId("vic-hotspot").first().click();
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
});

test("global search (⌘K) opens and finds results", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.keyboard.press("ControlOrMeta+k");
  // The command menu dialog has its own search input.
  const dialog = page.getByRole("dialog");
  const search = dialog.getByRole("textbox");
  await expect(search).toBeVisible();
  await search.fill("toyota");
  // Result rows are buttons; a matching vehicle shows "Toyota …".
  await expect(dialog.getByRole("button").filter({ hasText: /toyota/i }).first()).toBeVisible({ timeout: 10_000 });
});
