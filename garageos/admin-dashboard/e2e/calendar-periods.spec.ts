import { expect, test } from "@playwright/test";

test.use({ trace: "off" });

test("calendar week and month load actual periods and preserve account on a time move", async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: { email: "admin@demo.garageos.app", password: "demo1234" } })).ok()).toBeTruthy();
  const customers = (await (await page.request.get("/api/proxy/customers?limit=200")).json()).items;
  const customer = customers.find((row: { vehicle_count: number }) => row.vehicle_count > 0);
  const vehicle = (await (await page.request.get(`/api/proxy/customers/${customer.id}`)).json()).vehicles[0];
  const mechanic = (await (await page.request.get("/api/proxy/mechanics")).json()).items[0];
  const response = await page.request.post("/api/proxy/appointments/direct", { data: {
    customer_id: customer.id, vehicle_id: vehicle.id, appointment_date: "2033-05-03",
    appointment_time: "10:00", mechanic_user_id: mechanic.id,
  } });
  expect(response.ok()).toBeTruthy();
  const job = await response.json();
  try {
    await page.context().addCookies([{ name: "garageos_locale", value: "en", url: "http://localhost:3001" }]);
    await page.goto("/calendar");
    await page.getByRole("main").getByRole("textbox", { name: "Calendar date", exact: true }).fill("2033-05-03");
    const card = page.getByTestId(`calendar-appointment-${job.id}`);
    await expect(card).toBeVisible();
    const weekResponse = page.waitForResponse(r => r.url().includes("/api/proxy/calendar?start=2033-05-02&end=2033-05-09"));
    await page.getByRole("button", { name: "Week", exact: true }).click();
    expect((await weekResponse).ok()).toBeTruthy();
    await expect(card).toBeVisible();
    const monthResponse = page.waitForResponse(r => r.url().includes("/api/proxy/calendar?start=2033-04-25&end=2033-06-06"));
    await page.getByRole("button", { name: "Month", exact: true }).click();
    expect((await monthResponse).ok()).toBeTruthy();
    await expect(card).toBeVisible();
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    const moved = page.waitForResponse(r => r.url().endsWith(`/api/proxy/appointments/${job.id}`) && r.request().method() === "PATCH");
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + 30 + 192, { steps: 8 });
    await page.mouse.up();
    const patched = await moved;
    expect(patched.ok()).toBeTruthy();
    expect(patched.request().postDataJSON()).not.toHaveProperty("mechanic_name");
    expect(patched.request().postDataJSON()).not.toHaveProperty("mechanic_user_id");
    const persisted = await page.request.get(`/api/proxy/appointments/${job.id}`);
    expect((await persisted.json()).appointment_time).toBe("11:00");
    expect((await persisted.json()).mechanic_user_id).toBe(mechanic.id);
  } finally {
    await page.request.patch(`/api/proxy/appointments/${job.id}/cancel`, { data: {} });
  }
});

test("coincident cancelled and unassigned visits remain reachable and long resize preserves duration", async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: { email: "admin@demo.garageos.app", password: "demo1234" } })).ok()).toBeTruthy();
  const customer = (await (await page.request.get("/api/proxy/customers?limit=200")).json()).items.find((row: { vehicle_count: number }) => row.vehicle_count > 0);
  const vehicle = (await (await page.request.get(`/api/proxy/customers/${customer.id}`)).json()).vehicles[0];
  const mechanics = (await (await page.request.get("/api/proxy/mechanics")).json()).items;
  const jobs: string[] = [];
  const create = async (time: string, mechanic?: string, duration = 60) => {
    const response = await page.request.post("/api/proxy/appointments/direct", { data: {
      customer_id: customer.id, vehicle_id: vehicle.id, appointment_date: "2033-06-04",
      appointment_time: time, estimated_duration_minutes: duration, ...(mechanic ? { mechanic_user_id: mechanic } : {}),
    } });
    expect(response.ok()).toBeTruthy(); const id = (await response.json()).id; jobs.push(id); return id;
  };
  try {
    const cancelled = await create("10:00", mechanics[0].id);
    expect((await page.request.patch(`/api/proxy/appointments/${cancelled}/cancel`, { data: {} })).ok()).toBeTruthy();
    const replacement = await create("10:00", mechanics[0].id);
    const first = await create("13:00"); const second = await create("13:00");
    const long = await create("10:00", mechanics[1].id, 300);
    await page.context().addCookies([{ name: "garageos_locale", value: "en", url: "http://localhost:3001" }]);
    await page.goto("/calendar");
    await page.getByRole("main").getByRole("textbox", { name: "Calendar date" }).fill("2033-06-04");
    await expect(page.getByTestId(`calendar-appointment-${replacement}`)).toBeVisible();
    await expect(page.getByTestId(`calendar-appointment-${cancelled}`)).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Show cancelled appointments" }).check();
    for (const id of [cancelled, replacement, first, second]) {
      const card = page.getByRole("main").getByTestId(`calendar-appointment-${id}`);
      await expect(card).toHaveCount(1);
      await card.click();
      const dialog = page.getByRole("dialog", { name: "Appointment details" });
      await expect(dialog).toBeVisible();
      if (id === cancelled) await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
      await expect(card).toBeFocused();
    }
    const handle = page.locator(`[data-calendar-resize="${long}"]`);
    await handle.focus();
    const resize = page.waitForResponse(r => r.url().endsWith(`/api/proxy/appointments/${long}`) && r.request().method() === "PATCH");
    await handle.press("ArrowDown");
    const result = await resize;
    expect(result.ok()).toBeTruthy(); expect((await result.json()).estimated_duration_minutes).toBe(315);
    const stored = (await (await page.request.get(`/api/proxy/appointments/${long}`)).json());
    expect(stored.estimated_duration_minutes).toBe(315); expect(stored.mechanic_user_id).toBe(mechanics[1].id);
  } finally { for (const id of jobs) await page.request.patch(`/api/proxy/appointments/${id}/cancel`, { data: {} }); }
});
