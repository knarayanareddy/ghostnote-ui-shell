import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests.
 *
 * By default they are **hermetic**: Playwright boots a mock Supabase
 * (e2e/mock-supabase.mjs) plus the Vite dev server in `e2e` mode (.env.e2e),
 * so no real project, credentials or network access are needed and no real
 * notes are created.
 *
 * To run against a deployed instance instead:
 *   E2E_BASE_URL=https://your-app npm run e2e
 *
 * First run needs a browser: `npx playwright install chromium`.
 */
// Dedicated port: `dev:e2e` uses --strictPort so Playwright can never
// silently reuse a `npm run dev` server wired to the real project.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8090";
const hermetic = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: hermetic
    ? [
        {
          command: "node e2e/mock-supabase.mjs",
          url: "http://127.0.0.1:54399/__mock/health",
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          command: "npm run dev:e2e",
          url: "http://localhost:8090",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ]
    : undefined,
});
