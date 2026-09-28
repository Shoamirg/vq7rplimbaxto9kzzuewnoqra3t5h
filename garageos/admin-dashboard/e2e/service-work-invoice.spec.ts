import { expect, test } from "@playwright/test";

const CREDS = { email: "admin@demo.garageos.app", password: "demo1234" };

test("staff completes service work and shows one Uzbek UZS invoice", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: CREDS });
  expect(login.ok()).toBeTruthy();
  await page.context().addCookies([{
    name: "garageos_locale", value: "uz", url: new URL(page.url() === "about:blank" ? "http://localhost:3001" : page.url()).origin,
  }]);

  const customers = await page.request.get("/api/proxy/customers?limit=200");
  expect(customers.ok()).toBeTruthy();
  const customer = (await customers.json()).items.find((item: { vehicle_count: number }) => item.vehicle_count > 0);
  expect(customer).toBeTruthy();
  await page.goto("/appointments");
  await page.getByRole("button", { name: "Yangi qabul" }).last().click();
  await expect(page.getByRole("dialog", { name: "Yangi navbat" })).toBeVisible();
  await page.getByPlaceholder("Mijozlarni qidiring…").fill(customer.full_name);
  await page.getByRole("dialog", { name: "Yangi navbat" }).getByRole("button", { name: customer.full_name }).first().click();
  await expect(page.locator("#appt-vehicle option")).not.toHaveCount(1);
  await page.locator("#appt-vehicle").selectOption({ index: 1 });
  await page.locator("#appt-date").fill("2030-05-10");
  await page.locator("#appt-time").fill("10:00");
  const createdPromise = page.waitForResponse((response) => response.url().includes("/api/proxy/appointments/direct") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Navbat yaratish", exact: true }).click();
  const created = await createdPromise;
  expect(created.ok(), await created.text()).toBeTruthy();
  const appointmentId = (await created.json()).id;

  const row = page.getByTestId(`appointment-row-${appointmentId}`);
  await expect(row).toBeVisible();
  const actions = () => row.getByRole("button", { name: "Amallar" });

  await actions().click();
  await page.getByText("Tasdiqlash", { exact: true }).last().click();
  await expect(row).toContainText("Tasdiqlangan");

  await actions().click();
  await page.getByText("Ishni boshlash", { exact: true }).click();
  await expect(page.getByText("Avval usta tayinlang.")).toBeVisible();

  await actions().click();
  await page.getByText("Tahrirlash / usta tayinlash", { exact: true }).click();
  await expect(page.locator("#edit-mechanic")).toBeVisible();
  await page.locator("#edit-mechanic").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Saqlash" }).click();

  await actions().click();
  await page.getByText("Ishni boshlash", { exact: true }).click();
  await expect(row).toContainText("Jarayonda");

  await actions().click();
  await page.getByText("Ishni tugatish", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Ishni tugatish" })).toBeVisible();
  await page.locator("#complete-service-type").fill("Diagnostika");
  await page.locator("#complete-notes").fill("Dvigatel xatolari tekshirildi");
  await page.getByRole("dialog", { name: "Ishni tugatish" }).getByRole("button", { name: "Ishni tugatish" }).click();
  await expect(row).toContainText("Yakunlangan");

  await actions().click();
  await page.getByText("Hisob yaratish / ochish", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Yangi hisob-faktura" })).toBeVisible();
  await page.getByPlaceholder("Tavsif").fill("Diagnostika");
  await page.getByRole("spinbutton", { name: "Birlik narxi" }).fill("150000");
  await page.getByRole("button", { name: "Hisob yaratish", exact: true }).click();

  await expect(page).toHaveURL(/\/invoice\/[0-9a-f-]{36}/);
  const invoiceUrl = page.url();
  await expect(page.getByText("HISOB-FAKTURA")).toBeVisible();
  await expect(page.getByText("Diagnostika")).toBeVisible();
  await expect(page.locator("#print-invoice")).toContainText("UZS");
  await expect(page.getByRole("button", { name: "Chop etish / PDF saqlash" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto(invoiceUrl);
  await expect(page.getByText("HISOB-FAKTURA")).toBeVisible();
  await expect(page.locator("#print-invoice")).toContainText("UZS");

  expect((await page.request.post("/api/auth/login", { data: CREDS })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: "garageos_locale", value: "uz", url: "http://localhost:3001" }]);
  await page.goto("/appointments");
  await expect(row).toBeVisible();
  await actions().click();
  await page.getByText("Hisob yaratish / ochish", { exact: true }).click();
  await expect(page).toHaveURL(invoiceUrl);
});
