/** Standalone synthetic diagnostic contracts; no application/database needed.
 * These prove observation semantics, not historical product root causes.
 */
import { expect, test, type TestInfo } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { settleMotion } from "./support/accessibility";
import { withFailureDiagnostics } from "./support/failure-diagnostics";

test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe.configure({ retries: 0 });

function syntheticOrigin(baseURL: string | undefined) {
  const url = new URL(baseURL!);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)
      || url.username || url.password) throw new Error("Use the owned loopback browser origin");
  return url.origin;
}

async function jsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? jsonFiles(path) : [path];
  }));
  return nested.flat();
}

// This deliberately permits safe implementation extension only through numeric,
// boolean or null fields. Arbitrary browser strings require an explicit enum.
const SAFE_STRINGS = new Set([
  "fonts", "animations", "settled", "failure", "loading", "loaded", "unloaded", "error",
  "idle", "pending", "running", "paused", "finished", "Infinity",
  "request", "response", "requestfailed", "target", "auth", "other",
  "GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD",
  "pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "mousemove", "click",
  "none", "failed", "aborted", "network", "timeout", "unknown",
  "diagnostic-font", "diagnostic-animation", "diagnostic-private-failure", "diagnostic-private-success",
]);
function assertSafeJson(value: unknown, depth = 0) {
  expect(depth).toBeLessThanOrEqual(8);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") { expect(Number.isFinite(value)).toBe(true); return; }
  if (typeof value === "string") { expect(SAFE_STRINGS.has(value)).toBe(true); return; }
  if (Array.isArray(value)) {
    expect(value.length).toBeLessThanOrEqual(64);
    value.forEach(item => assertSafeJson(item, depth + 1)); return;
  }
  expect(typeof value).toBe("object");
  const object = value as Record<string, unknown>;
  expect(Object.keys(object).length).toBeLessThanOrEqual(32);
  for (const [key, item] of Object.entries(object)) {
    // Keys are schema, never DOM attributes, URL/body parameters or private labels.
    expect(key).toMatch(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/);
    assertSafeJson(item, depth + 1);
  }
}

type MotionState = {
  phase: "fonts" | "animations";
  elapsedMs: number;
  fonts: { status: "loading" | "loaded" };
  animations: { playState: string; currentTime: number | null; startTime: number | null;
    duration: number | null; iterations: number | "Infinity" | null }[];
};
async function motionState(info: TestInfo): Promise<MotionState | undefined> {
  try {
    const raw = await readFile(info.outputPath("motion-state.json"), "utf8");
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(32_768);
    const value = JSON.parse(raw) as MotionState;
    assertSafeJson(value); return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    // Atomic replacement is preferred. Never hide malformed/unsafe diagnostics.
    throw error;
  }
}

test("motion diagnostics observe the original font wait while a real font remains held", async ({ page, baseURL }, info) => {
  const origin = syntheticOrigin(baseURL);
  const source = `${origin}/__qa_diagnostics/font.html`;
  const fontURL = `${origin}/__qa_diagnostics/font.ttf`;
  const fontPath = resolve(process.cwd(), "../flutter_app/assets/fonts/DMSans-Regular.ttf");
  let release!: () => void;
  const held = new Promise<void>(done => { release = done; });
  let requested = false, finished = false;
  let waiting: Promise<void> | undefined;
  await page.route(source, route => route.fulfill({ contentType: "text/html", body:
    `<link rel="icon" href="data:,"><style>@font-face{font-family:QADiagnosticFont;src:url('${fontURL}') format('truetype')}body{font-family:QADiagnosticFont}</style><p>Diagnostic font fixture</p>` }));
  await page.route(fontURL, async route => {
    requested = true; await held;
    await route.fulfill({ path: fontPath, contentType: "font/ttf" });
  });
  try {
    await page.goto(source, { waitUntil: "domcontentloaded" });
    await expect.poll(() => requested).toBe(true);
    expect(await page.evaluate(() => document.fonts.status)).toBe("loading");
    // Add observation only; this remains the original document.fonts.ready wait.
    waiting = settleMotion(page, info).then(() => { finished = true; });
    let state: MotionState | undefined;
    await expect.poll(async () => { state = await motionState(info); return state?.phase; },
      { timeout: 5_000 }).toBe("fonts");
    expect(state!.fonts.status).toBe("loading");
    expect(state!.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(finished).toBe(false);
    expect(await page.evaluate(() => document.fonts.status)).toBe("loading");
  } finally {
    // Release only this test's font request. No document-wide cancellation.
    release();
    try { if (waiting) await waiting; } finally { await page.unrouteAll({ behavior: "wait" }); }
  }
  expect(finished).toBe(true);
  expect(await page.evaluate(() => document.fonts.status)).toBe("loaded");
  expect(await page.evaluate(() => Array.from(document.fonts).map(font => font.status))).toEqual(["loaded"]);
});

test("motion diagnostics observe the original finished wait of an owned paused finite animation", async ({ page, baseURL }, info) => {
  const origin = syntheticOrigin(baseURL), source = `${origin}/__qa_diagnostics/animation.html`;
  let waiting: Promise<void> | undefined, finished = false, ownsAnimation = false;
  await page.route(source, route => route.fulfill({ contentType: "text/html",
    body: "<link rel='icon' href='data:,'><div id='qa-animation' style='width:60px;height:60px'>Animation fixture</div>" }));
  try {
    await page.goto(source, { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      const animation = document.getElementById("qa-animation")!.animate(
        [{ opacity: 1 }, { opacity: 0.5 }], { duration: 60_000, iterations: 1 });
      (window as unknown as { qaOwnedAnimation: Animation }).qaOwnedAnimation = animation;
      animation.pause(); await animation.ready;
    });
    ownsAnimation = true;
    expect(await page.evaluate(() => (window as unknown as { qaOwnedAnimation: Animation }).qaOwnedAnimation.playState)).toBe("paused");
    waiting = settleMotion(page, info).then(() => { finished = true; });
    let state: MotionState | undefined;
    await expect.poll(async () => { state = await motionState(info); return state?.phase; },
      { timeout: 5_000 }).toBe("animations");
    expect(state!.fonts.status).toBe("loaded");
    expect(state!.animations).toEqual(expect.arrayContaining([expect.objectContaining({
      playState: "paused", duration: 60_000, iterations: 1,
    })]));
    const paused = state!.animations.find(animation => animation.playState === "paused")!;
    expect(typeof paused.currentTime).toBe("number");
    expect(finished).toBe(false);
  } finally {
    // Finish exactly the finite animation this test created; leave all others alone.
    if (ownsAnimation) await page.evaluate(() => (window as unknown as { qaOwnedAnimation: Animation }).qaOwnedAnimation.finish());
    try { if (waiting) await waiting; } finally { await page.unrouteAll({ behavior: "wait" }); }
  }
  expect(finished).toBe(true);
});

test("failure diagnostics preserve the same error and capture only classified network and trusted pointer state", async ({ page, baseURL }, info) => {
  const origin = syntheticOrigin(baseURL), canary = `PRIVATE_DIAGNOSTIC_${randomUUID()}`;
  const source = `${origin}/__qa_diagnostics/privacy.html`;
  const targetPath = "/api/proxy/conversations/11111111-1111-4111-8111-111111111111/follow";
  const sentinel = new Error(canary);
  await page.route(source, route => route.fulfill({ contentType: "text/html", body:
    `<link rel="icon" href="data:,"><button style="position:absolute;left:80px;top:50px;width:180px;height:60px">${canary}</button><p>${canary}</p>` }));
  await page.route(`${origin}${targetPath}**`, route => route.request().method() === "DELETE"
    ? route.abort("failed") : route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ privateBody: canary }) }));
  await page.route(`${origin}/api/proxy/auth/me**`, route => route.fulfill({ status: 403,
    contentType: "application/json", body: JSON.stringify({ privateAuthBody: canary }) }));
  await page.route(`${origin}/__qa_private/**`, route => route.fulfill({ status: 200,
    contentType: "text/plain", body: canary }));
  let received: unknown;
  try {
    await page.goto(source, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      (window as unknown as { qaTrustedPointer?: boolean }).qaTrustedPointer = false;
      document.querySelector("button")!.addEventListener("pointerup", event => {
        (window as unknown as { qaTrustedPointer?: boolean }).qaTrustedPointer = event.isTrusted;
      });
    });
    const success = { numeric: 7 };
    expect(await withFailureDiagnostics(page, info, "diagnostic-private-success", async () => success)).toBe(success);
    try {
      await withFailureDiagnostics(page, info, "diagnostic-private-failure", async () => {
        await page.getByRole("button", { name: canary, exact: true }).click();
        expect(await page.evaluate(() => (window as unknown as { qaTrustedPointer?: boolean }).qaTrustedPointer)).toBe(true);
        const pageError = page.waitForEvent("pageerror");
        await page.evaluate(marker => {
          console.error(marker); setTimeout(() => { throw new Error(marker); }, 0);
        }, canary);
        await pageError;
        await page.evaluate(async ({ marker, path }) => {
          await fetch(`${path}?private=${encodeURIComponent(marker)}`, { method: "POST",
            headers: { "Content-Type": "application/json", "X-QA-Private": marker, Authorization: `Bearer ${marker}` },
            body: JSON.stringify({ privateCredential: marker }) });
          await fetch(`/api/proxy/auth/me?private=${encodeURIComponent(marker)}`);
          await fetch(`/__qa_private/${marker}?private=${marker}`);
          await fetch(`${path}?private=${marker}`, { method: "DELETE" }).catch(() => {});
        }, { marker: canary, path: targetPath });
        throw sentinel;
      }, { targetPath, followingLabel: canary });
    } catch (error) { received = error; }
    expect(received).toBe(sentinel);
    const files = await jsonFiles(info.outputDir);
    expect(files.length).toBeGreaterThan(0);
    const receipts: Record<string, unknown>[] = [];
    for (const file of files) {
      // Synthetic secret appears in DOM/error/console, therefore screenshots,
      // HTML, arbitrary logs and traces are prohibited diagnostic artifacts.
      expect(file.endsWith(".json")).toBe(true);
      expect(file).not.toContain(canary);
      const raw = await readFile(file, "utf8");
      expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(32_768);
      expect(raw).not.toContain(canary);
      expect(raw).not.toContain("privateCredential");
      expect(raw).not.toContain("X-QA-Private");
      expect(raw).not.toContain('"totalPhysicalBytes"'); // Ordinary errors never run the host probe.
      const value = JSON.parse(raw); assertSafeJson(value); receipts.push(value);
    }
    // Proposed receipt schema: requests[].{event,method,kind,status?} and
    // pointer.{isTrusted,button,buttons,x,y,type?}; no raw URL/selector/label.
    const records = receipts.flatMap(receipt => (receipt.requests ?? []) as Record<string, unknown>[]);
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "request", method: "POST", kind: "target" }),
      expect.objectContaining({ event: "response", method: "POST", kind: "target", status: 201 }),
      expect.objectContaining({ event: "response", method: "GET", kind: "auth", status: 403 }),
      expect.objectContaining({ event: "requestfailed", method: "DELETE", kind: "target" }),
      expect.objectContaining({ event: "response", method: "GET", kind: "other", status: 200 }),
    ]));
    const pointer = receipts.map(receipt => receipt.pointer).find(Boolean) as Record<string, unknown>;
    expect(pointer).toMatchObject({ isTrusted: true, button: 0, buttons: 0, x: 170, y: 80 });
    for (const attachment of info.attachments) {
      expect(attachment.contentType).toBe("application/json");
      expect(attachment.name).not.toContain(canary);
      const raw = attachment.path ? await readFile(attachment.path, "utf8") : attachment.body?.toString("utf8") ?? "";
      expect(raw).not.toContain(canary);
    }
  } finally {
    await page.mouse.up();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("no-buffer diagnostic preserves the synthetic failure and records only bounded host aggregates", async ({ page }, info) => {
  // Observer contract only: this is neither a real navigation nor a historical
  // ERR_NO_BUFFER_SPACE reproduction. No server, network request or DB is used.
  const canary = `PRIVATE_DIAGNOSTIC_${randomUUID()}`;
  const sentinel = new Error(`net::ERR_NO_BUFFER_SPACE ${canary} http://198.51.100.23:45678/private?secret=${canary}`);
  let received: unknown;
  try {
    await withFailureDiagnostics(page, info, "diagnostic-private-failure", async () => { throw sentinel; });
  } catch (error) { received = error; }
  expect(received).toBe(sentinel);

  const files = await jsonFiles(info.outputDir);
  expect(files.length).toBeGreaterThan(0);
  const aggregates: Record<string, unknown>[] = [];
  const findAggregate = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(findAggregate); return; }
    const object = value as Record<string, unknown>;
    // Permit a separate host JSON file or nesting inside the failure receipt.
    if (Object.hasOwn(object, "availablePhysicalBytes") && Object.hasOwn(object, "totalPhysicalBytes")) {
      aggregates.push(object);
    }
    Object.values(object).forEach(findAggregate);
  };
  for (const file of files) {
    expect(file.endsWith(".json")).toBe(true);
    expect(file).not.toContain(canary);
    const raw = await readFile(file, "utf8");
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(32_768);
    expect(raw).not.toContain(canary);
    expect(raw).not.toContain("ERR_NO_BUFFER_SPACE");
    expect(raw).not.toContain("198.51.100.23");
    const value = JSON.parse(raw); assertSafeJson(value); findAggregate(value);
  }
  expect(aggregates.length, "The selected error must produce meaningful host observation").toBeGreaterThan(0);
  const permitted = new Set(["availablePhysicalBytes", "totalPhysicalBytes", "processRssBytes",
    "tcpTotal", "tcpTimeWait", "tcpLocalPortCount", "tcpListenerCount", "probeCompleted"]);
  for (const host of aggregates) {
    expect(Object.keys(host).every(key => permitted.has(key))).toBe(true);
    expect(typeof host.probeCompleted).toBe("boolean");
    expect(typeof host.totalPhysicalBytes).toBe("number");
    expect(typeof host.availablePhysicalBytes).toBe("number");
    expect(Number.isFinite(host.totalPhysicalBytes)).toBe(true);
    expect(Number.isFinite(host.availablePhysicalBytes)).toBe(true);
    expect(host.totalPhysicalBytes as number).toBeGreaterThan(0);
    expect(host.availablePhysicalBytes as number).toBeGreaterThanOrEqual(0);
    expect(host.availablePhysicalBytes as number).toBeLessThanOrEqual(host.totalPhysicalBytes as number);
    for (const key of ["processRssBytes", "tcpTotal", "tcpTimeWait", "tcpLocalPortCount", "tcpListenerCount"]) {
      if (!Object.hasOwn(host, key) || host[key] === null) continue;
      expect(typeof host[key]).toBe("number");
      expect(Number.isFinite(host[key])).toBe(true);
      expect(host[key] as number).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(host[key])).toBe(true);
    }
  }
  for (const attachment of info.attachments) {
    expect(attachment.contentType).toBe("application/json");
    expect(attachment.name).not.toContain(canary);
    const raw = attachment.path ? await readFile(attachment.path, "utf8") : attachment.body?.toString("utf8") ?? "";
    expect(raw).not.toContain(canary);
    expect(raw).not.toContain("ERR_NO_BUFFER_SPACE");
    expect(raw).not.toContain("198.51.100.23");
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(32_768);
    assertSafeJson(JSON.parse(raw));
  }
});
