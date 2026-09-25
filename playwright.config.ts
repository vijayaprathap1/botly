import { defineConfig, devices } from "@playwright/test";

/**
 * Widget end-to-end tests. The fixture pages are served from a DIFFERENT origin
 * (localhost:4173) than the app (localhost:3000), exactly like a client's website.
 * The app must be running against a database seeded with the Ananya demo bot:
 *   - locally without Supabase: see README "Local test harness"
 *   - or point E2E_APP_URL at any deployment with the seed loaded.
 */
const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
const exe = process.env.PW_CHROMIUM_PATH || (process.env.PLAYWRIGHT_BROWSERS_PATH ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { launchOptions: exe ? { executablePath: exe } : {}, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile-375", use: { ...devices["iPhone SE"], browserName: "chromium", viewport: { width: 375, height: 667 } } },
  ],
  webServer: [
    { command: `node tests/e2e/serve-fixtures.mjs 4173 ${APP}`, port: 4173, reuseExistingServer: true },
    { command: `node tests/e2e/serve-fixtures.mjs 4174 ${APP}`, port: 4174, reuseExistingServer: true },
  ],
});
