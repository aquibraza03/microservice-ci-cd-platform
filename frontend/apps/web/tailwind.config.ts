import type { Config } from "tailwindcss";

// Shared design-token preset (CJS, intentionally consumed via require so no
// declaration file is needed at the package boundary).
const preset = require("@saas/config/tailwind-preset");

/**
 * Tailwind configuration for the web application.
 *
 * Consumes the shared design-token preset from `@saas/config`. Content globs
 * cover both this app and the workspace packages that ship Tailwind classes
 * (design system, feature modules).
 */
const config: Config = {
  presets: [preset],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/features/**/*.{ts,tsx}"
  ]
};

export default config;
