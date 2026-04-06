import { defineConfig, devices } from "@playwright/test";

const hasExternalBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const canBootEmbeddedBackend = process.platform !== "win32";
const shouldBootBackend = !hasExternalBaseUrl && canBootEmbeddedBackend;

/**
 * E2E tests for critical paths. Run with: yarn test:e2e
 * Start the app first: yarn dev (frontend) and yarn dev:backend (API).
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  webServer: hasExternalBaseUrl
    ? undefined
    : shouldBootBackend
      ? [
        {
          command: "set FRONTEND_URL=http://127.0.0.1:4173&& set PORT=3001&& set EMBEDDED_PG_EPHEMERAL=1&& npm.cmd --prefix backend run dev:with-db",
          url: "http://127.0.0.1:3001/api/health",
          reuseExistingServer: !process.env.CI,
          timeout: 180000,
        },
        {
          command: "node scripts/run-playwright-web-dev.mjs",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
      ]
      : {
          command: "node scripts/run-playwright-web-dev.mjs",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile-core\.spec\.ts/,
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile-core\.spec\.ts/,
    },
  ],
  timeout: 30000,
});
