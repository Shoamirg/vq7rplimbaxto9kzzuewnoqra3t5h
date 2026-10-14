import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { queueLogin, queueCustomer, queueProfiles } from "./queue";

export function operationsProfiles(baseURL: string) {
  const { owners } = queueProfiles(baseURL);
  try {
    const fixture = JSON.parse(readFileSync(process.env.GARAGEOS_BROWSER_FIXTURE!, "utf8"));
    if (fixture.operations_profiles?.length !== 2 || fixture.operations_profiles.some((p: { center_id: string }, i: number) => p.center_id !== owners[i].center_id)) throw new Error();
    return fixture.operations_profiles as { center_id: string; duplicate_name: string; duplicate_ids: string[]; all_ids: string[]; legacy_id: string; legacy_title: string; legacy_code: string; legacy_customer: string }[];
  } catch { throw new Error("Prepare the guarded private Operations browser fixture before this gate"); }
}
export async function operationCases(page: Page, baseURL: string, count = 2, owner = 0) {
  const { profile } = await queueLogin(page, baseURL, "en", 1280, owner);
  const person = await queueCustomer(page, profile);
  const items: { id: string; code: string; title: string }[] = [];
  for (let i = 0; i < count; i++) {
    const title = `${person.tag} ${i === 0 ? "old-only Русский O‘tkir %_\\" : `current ${i}`}`;
    const response = await page.request.post("/api/proxy/cases", { data: { customer_id: person.customer_id, vehicle_id: person.vehicle_id, title, case_type: "support" } });
    expect(response.ok()).toBeTruthy(); items.push(await response.json());
  }
  return { person, items };
}
export const caseRow = (page: Page, code: string) => page.getByRole("button").filter({ has: page.getByText(code, { exact: true }) });
export async function storedCase(page: Page, id: string) {
  const response = await page.request.get(`/api/proxy/cases/${id}`); expect(response.ok()).toBeTruthy(); return response.json();
}
export async function storedThread(page: Page, id: string) {
  const response = await page.request.get(`/api/proxy/cases/${id}/conversation`); expect(response.ok()).toBeTruthy(); return response.json();
}
