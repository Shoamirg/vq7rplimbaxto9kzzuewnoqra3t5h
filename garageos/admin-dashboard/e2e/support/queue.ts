import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { translate, type Locale } from "../../lib/i18n/dictionaries";
import { settleMotion } from "./accessibility";

type Owner = { email: string; password: string; center_id: string };
type Profile = { model_id: string; vehicle_label: string; legacy_id: string; legacy_name: string; center_id: string };
export function queueProfiles(baseURL: string) {
  try {
    const fixture = JSON.parse(readFileSync(process.env.GARAGEOS_BROWSER_FIXTURE!, "utf8"));
    const origin = new URL(baseURL);
    if (!fixture.qa_only || fixture.base_origin !== origin.origin || origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)
      || fixture.issuer_profiles?.length !== 2 || fixture.queue_profiles?.length !== 2) throw new Error();
    return { owners: fixture.issuer_profiles as Owner[], queues: fixture.queue_profiles as Profile[] };
  } catch { throw new Error("Prepare the guarded isolated private queue browser fixture before this gate"); }
}
export async function queueLogin(page: Page, baseURL: string, locale: Locale, width: number, index = 0) {
  const fixture = queueProfiles(baseURL), owner = fixture.owners[index % 2], profile = fixture.queues[index % 2];
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/auth/login", { data: { email: owner.email, password: owner.password } })).ok()).toBeTruthy();
  await page.context().addCookies([{ name: "garageos_locale", value: locale, url: baseURL }]);
  return { fixture, owner, profile };
}
export async function queueCustomer(page: Page, profile: Profile) {
  const tag = `Q33${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const name = `${tag} Chinor <literal> & Очень длинное сохранённое имя клиента — O‘tkirbek Шерзод`;
  const phone = `+998${parseInt(randomUUID().replaceAll("-", "").slice(0, 8), 16).toString().padStart(10, "0")}`;
  const customer = await page.request.post("/api/proxy/customers", { data: { full_name: name, phone } });
  expect(customer.ok()).toBeTruthy(); const person = await customer.json();
  const plate = tag.toUpperCase();
  const vehicle = await page.request.post("/api/proxy/vehicles", { data: { customer_id: person.id, vehicle_model_id: profile.model_id, year: 2024, license_plate: plate } });
  expect(vehicle.ok()).toBeTruthy();
  return { tag, name, plate, customer_id: person.id as string, vehicle_id: (await vehicle.json()).id as string };
}
export async function queueJob(page: Page, person: { customer_id: string; vehicle_id: string }, date: string, duration = 60, user?: string) {
  const response = await page.request.post("/api/proxy/appointments/direct", { data: { ...person,
    appointment_date: date, appointment_time: "10:00", estimated_duration_minutes: duration,
    service_type: "QA33 diagnostic <literal> & Диагностика", ...(user ? { mechanic_user_id: user } : {}) } });
  expect(response.ok()).toBeTruthy(); return (await response.json()).id as string;
}
export async function queueStored(page: Page, id: string) {
  const response = await page.request.get(`/api/proxy/appointments/${id}`); expect(response.ok()).toBeTruthy(); return response.json();
}
export async function queueAction(page: Page, row: Locator, locale: Locale, key: string) {
  await row.getByRole("button", { name: translate(locale, "work.actions"), exact: true }).click();
  await page.getByRole("menuitem", { name: translate(locale, key), exact: true }).click();
}
export async function queueTargets(page: Page, root: Locator) {
  await settleMotion(page);
  const small = await root.evaluate(el => Array.from(el.querySelectorAll<HTMLElement>('button,a,input,select,textarea,[role="menuitem"]')).filter(control => {
    const s = getComputedStyle(control), b = control.getBoundingClientRect();
    return !control.matches(':disabled,[aria-disabled="true"]') && !control.closest('[inert],[aria-hidden="true"]') && s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0;
  }).map(control => {
    const target = control instanceof HTMLInputElement && control.type === "checkbox" ? control.labels?.[0] || control : control;
    const box = target.getBoundingClientRect(); return { name: control.getAttribute("aria-label") || control.innerText.slice(0, 40), width: box.width, height: box.height };
  }).filter(box => box.width < 44 || box.height < 44));
  expect(small).toEqual([]);
}
export async function queueOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
export async function switchQueueLocale(page: Page, from: Locale, to: Locale) {
  await page.getByRole("button", { name: translate(from, "menu.language"), exact: true }).click();
  await page.getByRole("menuitem", { name: to === "uz" ? /Oʻzbek/ : to === "ru" ? /Русский/ : /English/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", to);
}
export function queueDate(offset: number) {
  const date = new Date(); date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
