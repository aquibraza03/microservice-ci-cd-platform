import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end test configuration.
 *
 * Runs the Next.js dev server in-process. Auth is exercised with the
 * development provider (`NEXT_PUBLIC_AUTH_PROVIDER=dev`) so tests are
 * deterministic without a backend; production flows use the `jwt` strategy.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "npm run dev -- --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_AUTH_PROVIDER: "dev",
      NEXT_PUBLIC_AUTH_ENABLED: "true",
      NEXT_PUBLIC_DASHBOARD_SOURCE: "dev",
      NEXT_PUBLIC_FEATURE_PIPELINES: "true",
      NEXT_PUBLIC_FEATURE_DEPLOYMENTS: "true",
      NEXT_PUBLIC_FEATURE_OBSERVABILITY: "true"
    }
  }
});
