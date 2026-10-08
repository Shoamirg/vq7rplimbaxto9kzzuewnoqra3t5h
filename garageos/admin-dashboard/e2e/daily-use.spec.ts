import { expect, test, type Page } from "@playwright/test";

const SEARCH = "Ism, telefon yoki pochta bo‘yicha qidirish…";
const PAYMENT = "To‘lovni yozish";

test.beforeEach(async ({ page, baseURL }) => {
  const login = await page.request.post("/api/auth/login", { data: { email: "admin@demo.garageos.app", password: "demo1234" } });
  expect(login.ok()).toBeTruthy();
  await page.context().addCookies([{ name: "garageos_locale", value: "uz", url: baseURL! }]);
});

async function customer(page: Page) {
  const response = await page.request.get("/api/proxy/customers?limit=1");
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).items[0];
}

async function invoice(page: Page, total = 150000) {
  const owner = await customer(page);
  const response = await page.request.post("/api/proxy/invoices", { data: {
    customer_id: owner.id, line_items: [{ kind: "labor", description: "Diagnostika QA", quantity: 1, unit_price: total }], tax_rate: 0,
  } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return await response.json();
}

async function openInvoice(page: Page, doc: { code: string }) {
  await page.goto("/billing");
  await page.getByRole("button", { name: new RegExp(doc.code) }).first().click();
  await expect(page.locator("#print-invoice")).toContainText(doc.code);
}

async function openPayment(page: Page) {
  await page.getByRole("button", { name: new RegExp(PAYMENT) }).first().click();
  return page.getByRole("dialog", { name: PAYMENT });
}

test("reception registers a walk-in customer and vehicle while booking", async ({ page }) => {
  const unique = Date.now().toString();
  const name = `Yangi mijoz QA ${unique}`;
  await page.goto("/appointments");
  await page.getByRole("button", { name: "Yangi qabul" }).last().click();
  const appointment = page.getByRole("dialog", { name: "Yangi navbat" });
  await appointment.getByRole("button", { name: "Yangi mijoz" }).click();
  const intake = page.getByRole("dialog", { name: "Yangi mijoz" });
  await intake.getByLabel("Ism va familiya").fill(name);
  await intake.getByLabel("Telefon").fill(`+99890${unique.slice(-7)}`);
  await intake.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(intake).toBeHidden();
  await expect(appointment).toContainText(name);
  await appointment.getByRole("button", { name: "Avtomobil qo‘shish" }).click();
  const car = page.getByRole("dialog", { name: "Avtomobil qo‘shish" });
  await expect(car.getByLabel("Marka").locator("option")).not.toHaveCount(1);
  await car.getByLabel("Marka").selectOption({ index: 1 });
  await car.getByRole("combobox", { name: "Model", exact: true }).selectOption({ index: 1 });
  await car.getByLabel("Davlat raqami").fill(`01QA${unique.slice(-5)}`);
  await car.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(car).toBeHidden();
  await expect(appointment.locator("#appt-vehicle")).not.toHaveValue("");
  await appointment.locator("#appt-date").fill("2034-10-02");
  const saved = page.waitForResponse((r) => r.url().includes("/appointments/direct") && r.request().method() === "POST");
  await appointment.getByRole("button", { name: "Navbat yaratish", exact: true }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBeTruthy();
  const appt = await response.json();
  await expect(page.getByTestId(`appointment-row-${appt.id}`)).toContainText(name);
});

test("customer beyond the first 200 is searchable in CRM and booking", async ({ page }) => {
  const response = await page.request.get("/api/proxy/customers?offset=200&limit=50");
  const late = (await response.json()).items.find((item: { phone: string }) => item.phone);
  expect(late).toBeTruthy();
  const first = await page.request.get("/api/proxy/customers?limit=200");
  expect((await first.json()).items.some((item: { id: string }) => item.id === late.id)).toBeFalsy();
  await page.goto("/customers");
  await page.getByRole("textbox", { name: SEARCH }).fill(late.phone);
  await expect(page.getByRole("link", { name: new RegExp(late.full_name) })).toBeVisible();
  await page.goto("/appointments");
  await page.getByRole("button", { name: "Yangi qabul" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Yangi navbat" });
  await dialog.getByRole("textbox", { name: SEARCH }).fill(late.phone);
  await expect(dialog.getByRole("button", { name: new RegExp(late.full_name) })).toBeVisible();
});

test("reception sees a clear mechanic conflict and keeps the entered booking", async ({ page }) => {
  const owner = await customer(page);
  const detail = await page.request.get(`/api/proxy/customers/${owner.id}`);
  const car = (await detail.json()).vehicles[0];
  const mechanics = await page.request.get("/api/proxy/cases/mechanics");
  const mechanic = (await mechanics.json())[0];
  const booked = await page.request.post("/api/proxy/appointments/direct", { data: {
    customer_id: owner.id, vehicle_id: car.id, appointment_date: "2033-10-02",
    appointment_time: "09:00", estimated_duration_minutes: 60, mechanic_user_id: mechanic.id,
  } });
  expect(booked.ok(), await booked.text()).toBeTruthy();
  const existing = await booked.json();
  try {
    await page.goto("/appointments");
    await page.getByRole("button", { name: "Yangi qabul" }).last().click();
    const dialog = page.getByRole("dialog", { name: "Yangi navbat" });
    await dialog.getByRole("textbox", { name: SEARCH }).fill(owner.full_name);
    await dialog.getByRole("button", { name: new RegExp(owner.full_name) }).first().click();
    await expect(dialog.locator("#appt-vehicle option")).not.toHaveCount(1);
    await dialog.locator("#appt-vehicle").selectOption(car.id);
    await dialog.locator("#appt-date").fill("2033-10-02");
    await dialog.locator("#appt-time").fill("09:30");
    await dialog.locator("#appt-mechanic").selectOption(mechanic.id);
    const rejected = page.waitForResponse((r) => r.url().endsWith("/appointments/direct") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Navbat yaratish", exact: true }).click();
    expect((await rejected).status()).toBe(409);
    await expect(page.getByText(/Usta.*band/).first()).toBeVisible();
    await expect(dialog.locator("#appt-time")).toHaveValue("09:30");
  } finally {
    await page.request.patch(`/api/proxy/appointments/${existing.id}/cancel`, { data: {} });
  }
});

test("sending issued, partially paid and paid invoices preserves their status", async ({ page }) => {
  const doc = await invoice(page);
  await openInvoice(page, doc);
  for (const status of ["issued", "partial", "paid"]) {
    if (status !== "issued") {
      const payment = await page.request.post(`/api/proxy/invoices/${doc.id}/payments`, { data: { amount: status === "partial" ? 50000 : 100000, method: "cash" } });
      expect(payment.ok()).toBeTruthy();
      await openInvoice(page, doc);
    }
    const sent = page.waitForResponse((r) => r.url().endsWith(`/invoices/${doc.id}/send`));
    await page.getByRole("button", { name: /Yuborish/ }).first().click();
    const result = await sent;
    expect(result.ok()).toBeTruthy();
    expect((await result.json()).status).toBe(status);
  }
});

for (const amount of ["0", "-1000", "150001"]) {
  test(`payment refuses invalid amount ${amount}`, async ({ page }) => {
    const doc = await invoice(page);
    await openInvoice(page, doc);
    const dialog = await openPayment(page);
    await dialog.getByLabel("Summa", { exact: true }).fill(amount);
    await expect(dialog.getByRole("button", { name: PAYMENT, exact: true })).toBeDisabled();
    const result = await page.request.get(`/api/proxy/invoices/${doc.id}`);
    expect((await result.json()).amount_paid).toBe(0);
  });
}

test("lost payment response retains form and retry records only one payment", async ({ page }) => {
  const doc = await invoice(page);
  await openInvoice(page, doc);
  const dialog = await openPayment(page);
  await dialog.getByLabel("Summa", { exact: true }).fill("50000");
  const path = `**/api/proxy/invoices/${doc.id}/payments`;
  let first = true;
  const keys: string[] = [];
  await page.route(path, async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (first) {
      first = false;
      const committed = await route.fetch();
      expect(committed.ok()).toBeTruthy();
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":{"code":"TEST_LOST_RESPONSE"}}' });
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: PAYMENT, exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Summa", { exact: true })).toHaveValue("50000");
  await dialog.getByRole("button", { name: PAYMENT, exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[0]).toBe(keys[1]);
  const result = await page.request.get(`/api/proxy/invoices/${doc.id}`);
  const updated = await result.json();
  expect(updated.amount_paid).toBe(50000);
  expect(updated.balance).toBe(100000);
  expect(updated.payments).toHaveLength(1);
});

test("customer loading failure is visible and retry restores results", async ({ page }) => {
  await page.goto("/appointments");
  const path = "**/api/proxy/customers?*";
  await page.route(path, (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{}' }));
  await page.getByRole("button", { name: "Yangi qabul" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Yangi navbat" });
  await expect(dialog.getByRole("alert")).toBeVisible();
  await page.unroute(path);
  await dialog.getByRole("button", { name: "Qayta urinish" }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.locator("#appt-customer")).toBeVisible();
  await expect(dialog.getByRole("button").filter({ hasText: /\+\d/ }).first()).toBeVisible();
});

test("unpaid invoice edit crosses proxy PUT and updates its actual total", async ({ page }) => {
  const doc = await invoice(page);
  await openInvoice(page, doc);
  await page.getByRole("button", { name: "Tahrirlash", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Hisobni tahrirlash/ });
  await dialog.getByRole("spinbutton", { name: "Birlik narxi" }).fill("175000");
  const saved = page.waitForResponse((r) => r.url().endsWith(`/invoices/${doc.id}`) && r.request().method() === "PUT");
  await dialog.getByRole("button", { name: "Saqlash", exact: true }).click();
  const result = await saved;
  expect(result.ok(), await result.text()).toBeTruthy();
  expect((await result.json()).total).toBe(175000);
});

test("phone navigation closes and invoice fields fit at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/appointments");
  await page.getByTestId("sidebar-open").click();
  await page.getByRole("link", { name: "Mijozlar", exact: true }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect.poll(async () => (await page.locator("aside").first().boundingBox())?.x ?? 0).toBeLessThan(0);
  await page.goto("/billing");
  await page.getByRole("button", { name: "＋ HISOB-FAKTURA", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Yangi hisob-faktura" });
  await dialog.getByRole("textbox", { name: "Tavsif", exact: true }).fill("Diagnostika");
  await dialog.getByRole("spinbutton", { name: "Birlik narxi" }).fill("150000");
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
  await page.screenshot({ path: "test-results/daily-use-mobile-invoice.png" });
});

test("Uzbek CRM and report screens show currency and unfinished labels", async ({ page }) => {
  const owner = await customer(page);
  const doc = await invoice(page);
  await page.goto(`/customers/${owner.id}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "uz");
  await expect(page.getByText("Qolgan qarz", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/so[ʻ‘’']m/).first()).toBeVisible();
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: /hisobot/i })).toBeVisible();
  await expect(page.getByText(/so[ʻ‘’']m/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Ombor.*Tez orada/ })).toBeVisible();
  // The public invoice still has its actual declared currency.
  const response = await page.request.get(`/api/proxy/invoices/${doc.id}`);
  expect((await response.json()).currency).toBe("UZS");
});
