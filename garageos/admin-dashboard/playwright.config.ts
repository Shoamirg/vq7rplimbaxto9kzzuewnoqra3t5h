import { defineConfig, devices } from "@playwright/test";

// E2E regression suite. Assumes the backend (:8000) and the Next dev/prod server
// are already running; point at either with BASE_URL.
//   npm run e2e                       # against http://localhost:3000
//   BASE_URL=https://staging npm run e2e
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shared demo DB — keep flows sequential
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000, // dev-server first-compile can be slow
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
