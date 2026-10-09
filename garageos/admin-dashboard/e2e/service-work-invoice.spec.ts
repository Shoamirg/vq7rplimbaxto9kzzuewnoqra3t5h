import { expect, test } from "@playwright/test";
import { queueCustomer, queueLogin } from "./support/queue";

const CREDS = { email: "admin@demo.garageos.app", password: "demo1234" };

test("new booking selects a mechanic account and persists its UUID", async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: CREDS })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: "garageos_locale", value: "uz", url: "http://localhost:3001" }]);
  const customers = await page.request.get("/api/proxy/customers?limit=200");
  const customer = (await customers.json()).items.find((item: { vehicle_count: number }) => item.vehicle_count > 0);
  const roster = await page.request.get("/api/proxy/mechanics");
  const mechanic = (await roster.json()).items[0];
  expect(mechanic).toBeTruthy();
  await page.goto("/appointments");
  await page.getByRole("button", { name: "Yangi qabul" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Yangi navbat" });
  await dialog.getByRole("textbox", { name: "Ism, telefon yoki pochta bo‘yicha qidirish…" }).fill(customer.full_name);
  await dialog.getByRole("button", { name: customer.full_name }).first().click();
  await expect(page.locator("#appt-vehicle option")).not.toHaveCount(1);
  await page.locator("#appt-vehicle").selectOption({ index: 1 });
  await page.locator("#appt-date").fill("2030-05-11");
  await page.locator("#appt-time").fill("10:00");
  await expect(page.locator("#appt-mechanic")).toBeEnabled();
  await expect(page.locator("#appt-mechanic option", { hasText: mechanic.email })).toContainText(mechanic.full_name);
  await page.locator("#appt-mechanic").selectOption(mechanic.id);
  const createdPromise = page.waitForResponse((response) => response.url().includes("/api/proxy/appointments/direct") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Navbat yaratish", exact: true }).click();
  const created = await createdPromise;
  expect(created.ok(), await created.text()).toBeTruthy();
  const job = await created.json();
  try {
    expect(created.request().postDataJSON().mechanic_user_id).toBe(mechanic.id);
    expect(job.mechanic_user_id).toBe(mechanic.id);
    expect(job.mechanic_name).toBe(mechanic.full_name);
    const persisted = await page.request.get(`/api/proxy/appointments/${job.id}`);
    expect((await persisted.json()).mechanic_user_id).toBe(mechanic.id);
  } finally {
    // Release the schedule even when an assertion fails before CI retries.
    await page.request.patch(`/api/proxy/appointments/${job.id}/cancel`, { data: {} });
  }
});

test("staff completes service work and shows one Uzbek UZS invoice", async ({ page, baseURL }, info) => {
  const { owner, profile } = await queueLogin(page, baseURL!, "uz", 1280);
  const customer = await queueCustomer(page, profile);
  await page.goto("/appointments");
  await page.getByRole("button", { name: "Yangi qabul" }).last().click();
  await expect(page.getByRole("dialog", { name: "Yangi navbat" })).toBeVisible();
  await page.getByRole("dialog", { name: "Yangi navbat" }).getByRole("textbox", { name: "Ism, telefon yoki pochta bo‘yicha qidirish…" }).fill(customer.tag);
  await page.getByRole("dialog", { name: "Yangi navbat" }).getByRole("button", { name: customer.name }).first().click();
  await expect(page.locator("#appt-vehicle option")).not.toHaveCount(1);
  await page.locator("#appt-vehicle").selectOption({ index: 1 });
  await page.locator("#appt-date").fill("2030-05-10");
  await page.locator("#appt-time").fill("10:00");
  const createdPromise = page.waitForResponse((response) => response.url().includes("/api/proxy/appointments/direct") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Navbat yaratish", exact: true }).click();
  const created = await createdPromise;
  expect(created.ok(), await created.text()).toBeTruthy();
  const appointmentId = (await created.json()).id;

  await page.locator("#queue-search").fill(customer.tag);
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
  const mechanicId = await page.locator("#edit-mechanic").inputValue();
  expect(mechanicId).toMatch(/^[0-9a-f-]{36}$/);
  const assignmentPromise = page.waitForResponse((response) =>
    response.url().includes(`/api/proxy/appointments/${appointmentId}`) && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "Saqlash" }).click();
  const assignment = await assignmentPromise;
  expect(assignment.ok(), await assignment.text()).toBeTruthy();
  expect((await assignment.json()).mechanic_user_id).toBe(mechanicId);

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
  await expect(page.locator("#print-invoice").getByText("HISOB-FAKTURA", { exact: true })).toBeVisible();
  await expect(page.getByText("Diagnostika")).toBeVisible();
  await expect(page.locator("#print-invoice")).toContainText("UZS");
  await expect(page.getByRole("button", { name: "Chop etish / PDF saqlash" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto(invoiceUrl);
  await expect(page.locator("#print-invoice").getByText("HISOB-FAKTURA", { exact: true })).toBeVisible();
  await expect(page.locator("#print-invoice")).toContainText("UZS");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#print-invoice")).toHaveCSS("position", "fixed");
  await expect(page.locator("#print-invoice")).toHaveCSS("border-top-width", "0px");
  await expect(page.locator("#print-invoice")).toBeVisible();
  await page.pdf({ path: info.outputPath("invoice-print.pdf"), format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });

  expect((await page.request.post("/api/auth/login", { data: { email: owner.email, password: owner.password } })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: "garageos_locale", value: "uz", url: baseURL! }]);
  await page.goto("/appointments");
  await page.locator("#queue-search").fill(customer.tag);
  await expect(row).toBeVisible();
  await actions().click();
  await page.getByText("Hisob yaratish / ochish", { exact: true }).click();
  await expect(page).toHaveURL(invoiceUrl);
});

test("calendar completion records the performed work in vehicle history", async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: CREDS });
  expect(login.ok()).toBeTruthy();
  await page.context().addCookies([{ name: "garageos_locale", value: "uz", url: "http://localhost:3001" }]);

  const customers = await page.request.get("/api/proxy/customers?limit=200");
  const customer = (await customers.json()).items.find((item: { vehicle_count: number }) => item.vehicle_count > 0);
  const detail = await page.request.get(`/api/proxy/customers/${customer.id}`);
  const vehicleId = (await detail.json()).vehicles[0].id;
  const mechanics = await page.request.get("/api/proxy/cases/mechanics");
  const mechanicName = (await mechanics.json())[0].name;
  const date = new Date().toISOString().slice(0, 10);
  const nextDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const calendar = await page.request.get(`/api/proxy/calendar?start=${date}&end=${nextDate}`);
  expect(calendar.ok()).toBeTruthy();
  const scheduled = (await calendar.json()).appointments as {
    mechanic_name: string | null; appointment_time: string; estimated_duration_minutes: number;
  }[];
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const start = Array.from({ length: 19 }, (_, index) => 480 + index * 30).find((candidate) =>
    !scheduled.some((item) => item.mechanic_name === mechanicName &&
      candidate < minutes(item.appointment_time) + item.estimated_duration_minutes &&
      candidate + 60 > minutes(item.appointment_time)));
  expect(start).toBeDefined();
  const appointmentTime = `${String(Math.floor(start! / 60)).padStart(2, "0")}:${String(start! % 60).padStart(2, "0")}`;

  const created = await page.request.post("/api/proxy/appointments/direct", { data: {
    customer_id: customer.id, vehicle_id: vehicleId,
    appointment_date: date, appointment_time: appointmentTime,
    estimated_duration_minutes: 60, mechanic_name: mechanicName,
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const appointmentId = (await created.json()).id;
  expect((await page.request.patch(`/api/proxy/appointments/${appointmentId}/confirm`)).ok()).toBeTruthy();
  expect((await page.request.patch(`/api/proxy/appointments/${appointmentId}/start`)).ok()).toBeTruthy();

  await page.goto("/calendar");
  await page.getByRole("main").getByTestId(`calendar-appointment-${appointmentId}`).click();
  await page.getByRole("button", { name: "Ishni tugatish" }).click();
  await expect(page.getByRole("dialog", { name: "Ishni tugatish" })).toBeVisible();
  await page.locator("#complete-service-type").fill("Moy almashtirish");
  await page.locator("#complete-notes").fill("Dvigatel moyi va filtri almashtirildi");
  const completionPromise = page.waitForResponse((response) =>
    response.url().includes(`/api/proxy/appointments/${appointmentId}/complete`) && response.request().method() === "PATCH");
  await page.getByRole("dialog", { name: "Ishni tugatish" }).getByRole("button", { name: "Ishni tugatish" }).click();
  const completion = await completionPromise;
  expect(completion.ok(), await completion.text()).toBeTruthy();

  const appointment = await page.request.get(`/api/proxy/appointments/${appointmentId}`);
  expect((await appointment.json()).status).toBe("completed");
  const timeline = await page.request.get(`/api/proxy/vehicles/${vehicleId}/timeline`);
  const events = (await timeline.json()).events;
  expect(events.some((event: { title: string; detail?: string }) =>
    event.title.includes("Moy almashtirish") || event.detail?.includes("Moy almashtirish"))).toBeTruthy();
});
