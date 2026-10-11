/** Independent source-only owning guidance contract. Runtime remains pending.
 * Proposed English visible seam: name the dependent Vehicle and explain how
 * to close the picker and explicitly clear/change that dependency.
 */
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { queueLogin, queueCustomer } from "./support/queue";
import { translate } from "../lib/i18n/dictionaries";

test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe.configure({ retries: 0 });
const path = "/api/proxy/conversations", choicesPath = `${path}/choices`;
const t = (key: string) => translate("en", key);
const rootForm = (page: Page) => page.getByRole("dialog", { name: t("inbox.create.title"), exact: true });
async function picker(page: Page, kind: "customer" | "vehicle") {
  await rootForm(page).getByRole("button", { name: t(`inbox.choice.${kind}`), exact: true }).click();
  const current = page.getByRole("dialog", { name: t(`inbox.choice.${kind}`), exact: true });
  await expect(current).toBeVisible(); return current;
}

test("Inbox explains the retained Vehicle dependency when a different real customer has no compatible choices", async ({ page, baseURL }) => {
  const { profile } = await queueLogin(page, baseURL!, "en", 390);
  const a = await queueCustomer(page, profile), b = await queueCustomer(page, profile);
  const unfiltered = await page.request.get(`${choicesPath}?kind=customer&q=${b.customer_id}&limit=50&offset=0`);
  expect(unfiltered.status()).toBe(200); const available = await unfiltered.json();
  expect(available.total).toBe(1); expect(available.items.map((row: { id: string }) => row.id)).toEqual([b.customer_id]);
  await page.goto("/inbox");
  await page.getByRole("button", { name: t("inbox.create.title"), exact: true }).click();
  const root = rootForm(page), subject = `QA39 retained dependency ${randomUUID()}`;
  await root.getByRole("textbox", { name: t("inbox.create.subject"), exact: true }).fill(subject);
  let posts = 0;
  const observe = (r: import("@playwright/test").Request) => { if (r.method() === "POST" && new URL(r.url()).pathname === path) posts++; };
  page.on("request", observe);
  try {
    const vehicles = await picker(page, "vehicle");
    await vehicles.getByRole("textbox", { name: t("inbox.choice.search"), exact: true }).fill(a.vehicle_id);
    const vehicleOption = vehicles.getByRole("button").filter({ has: page.getByText(a.vehicle_id, { exact: true }) });
    await expect(vehicleOption).toHaveCount(1); await vehicleOption.click();
    await expect(root.getByText(a.vehicle_id, { exact: true })).toBeVisible();
    await expect(root.getByText(a.customer_id, { exact: true })).toHaveCount(0); // No inferred customer selection.

    const customers = await picker(page, "customer");
    const response = page.waitForResponse(result => {
      const url = new URL(result.url());
      return result.request().method() === "GET" && url.pathname === choicesPath
        && url.searchParams.get("kind") === "customer" && url.searchParams.get("q") === b.customer_id
        && url.searchParams.get("vehicle_id") === a.vehicle_id && !url.searchParams.has("customer_id")
        && url.searchParams.get("offset") === "0";
    });
    await customers.getByRole("textbox", { name: t("inbox.choice.search"), exact: true }).fill(b.customer_id);
    const actual = await response; expect(actual.status()).toBe(200);
    const bounded = await actual.json(); expect(bounded.total).toBe(0); expect(bounded.items).toEqual([]);
    await expect(customers.getByText(t("inbox.choice.empty"), { exact: true })).toBeVisible();
    // This is an explicit proposed copy seam, not an invented response/status.
    await expect(customers.getByText("Current dependent selections: Vehicle. Close this picker and clear or change those selections before choosing another customer or vehicle.", { exact: true })).toBeVisible();
    await customers.getByRole("button", { name: t("common.close"), exact: true }).click();
    await expect(root.getByText(a.vehicle_id, { exact: true })).toBeVisible();
    await expect(root.getByText(b.customer_id, { exact: true })).toHaveCount(0);
    await expect(root.getByRole("textbox", { name: t("inbox.create.subject"), exact: true })).toHaveValue(subject);
    expect(posts).toBe(0);

    const clearVehicle = await picker(page, "vehicle");
    await clearVehicle.getByRole("button", { name: t("inbox.choice.clear"), exact: true }).click();
    await expect(root.getByText(a.vehicle_id, { exact: true })).toHaveCount(0);
    const corrected = await picker(page, "customer");
    await corrected.getByRole("textbox", { name: t("inbox.choice.search"), exact: true }).fill(b.customer_id);
    const customerOption = corrected.getByRole("button").filter({ has: page.getByText(b.customer_id, { exact: true }) });
    await expect(customerOption).toHaveCount(1); await customerOption.click();
    await expect(root.getByText(b.customer_id, { exact: true })).toBeVisible();
    await expect(root.getByRole("textbox", { name: t("inbox.create.subject"), exact: true })).toHaveValue(subject);
    expect(posts).toBe(0);
  } finally { page.off("request", observe); }
});
