// Visual-QA screenshot capture for GarageOS.
//
//   BASE_URL=http://localhost:3000 node scripts/capture.mjs
//
// Logs in through the real BFF (the /login form is pre-filled with the demo
// creds), then captures each polished surface at desktop width into
// docs/screenshots/. These PNGs double as marketing/documentation assets.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../../docs/screenshots");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 900 };

// Pages that render the same for everyone. Vehicle-detail is resolved live
// because it needs a real id.
const STATIC_SHOTS = [
  { name: "dashboard", path: "/dashboard" },
  { name: "calendar", path: "/calendar" },
  { name: "vehicles", path: "/vehicles" },
];

async function settle(page) {
  // Let network go idle, then give animations (gauges, count-ups) time to land.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // crisp, retina-quality PNGs
  });
  const page = await context.newPage();

  // --- Sign in (form is pre-filled with demo creds) ---
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

  const shots = [...STATIC_SHOTS];

  // Resolve a real vehicle id for the health-detail shot.
  try {
    const res = await page.request.get(`${BASE_URL}/api/proxy/vehicles?limit=1`);
    const body = await res.json();
    const first = Array.isArray(body) ? body[0] : body?.items?.[0];
    if (first?.id) shots.push({ name: "vehicle-health", path: `/vehicles/${first.id}` });
  } catch {
    /* non-fatal — skip the detail shot if the list call fails */
  }

  for (const shot of shots) {
    await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const file = resolve(OUT_DIR, `${shot.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`captured ${shot.name} -> ${file}`);
  }

  await browser.close();
  console.log(`\nDone. ${shots.length} screenshots in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
