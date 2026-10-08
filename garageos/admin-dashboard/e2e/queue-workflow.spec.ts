import { expect, test, request } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { translate, type Locale } from "../lib/i18n/dictionaries";
import { makeFormatters } from "../lib/i18n/formatters";
import { assertAccessible, settleMotion } from "./support/accessibility";
import { queueAction, queueCustomer, queueLogin, queueOverflow, queueStored, queueTargets } from "./support/queue";

test.use({ trace: "off" });
for (const locale of ["en", "ru", "uz"] as Locale[]) {
  test(`queue booking work and invoice ${locale} phone`, async ({ page, baseURL }, info) => {
    test.setTimeout(150_000);
    const t = (key: string) => translate(locale, key), fmt = makeFormatters(locale);
    const { profile } = await queueLogin(page, baseURL!, locale, 360);
    const person = await queueCustomer(page, profile);
    const credentials = { email: `queue33-${randomUUID()}@example.com`, password: `QueueQA-${randomUUID()}` };
    const mechanicName = "QA33 usta <literal> & Очень длинное сохранённое имя Шерзод";
    const created = await page.request.post("/api/proxy/staff", { data: { ...credentials, full_name: mechanicName, role: "mechanic" } });
    expect(created.ok()).toBeTruthy(); const mechanic = await created.json();
    const native = await request.newContext({ baseURL }); let id: string | undefined, releaseAction = () => {};
    expect((await native.post("/api/auth/login", { data: credentials })).ok()).toBeTruthy();
    try {
      await page.goto("/appointments"); const root = page.getByTestId("appointments-queue");
      await root.getByRole("textbox", { name: t("work.search"), exact: true }).fill(person.tag);
      await expect(root.getByTestId("queue-records")).toContainText(t("work.empty"));
      await root.getByRole("button", { name: t("action.new_appointment"), exact: true }).click();
      const booking = page.getByRole("dialog", { name: t("appointment.new"), exact: true });
      await booking.getByRole("textbox", { name: t("crm.search_customers"), exact: true }).fill(person.tag);
      await booking.getByRole("button", { name: person.name }).click();
      await booking.locator("#appt-vehicle").selectOption(person.vehicle_id);
      await booking.locator("#appt-date").fill("2038-04-03"); await booking.locator("#appt-time").fill("10:00");
      await queueTargets(page, booking); await queueOverflow(page);
      const post = page.waitForResponse(r => r.url().endsWith("/api/proxy/appointments/direct") && r.request().method() === "POST");
      await booking.getByRole("button", { name: t("appointment.book"), exact: true }).click();
      const response = await post; expect(response.ok()).toBeTruthy(); id = (await response.json()).id;
      const row = root.getByTestId(`appointment-row-${id}`), trigger = row.getByRole("button", { name: t("work.actions"), exact: true });
      await expect(row).toBeVisible(); await queueAction(page, row, locale, "work.edit");
      const edit = page.getByRole("dialog", { name: t("appointment.edit"), exact: true });
      await expect(edit).toBeVisible(); await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
      await queueAction(page, row, locale, "work.edit"); await edit.locator("#edit-mechanic").selectOption(mechanic.id);
      await edit.locator("#edit-duration").selectOption("120");
      await edit.getByRole("button", { name: t("invoice.save"), exact: true }).click();
      await expect(edit).toHaveCount(0); await expect(row).toContainText(mechanicName);
      expect((await queueStored(page, id!)).mechanic_user_id).toBe(mechanic.id);
      expect((await native.get(`/api/proxy/mechanic/work/${id}`)).ok()).toBeTruthy();
      const heldAction = new Promise<void>(resolve => { releaseAction = resolve; }); let actionFetched = () => {}, dispatches = 0;
      const waitingAction = new Promise<void>(resolve => { actionFetched = resolve; });
      const confirmPath = `**/api/proxy/appointments/${id}/confirm`;
      await page.route(confirmPath, async route => {
        dispatches++; const actual = await route.fetch(); expect(actual.ok()).toBeTruthy(); actionFetched(); await heldAction; await route.fulfill({ response: actual });
      });
      await queueAction(page, row, locale, "work.confirm"); await waitingAction;
      await expect(trigger).toBeDisabled(); await trigger.press("Enter"); await trigger.press("Enter");
      releaseAction(); await expect(row).toContainText(t("status.confirmed")); await page.unroute(confirmPath); expect(dispatches).toBe(1);
      await queueAction(page, row, locale, "work.start"); await expect(row).toContainText(t("status.in_progress"));
      await queueAction(page, row, locale, "work.complete");
      const completion = page.getByRole("dialog", { name: t("work.complete"), exact: true });
      await expect(completion).toBeVisible(); await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
      await queueAction(page, row, locale, "work.complete");
      await completion.locator("#complete-service-type").fill("QA33 actual work <literal> & Диагностика");
      await completion.locator("#complete-notes").fill("Owned queue work record"); await queueTargets(page, completion); await queueOverflow(page);
      await completion.getByRole("button", { name: t("work.complete"), exact: true }).click();
      await expect(row).toContainText(t("status.completed"));
      expect((await queueStored(page, id!)).status).toBe("completed");
      const nativeWork = await (await native.get(`/api/proxy/mechanic/work/${id}`)).json(); expect(nativeWork.status).toBe("completed");
      // Let actual work notifications expire before opening the invoice; a
      // pointer outside a Radix dialog is intentionally a dismissal action.
      await expect(page.getByRole("alert").getByRole("button", { name: t("common.close"), exact: true })).toHaveCount(0);
      await queueAction(page, row, locale, "work.invoice_action");
      const invoice = page.getByRole("dialog", { name: t("invoice.new"), exact: true }); await expect(invoice).toBeVisible();
      await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
      await queueAction(page, row, locale, "work.invoice_action"); await expect(invoice).toBeVisible();
      await expect(invoice.locator("#inv-vehicle")).toHaveValue(person.vehicle_id); await expect(invoice.locator("#inv-vehicle")).toBeDisabled();
      await expect(invoice.getByRole("button", { name: t("invoice.create"), exact: true })).toBeDisabled();
      await invoice.getByRole("textbox", { name: t("invoice.description"), exact: true }).fill("QA33 actual work & Диагностика");
      await invoice.getByRole("spinbutton", { name: t("invoice.price"), exact: true }).fill("150000");
      await invoice.getByRole("button", { name: t("invoice.add_line"), exact: true }).click();
      await expect(invoice.getByRole("button", { name: t("invoice.create"), exact: true })).toBeDisabled();
      await invoice.getByRole("textbox", { name: t("invoice.description"), exact: true }).last().fill("QA33 discount");
      await invoice.getByRole("combobox", { name: t("invoice.lines"), exact: true }).last().selectOption("discount");
      await invoice.getByRole("spinbutton", { name: t("invoice.price"), exact: true }).last().fill("50000");
      await expect(invoice).toContainText(fmt.money(100000, "UZS"));
      await queueTargets(page, invoice); await queueOverflow(page);
      // Real Tab/ShiftTab remains trapped at both boundaries and inside.
      const firstControl = invoice.getByRole("button", { name: t("common.close"), exact: true });
      const lastControl = invoice.getByRole("button", { name: t("invoice.create"), exact: true });
      await firstControl.focus(); await page.keyboard.press("Shift+Tab"); await expect(lastControl).toBeFocused();
      await page.keyboard.press("Tab"); await expect(firstControl).toBeFocused();
      for (let n = 0; n < 12; n++) { await page.keyboard.press(n % 3 ? "Tab" : "Shift+Tab"); expect(await invoice.evaluate(el => el.contains(document.activeElement))).toBe(true); }
      await settleMotion(page); await assertAccessible(page, info, "queue-invoice");
      await invoice.evaluate(el => { el.scrollTop = 0; }); await page.screenshot({ path: info.outputPath("queue-invoice.png") });
      await lastControl.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("queue-invoice-footer.png") });
      const saved = page.waitForResponse(r => r.url().endsWith("/api/proxy/invoices") && r.request().method() === "POST");
      await invoice.getByRole("button", { name: t("invoice.create"), exact: true }).click();
      const savedResponse = await saved; expect(savedResponse.ok()).toBeTruthy(); const doc = await savedResponse.json();
      expect(savedResponse.request().postDataJSON()).toMatchObject({ appointment_id: id, customer_id: person.customer_id, vehicle_id: person.vehicle_id, tax_rate: 0 });
      expect(doc.total).toBe(100000); expect(doc.currency).toBe("UZS"); expect(doc.status).toBe("issued");
      await expect(page).toHaveURL(new RegExp(`/invoice/${doc.id}$`));
      await page.goto("/appointments"); await root.getByRole("textbox", { name: t("work.search"), exact: true }).fill(person.tag);
      await expect(row.getByRole("group", { name: t("work.billing"), exact: true })).toContainText(t("public.status_issued"));
      await expect(row).toContainText(doc.code);
      for (const [status, amount, balance] of [["partial", 25000, 75000], ["paid", 75000, 0]] as const) {
        const payment = await page.request.post(`/api/proxy/invoices/${doc.id}/payments`, { data: { amount, method: "cash" } });
        expect(payment.ok()).toBeTruthy();
        await root.getByRole("button", { name: t("queue.refresh"), exact: true }).click();
        await expect(row.getByRole("group", { name: t("work.billing"), exact: true })).toContainText(t(`public.status_${status}`));
        await expect(row.getByRole("group", { name: t("work.billing"), exact: true })).toContainText(fmt.money(balance, "UZS"));
      }
      await settleMotion(page); await assertAccessible(page, info, "queue-paid");
      await expect(page.getByRole("alert").getByRole("button", { name: t("common.close"), exact: true })).toHaveCount(0);
      await row.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("queue-paid.png") });
      await queueAction(page, row, locale, "work.invoice_action"); await expect(page).toHaveURL(new RegExp(`/invoice/${doc.id}$`));
    } finally {
      releaseAction(); await page.unrouteAll({ behavior: "wait" });
      if (id) await page.request.patch(`/api/proxy/appointments/${id}/cancel`, { data: {} });
      await page.request.patch(`/api/proxy/staff/${mechanic.id}`, { data: { is_active: false } }); await native.dispose();
    }
  });
}
