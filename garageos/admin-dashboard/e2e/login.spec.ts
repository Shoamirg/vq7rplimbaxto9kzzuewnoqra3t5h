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

test("staff refresh token stays HttpOnly and rotates through the BFF", async ({ page }) => {
  const crossSiteLogin = await page.request.post("/api/auth/login", {
    headers: { "sec-fetch-site": "cross-site" },
    data: { email: "admin@demo.garageos.app", password: "demo1234" },
  });
  expect(crossSiteLogin.status()).toBe(403);

  const login = await page.request.post("/api/auth/login", {
    data: { email: "admin@demo.garageos.app", password: "demo1234" },
  });
  expect(login.ok()).toBeTruthy();
  expect(await login.json()).not.toHaveProperty("access_token");

  const before = (await page.context().cookies()).find((cookie) => cookie.name === "garageos_refresh_token");
  expect(before?.httpOnly).toBe(true);
  expect(before?.sameSite).toBe("Lax");
  expect(before?.path).toBe("/api/auth");

  const crossSiteRefresh = await page.request.post("/api/auth/refresh", {
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(crossSiteRefresh.status()).toBe(403);

  const refresh = await page.request.post("/api/auth/refresh");
  expect(refresh.ok()).toBeTruthy();
  expect(await refresh.json()).toEqual({ ok: true });

  const after = (await page.context().cookies()).find((cookie) => cookie.name === "garageos_refresh_token");
  expect(after?.value).toBeTruthy();
  expect(after?.value).not.toBe(before?.value);

  const logout = await page.request.post("/api/auth/logout");
  expect(logout.ok()).toBeTruthy();
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
  const replay = await page.request.post(`${apiBase}/auth/refresh`, {
    data: { refresh_token: after!.value },
  });
  expect(replay.status()).toBe(401);
});
