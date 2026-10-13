import { test, expect } from "@playwright/test";

// Customer journey — the Telegram Mini App in a browser (dev sign-in, no
// Telegram). Walks Home → Vehicles → Passport → Billing → Messages → Roadside.

test("mini home authenticates and renders the essentials", async ({ page }) => {
  await page.goto("/mini", { waitUntil: "networkidle" });
  // SOS is the anchor of Home; its presence means auth + data both worked.
  await expect(page.locator('a[href="/mini/roadside"]')).toBeVisible({ timeout: 20_000 });
  // Bottom tab bar is the persistent chrome.
  await expect(page.locator('a[href="/mini/vehicles"]')).toBeVisible();
});

test("customer refresh token stays HttpOnly and rotates through the Mini App BFF", async ({ page }) => {
  const crossSiteSignIn = await page.request.post("/api/mini/auth", {
    headers: { "sec-fetch-site": "cross-site" },
    data: {},
  });
  expect(crossSiteSignIn.status()).toBe(403);

  await page.goto("/mini", { waitUntil: "networkidle" });
  const before = (await page.context().cookies()).find(
    (cookie) => cookie.name === "garageos_customer_refresh_token",
  );
  expect(before?.httpOnly).toBe(true);
  expect(before?.sameSite).toBe("Lax");
  expect(before?.path).toBe("/api/mini/auth");

  const crossSiteRefresh = await page.request.post("/api/mini/auth/refresh", {
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(crossSiteRefresh.status()).toBe(403);

  const refresh = await page.request.post("/api/mini/auth/refresh");
  expect(refresh.ok()).toBeTruthy();
  expect(await refresh.json()).toEqual({ ok: true });

  const after = (await page.context().cookies()).find(
    (cookie) => cookie.name === "garageos_customer_refresh_token",
  );
  expect(after?.value).toBeTruthy();
  expect(after?.value).not.toBe(before?.value);

  const logout = await page.request.post("/api/mini/auth/logout");
  expect(logout.ok()).toBeTruthy();
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
  const replay = await page.request.post(`${apiBase}/customer/auth/refresh`, {
    data: { refresh_token: after!.value },
  });
  expect(replay.status()).toBe(401);
});

test("vehicles list shows cars and opens a passport", async ({ page }) => {
  await page.goto("/mini", { waitUntil: "networkidle" });
  await page.locator('a[href="/mini/vehicles"]').click();
  const cards = page.locator('a[href^="/mini/vehicles/"]');
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });
  expect(await cards.count(), "linked customer should have vehicles").toBeGreaterThanOrEqual(1);

  await cards.first().click();
  await expect(page).toHaveURL(/\/mini\/vehicles\/[0-9a-f-]{36}/);
  // Passport hero — the "Certified Passport" wording (mini vehicle detail).
  await expect(page.getByText(/passport/i).first()).toBeVisible();
});

test("billing and messages render", async ({ page }) => {
  await page.goto("/mini/billing", { waitUntil: "networkidle" });
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  await expect(page.locator('a[href="/mini/messages"]')).toBeVisible();

  await page.goto("/mini/messages", { waitUntil: "networkidle" });
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
});

test("roadside request transforms into live tracking", async ({ page }) => {
  await page.goto("/mini/roadside", { waitUntil: "networkidle" });
  await page.locator("#roadside-problem").fill("[E2E] Flat tyre on the highway");
  await page.getByRole("button", { name: /request assistance/i }).click();
  // The form transforms in place into the tracking view (a real case is opened).
  await expect(page.getByText(/help is on the way/i)).toBeVisible({ timeout: 20_000 });
  // The status stepper is present.
  await expect(page.getByText(/reported/i).first()).toBeVisible();
});
