import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Monorepo unit/integration test configuration.
 * jsdom + React Testing Library across workspace packages and the web app.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["packages/**/*.{test,spec}.{ts,tsx}", "apps/web/src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**", "**/playwright-report/**"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      // Regression floor for the current surface (design system + auth + app
      // composition). Raise these as feature modules gain their test suites.
      thresholds: {
        statements: 30,
        branches: 25,
        functions: 28,
        lines: 30
      }
    }
  }
});
