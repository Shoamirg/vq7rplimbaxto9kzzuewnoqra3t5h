import type { Page, TestInfo } from "@playwright/test";
import { writeFileSync } from "node:fs";

type Event = { elapsed: number; phase: string; kind: string; method?: string; path?: string; status?: number; resetPresent?: boolean };
type Diagnostic = { started: number; phase: string; events: Event[] };
const diagnostics = new WeakMap<Page, Diagnostic>();
const selected = /confirmed different actor purges|late pre-logout staff verification|missing unwritable reset cookie/;

export function beginLifecycleDiagnostic(page: Page, info: TestInfo) {
  if (!selected.test(info.title)) return;
  const record: Diagnostic = { started: Date.now(), phase: "setup", events: [] };
  diagnostics.set(page, record);
  const relevant = (url: string) => {
    const path = new URL(url).pathname;
    return path === "/api/proxy/auth/me" || path === "/api/auth/login" || path === "/api/auth/logout"
      || /^\/api\/proxy\/conversations\/[\w-]+(?:\/(messages|read))?$/.test(path);
  };
  page.on("request", request => {
    if (relevant(request.url())) record.events.push({ elapsed: Date.now() - record.started,
      phase: record.phase, kind: "request", method: request.method(), path: new URL(request.url()).pathname });
  });
  page.on("response", response => {
    if (relevant(response.url())) record.events.push({ elapsed: Date.now() - record.started,
      phase: record.phase, kind: "response", method: response.request().method(), path: new URL(response.url()).pathname, status: response.status() });
  });
}
export async function lifecyclePhase(page: Page, phase: string) {
  const record = diagnostics.get(page); if (!record) return;
  record.phase = phase;
  const resetPresent = await page.evaluate(() => document.cookie.split(";").some(part => part.trim().startsWith("garageos_message_reset=")));
  record.events.push({ elapsed: Date.now() - record.started, phase, kind: "boundary", resetPresent });
}
export async function saveLifecycleDiagnostic(page: Page, info: TestInfo) {
  const record = diagnostics.get(page); if (!record) return;
  const path = info.outputPath("message-lifecycle-timing.json");
  writeFileSync(path, JSON.stringify({ title: info.title, status: info.status, events: record.events }, null, 2), "utf8");
  await info.attach("message-lifecycle-timing", { path, contentType: "application/json" });
  diagnostics.delete(page);
}
