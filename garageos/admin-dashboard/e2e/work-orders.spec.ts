import { expect, test, type Page } from "@playwright/test";

const CREDS = { email: "admin@demo.garageos.app", password: "demo1234" };

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", { data: CREDS });
  expect(response.ok(), "staff login should succeed").toBeTruthy();
}

test("reception can add a customer and vehicle during walk-in intake", async ({ page }) => {
  await login(page);
  const catalogResponse = await page.request.get("/api/proxy/vehicles/catalog");
  expect(catalogResponse.ok()).toBeTruthy();
  const catalog = await catalogResponse.json() as { id: string; models: { id: string }[] }[];
  const brand = catalog.find((item) => item.models.length > 0);
  test.skip(!brand, "demo tenant has no active vehicle catalog entries");

  const customerName = `Walk-in QA ${Date.now()}`;
  await page.goto("/work-orders", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "New walk-in" }).first().click();
  await page.getByRole("textbox", { name: "Customer", exact: true }).fill(customerName);
  await expect(page.getByRole("status")).toContainText("No customer matched");
  await page.getByRole("button", { name: "Add new customer" }).click();
  await page.getByLabel("Customer name").fill(customerName);
  const customerCreate = page.waitForResponse((response) =>
    response.url().includes("/api/proxy/customers") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save customer" }).click();
  expect((await customerCreate).status()).toBe(201);

  await page.getByRole("button", { name: "Add vehicle" }).click();
  await page.getByLabel("Make").selectOption(brand!.id);
  await page.getByLabel("Model").selectOption(brand!.models[0].id);
  await page.getByLabel("License plate").fill("QA-INTAKE");
  const vehicleCreate = page.waitForResponse((response) =>
    response.url().includes("/api/proxy/vehicles") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save vehicle" }).click();
  expect((await vehicleCreate).status()).toBe(201);

  await page.getByLabel("Service type").fill("E2E intake for new customer");
  const orderCreate = page.waitForResponse((response) =>
    response.url().includes("/api/proxy/work-orders") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create work order" }).click();
  expect((await orderCreate).status()).toBe(201);
  await expect(page.getByLabel("Work order details")).toBeVisible();
});

test("reception can create a walk-in work order on mobile and take it to ready", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });

  const customersResponse = await page.request.get("/api/proxy/customers?limit=100");
  expect(customersResponse.ok()).toBeTruthy();
  const customers = (await customersResponse.json()).items as { id: string; full_name: string }[];
  let selectedCustomer: { id: string; full_name: string; vehicle: { id: string; label: string } } | undefined;
  for (const customer of customers) {
    const profileResponse = await page.request.get(`/api/proxy/customers/${customer.id}`);
    if (!profileResponse.ok()) continue;
    const profile = await profileResponse.json();
    if (profile.vehicles?.length) {
      selectedCustomer = { ...customer, vehicle: profile.vehicles[0] };
      break;
    }
  }
  test.skip(!selectedCustomer, "demo tenant needs a customer with a vehicle");

  await page.goto("/work-orders", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "New walk-in" }).first().click();
  await page.getByRole("textbox", { name: "Customer", exact: true }).fill(selectedCustomer!.full_name);
  await page.getByRole("option", { name: selectedCustomer!.full_name }).click();
  await page.getByLabel("Vehicle", { exact: true }).selectOption(selectedCustomer!.vehicle.id);
  await page.getByLabel("Service type").fill("E2E brake inspection");

  const createResponse = page.waitForResponse((response) =>
    response.url().includes("/api/proxy/work-orders") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create work order" }).click();
  const createdResponse = await createResponse;
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();
  expect(created.appointment_id).toBeNull();
  const details = page.getByLabel("Work order details");
  await expect(details).toBeVisible();
  await expect(details.getByText("E2E brake inspection", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 375);
  await page.screenshot({ path: "test-results/work-orders-mobile.png", fullPage: true });

  const startResponse = page.waitForResponse((response) =>
    response.url().includes("/api/proxy/work-orders/") && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Start work" }).click();
  expect((await startResponse).status()).toBe(200);
  await page.getByLabel("Work performed").fill("Inspected pads and discs");
  const readyResponse = page.waitForResponse((response) =>
    response.url().includes("/api/proxy/work-orders/") && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Mark ready" }).click();
  expect((await readyResponse).status()).toBe(200);
  await expect(page.getByText("Ready", { exact: true }).first()).toBeVisible();
});

test("appointment handoff opens or creates its linked work order", async ({ page }) => {
  await login(page);
  const response = await page.request.get("/api/proxy/appointments?page=1&page_size=15");
  expect(response.ok()).toBeTruthy();
  const appointments = (await response.json()).items as {
    id: string; customer_name: string; vehicle_summary: string; status: string;
    work_order_id: string | null;
  }[];
  const candidate = appointments.find((appointment) =>
    !appointment.work_order_id && !["cancelled", "completed"].includes(appointment.status),
  );
  test.skip(!candidate, "first appointment page has no open unlinked appointment");

  await page.goto("/appointments", { waitUntil: "networkidle" });
  const row = page.locator(`[data-testid="appointment-row"][data-appointment-id="${candidate!.id}"]`);
  await row.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Create work order" }).click();
  await expect(page).toHaveURL(/\/work-orders\?order=[0-9a-f-]{36}/);
  await expect(page.getByTestId("work-order-card").first()).toBeVisible();
});
