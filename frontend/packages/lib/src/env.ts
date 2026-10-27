import { z } from "zod";
import { isServer } from "@saas/utils";

/**
 * Environment resolver.
 *
 * Centralizes ALL frontend environment access. Components, services, and
 * features must read configuration through `getConfig()` / `env` and never
 * touch `process.env` directly. This keeps the configuration surface auditable
 * and testable, and guarantees that no URL or endpoint is hardcoded in code.
 */

const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const intish = z.coerce.number().int();

const envSchema = z
  .object({
    // Runtime
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_PUBLIC_APP_ENV: z.string().default("development"),

    // Application
    NEXT_PUBLIC_APP_NAME: z.string().default("Enterprise SaaS Platform"),
    NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
    NEXT_PUBLIC_APP_ENABLED: booleanish.default("true"),

    // API
    NEXT_PUBLIC_API_BASE_URL: z.string().default("http://localhost:8080/api"),
    NEXT_PUBLIC_API_TIMEOUT_MS: intish.default(15000),
    NEXT_PUBLIC_API_RETRIES: intish.default(2),

    // Authentication
    NEXT_PUBLIC_AUTH_ENABLED: booleanish.default("true"),
    NEXT_PUBLIC_AUTH_PROVIDER: z.string().default("jwt"),
    NEXT_PUBLIC_AUTH_LOGIN_URL: z.string().default("/auth/login"),
    NEXT_PUBLIC_AUTH_LOGOUT_URL: z.string().default("/auth/logout"),
    NEXT_PUBLIC_AUTH_REFRESH_URL: z.string().default("/auth/refresh"),
    NEXT_PUBLIC_AUTH_USERINFO_URL: z.string().default("/auth/me"),
    NEXT_PUBLIC_AUTH_OAUTH_AUTHORIZE_URL: z.string().default(""),
    NEXT_PUBLIC_AUTH_OAUTH_TOKEN_URL: z.string().default(""),
    NEXT_PUBLIC_AUTH_OAUTH_CLIENT_ID: z.string().default(""),
    NEXT_PUBLIC_AUTH_OAUTH_SCOPES: z.string().default("openid profile email"),
    NEXT_PUBLIC_AUTH_REDIRECT_PATH: z.string().default("/dashboard"),
    NEXT_PUBLIC_AUTH_SESSION_TTL_MS: intish.default(30 * 60 * 1000),

    // Logging
    NEXT_PUBLIC_LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),

    // Dashboard data source + documented contract endpoints.
    // `dev` returns clearly-labelled sample data and is FORBIDDEN in
    // production builds; `http` always talks to the real backend contract.
    NEXT_PUBLIC_DASHBOARD_SOURCE: z.enum(["http", "dev"]).default("http"),
    NEXT_PUBLIC_DASHBOARD_METRICS_URL: z.string().default("/dashboard/metrics"),
    NEXT_PUBLIC_DASHBOARD_PIPELINE_RUNS_URL: z.string().default("/dashboard/pipeline-runs"),
    NEXT_PUBLIC_DASHBOARD_DEPLOYMENTS_URL: z.string().default("/dashboard/deployments"),
    NEXT_PUBLIC_DASHBOARD_SYSTEM_HEALTH_URL: z.string().default("/dashboard/health"),
    NEXT_PUBLIC_DASHBOARD_ALERTS_URL: z.string().default("/dashboard/alerts"),
    NEXT_PUBLIC_DASHBOARD_SECURITY_URL: z.string().default("/dashboard/security"),
    NEXT_PUBLIC_DASHBOARD_ACTIVITY_URL: z.string().default("/dashboard/activity"),
    NEXT_PUBLIC_PROJECTS_LIST_URL: z.string().default("/projects"),
    NEXT_PUBLIC_PROJECT_DETAIL_URL: z.string().default("/projects/{id}"),
    NEXT_PUBLIC_ORGANIZATIONS_URL: z.string().default("/v1/organizations"),
    NEXT_PUBLIC_ORGANIZATION_PROJECTS_URL: z
      .string()
      .default("/v1/organizations/{organizationId}/projects"),
    NEXT_PUBLIC_ORGANIZATION_PROJECT_URL: z
      .string()
      .default("/v1/organizations/{organizationId}/projects/{id}"),
    NEXT_PUBLIC_ORGANIZATION_REPOSITORIES_URL: z
      .string()
      .default("/v1/organizations/{organizationId}/repositories"),
    NEXT_PUBLIC_ORGANIZATION_ENVIRONMENTS_URL: z
      .string()
      .default("/v1/organizations/{organizationId}/environments"),
    NEXT_PUBLIC_SEARCH_URL: z.string().default(""),
    NEXT_PUBLIC_NOTIFICATIONS_URL: z.string().default(""),
    NEXT_PUBLIC_NOTIFICATION_READ_URL: z.string().default(""),
    NEXT_PUBLIC_NOTIFICATIONS_READ_ALL_URL: z.string().default(""),

    // Maintenance / feature flags
    NEXT_PUBLIC_MAINTENANCE_MODE: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_REGISTRY: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_OBSERVABILITY: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_CI_CD: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_PIPELINES: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_DEPLOYMENTS: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_REPOSITORIES: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_ENVIRONMENTS: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_CONTAINERS: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_INFRASTRUCTURE: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_LOGS: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_TRACES: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_ALERTS: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_SECURITY: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_VULNERABILITIES: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_SBOM: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_COMPLIANCE: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_USERS: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_TEAMS: booleanish.default("false"),
    NEXT_PUBLIC_FEATURE_SETTINGS: booleanish.default("false")
  })
  .passthrough()
  .superRefine((value, context) => {
    const production = value.NODE_ENV === "production" || process.env.NODE_ENV === "production";
    if (production && !value.NEXT_PUBLIC_AUTH_ENABLED)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_AUTH_ENABLED"],
        message: "production authentication must be enabled"
      });
    if (production && !["jwt", "refresh-token"].includes(value.NEXT_PUBLIC_AUTH_PROVIDER))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_AUTH_PROVIDER"],
        message: "production authentication requires a supported jwt or refresh-token provider"
      });
    if (production && value.NEXT_PUBLIC_DASHBOARD_SOURCE === "dev")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_DASHBOARD_SOURCE"],
        message: "development dashboard data is forbidden in production"
      });
  });

export type Env = z.infer<typeof envSchema>;

function readRawEnv(): Record<string, unknown> {
  if (isServer()) return process.env;

  // The root layout injects the public environment as `window.__ENV__` so
  // client configuration matches the server (see `serializePublicEnv`).
  const clientEnv = (globalThis as { __ENV__?: Record<string, unknown> }).__ENV__;
  const empty: Record<string, unknown> = {};
  return clientEnv ?? empty;
}

const rawEnv: Record<string, unknown> = readRawEnv();

let parsedEnv: Env | null = null;

/**
 * Read and validate the environment exactly once.
 * Exposed for tests; prefer `getEnv()`.
 */
export function parseEnv(source: Record<string, unknown> = rawEnv): Env {
  return envSchema.parse(source);
}

/** Cached validated environment. */
export function getEnv(): Env {
  if (parsedEnv === null) {
    parsedEnv = parseEnv();
  }
  return parsedEnv;
}

/** Reset the cache (used by tests). */
export function resetEnv(): void {
  parsedEnv = null;
}

/**
 * Serialize the public environment for the browser.
 *
 * Only `NEXT_PUBLIC_*` variables are included (they are public by definition).
 * The root layout injects this object as `window.__ENV__` so client-side
 * `getConfig()` resolves the same values as the server. No secrets are ever
 * exposed.
 */
export function getPublicEnv(): Record<string, string> {
  if (!isServer()) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_") && typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

/** JSON-safe inline-serialization of the public env (escapes `</script>`). */
export function serializePublicEnv(): string {
  return JSON.stringify(getPublicEnv()).replace(/</g, "\\u003c");
}

/** Public convenience accessor. */
export const env = getEnv;
