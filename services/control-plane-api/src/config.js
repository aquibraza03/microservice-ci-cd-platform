const { z } = require("zod");
const { parseJwks } = require("./auth/provider");
const { environmentIssues } = require('./environment-security');

const schema = z
  .object({
    PLATFORM_ENVIRONMENT: z.enum(['development', 'test', 'staging', 'production']).optional(),
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    SERVICE_NAME: z.string().min(1).default("control-plane-api"),
    API_VERSION: z
      .string()
      .regex(/^v\d+$/)
      .default("v1"),
    AUTH_MODE: z.enum(["demo", "test", "jwt", "github"]).default("jwt"),
    CONTROL_PLANE_STORAGE: z.enum(["postgres", "memory"]).default("memory"),
    JWT_ISSUER: z.string().url().optional(),
    JWT_AUDIENCE: z.string().min(1).optional(),
    JWT_ALGORITHMS: z.string().default("RS256,ES256"),
    JWT_JWKS: z.string().optional(),
    JWT_SIGNING_JWK: z.string().optional(),
    JWT_CLOCK_TOLERANCE_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .max(60)
      .default(5),
    SESSION_VALIDATION: z.enum(["optional", "required"]).default("optional"),
    GITHUB_OAUTH_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_OAUTH_CLIENT_SECRET: z.string().min(16).optional(),
    GITHUB_OAUTH_CALLBACK_URL: z.string().url().optional(),
    GIT_PROVIDER_MODE: z.enum(["github", "mock"]).default("github"),
    GITHUB_APP_ID: z.string().min(1).optional(),
    GITHUB_APP_SLUG: z
      .string()
      .regex(/^[A-Za-z0-9-]+$/)
      .optional(),
    GITHUB_APP_PRIVATE_KEY: z.string().min(32).optional(),
    GITHUB_APP_WEBHOOK_SECRET: z.string().min(32).optional(),
    GITHUB_APP_CALLBACK_URL: z.string().url().optional(),
    GITHUB_API_BASE_URL: z.string().url().default("https://api.github.com"),
    GITHUB_API_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(30000)
      .default(5000),
    DATABASE_URL: z.string().min(1).optional(),
    CORS_ALLOWED_ORIGINS: z.string().default(""),
    REDIS_URL: z.string().min(1).default("redis://localhost:56379"),
    DEPLOYMENT_QUEUE_NAME: z.string().min(1).default("deployments"),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
    WORKER_JOB_TIMEOUT_MS: z.coerce.number().int().min(1000).default(900000),
    WORKER_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(5000),
    MAX_REPOSITORY_BYTES: z.coerce.number().int().positive().default(536870912),
    MAX_DEPLOYMENT_LOG_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(5242880),
    BUILD_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    SSE_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(15000),
    SSE_MAX_DURATION_MS: z.coerce.number().int().min(10000).default(300000),
    SSE_MAX_PER_USER: z.coerce.number().int().min(1).max(20).default(3),
    SSE_MAX_PER_ORGANIZATION: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
    PREVIEW_BASE_DOMAIN: z.string().min(3).default("preview.local"),
    PREVIEW_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(604800)
      .default(86400),
    PREVIEW_INGRESS_CLASS: z.string().min(1).default("nginx"),
    CERT_MANAGER_CLUSTER_ISSUER: z.string().min(1).default("letsencrypt-prod"),
    DOMAIN_CHALLENGE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(86400)
      .default(900),
    AWS_PLATFORM_PRINCIPAL_ARN: z.string().optional(),
    BYOC_VALIDATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(30000)
      .default(10000),
    CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
    AUDIT_INTEGRITY_KEY: z.string().optional(),
    BYOC_ALLOW_PRIVATE_KUBERNETES_NETWORKS: z
      .enum(["true", "false"])
      .default("false"),
    BUILD_EXECUTOR_MODE: z
      .enum(["rootless-buildkit", "test"])
      .default("rootless-buildkit"),
    BUILDKIT_COMMAND: z.string().min(1).default("buildctl-daemonless.sh"),
    REGISTRY_PROVIDER: z.enum(["ghcr", "local", "test"]).default("ghcr"),
    LOCAL_REGISTRY_HOST: z.string().default("registry:5000"),
    GHCR_OWNER: z
      .string()
      .regex(/^[A-Za-z0-9_.-]+$/)
      .optional(),
    GHCR_USERNAME: z.string().min(1).optional(),
    GHCR_TOKEN: z.string().min(16).optional(),
    SUPPLY_CHAIN_MODE: z.enum(["cli", "test"]).default("cli"),
    HIGH_VULNERABILITY_POLICY: z.enum(["warn", "block"]).default("warn"),
    COSIGN_KEY_PATH: z.string().optional(),
    COSIGN_PASSWORD: z.string().optional(),
    COSIGN_CERTIFICATE_IDENTITY: z.string().optional(),
    COSIGN_CERTIFICATE_ISSUER: z.string().url().optional(),
    ALLOW_VULNERABILITY_EXCEPTIONS: z.enum(["true", "false"]).default("false"),
    DEPLOYMENT_TARGET: z.enum(["kubernetes", "test"]).default("kubernetes"),
    KUBERNETES_CONTEXT: z.string().optional(),
    KUBERNETES_TIMEOUT_MS: z.coerce.number().int().min(10000).default(300000),
    KIND_ENDPOINT_HOST: z.string().default("127.0.0.1"),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    METRICS_TOKEN: z.string().min(24).optional(),
    OTEL_TRACES_ENDPOINT: z.string().url().optional(),
    OTEL_EXPORT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(10000)
      .default(3000),
    OTEL_EXPORT_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(30000)
      .default(5000),
    OTEL_MAX_QUEUE_SIZE: z.coerce
      .number()
      .int()
      .min(128)
      .max(8192)
      .default(2048),
    OTEL_MAX_EXPORT_BATCH_SIZE: z.coerce
      .number()
      .int()
      .min(32)
      .max(1024)
      .default(256),
  })
  .transform((value) => ({
    ...value,
    JWT_ALGORITHMS: value.JWT_ALGORITHMS.split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  }))
  .superRefine((value, ctx) => {
    for (const issue of environmentIssues(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.name], message: issue.message });
    if (value.NODE_ENV === 'production') {
      for (const name of ['CREDENTIAL_ENCRYPTION_KEY', 'AUDIT_INTEGRITY_KEY']) {
        if (!value[name] || Buffer.from(value[name], 'base64').length !== 32)
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: `${name} must encode 32 bytes in production` });
      }
    }
    if (
      value.NODE_ENV === "production" &&
      ["demo", "test"].includes(value.AUTH_MODE)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_MODE"],
        message: "demo and test auth are forbidden in production",
      });
    if (["jwt", "github"].includes(value.AUTH_MODE)) {
      if (!value.JWT_ISSUER || !value.JWT_AUDIENCE || !value.JWT_JWKS)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_ISSUER"],
          message: "complete JWT identity configuration is required",
        });
      else
        try {
          parseJwks(value.JWT_JWKS);
        } catch (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["JWT_JWKS"],
            message: error.message,
          });
        }
      if (
        value.JWT_ALGORITHMS.length === 0 ||
        value.JWT_ALGORITHMS.some(
          (alg) =>
            ![
              "RS256",
              "RS384",
              "RS512",
              "ES256",
              "ES384",
              "ES512",
              "EdDSA",
            ].includes(alg),
        )
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_ALGORITHMS"],
          message: "JWT algorithm allow-list is invalid",
        });
    }
    if (
      value.AUTH_MODE === "github" &&
      (!value.GITHUB_OAUTH_CLIENT_ID ||
        !value.GITHUB_OAUTH_CLIENT_SECRET ||
        !value.GITHUB_OAUTH_CALLBACK_URL ||
        !value.JWT_SIGNING_JWK)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GITHUB_OAUTH_CLIENT_ID"],
        message:
          "complete GitHub OAuth and session-signing configuration is required",
      });
    if (value.NODE_ENV === "production" && value.GIT_PROVIDER_MODE === "mock")
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GIT_PROVIDER_MODE"],
        message: "mock Git providers are forbidden in production",
      });
    if (
      value.NODE_ENV === "production" &&
      (!value.GITHUB_APP_ID ||
        !value.GITHUB_APP_SLUG ||
        !value.GITHUB_APP_PRIVATE_KEY ||
        !value.GITHUB_APP_WEBHOOK_SECRET ||
        !value.GITHUB_APP_CALLBACK_URL)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GITHUB_APP_ID"],
        message: "complete GitHub App configuration is required in production",
      });
    if (value.JWT_SIGNING_JWK)
      try {
        const key = JSON.parse(value.JWT_SIGNING_JWK);
        const publicKeys = value.JWT_JWKS ? parseJwks(value.JWT_JWKS).keys : [];
        if (
          !key.kid ||
          !key.alg ||
          !key.d ||
          !value.JWT_ALGORITHMS.includes(key.alg) ||
          !publicKeys.some(
            (item) => item.kid === key.kid && item.alg === key.alg,
          )
        )
          throw new Error();
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_SIGNING_JWK"],
          message:
            "JWT_SIGNING_JWK must be an allowed private JWK matching an active public key",
        });
      }
    if (value.NODE_ENV === "production" && !value.DATABASE_URL)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required in production",
      });
    if (value.NODE_ENV === "production" && !value.METRICS_TOKEN)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["METRICS_TOKEN"],
        message: "METRICS_TOKEN is required in production",
      });
    if (
      value.NODE_ENV === "production" &&
      value.CONTROL_PLANE_STORAGE === "postgres" &&
      !value.AUDIT_INTEGRITY_KEY
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUDIT_INTEGRITY_KEY"],
        message: "an external audit integrity key is required in production",
      });
    if (
      value.NODE_ENV === "production" &&
      value.CONTROL_PLANE_STORAGE !== "postgres"
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CONTROL_PLANE_STORAGE"],
        message: "production storage must be postgres",
      });
    if (value.NODE_ENV === "production" && !value.CORS_ALLOWED_ORIGINS)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ALLOWED_ORIGINS"],
        message: "CORS_ALLOWED_ORIGINS is required in production",
      });
    if (
      value.NODE_ENV === "production" &&
      value.SESSION_VALIDATION !== "required"
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_VALIDATION"],
        message: "production session validation must be required",
      });
    if (
      value.NODE_ENV === "production" &&
      value.BUILD_EXECUTOR_MODE !== "rootless-buildkit"
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BUILD_EXECUTOR_MODE"],
        message: "production builds require rootless BuildKit",
      });
    if (
      value.NODE_ENV === "production" &&
      value.BUILDKIT_COMMAND !== "buildctl-daemonless.sh"
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BUILDKIT_COMMAND"],
        message:
          "production worker command must be the reviewed rootless BuildKit launcher",
      });
    if (
      value.NODE_ENV === "production" &&
      (value.REGISTRY_PROVIDER !== "ghcr" ||
        !value.GHCR_OWNER ||
        !value.GHCR_USERNAME ||
        !value.GHCR_TOKEN)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REGISTRY_PROVIDER"],
        message: "complete GHCR configuration is required in production",
      });
    if (
      value.NODE_ENV === "production" &&
      (value.SUPPLY_CHAIN_MODE !== "cli" ||
        (!value.COSIGN_KEY_PATH &&
          (!value.COSIGN_CERTIFICATE_IDENTITY ||
            !value.COSIGN_CERTIFICATE_ISSUER)))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SUPPLY_CHAIN_MODE"],
        message:
          "production signing and verification configuration is required",
      });
    if (
      value.NODE_ENV === "production" &&
      value.DEPLOYMENT_TARGET !== "kubernetes"
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEPLOYMENT_TARGET"],
        message: "production deployment target must be Kubernetes",
      });
    if (value.NODE_ENV === "production" && !value.AWS_PLATFORM_PRINCIPAL_ARN)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AWS_PLATFORM_PRINCIPAL_ARN"],
        message: "AWS platform AssumeRole principal is required in production",
      });
    if (value.NODE_ENV === "production" && !value.CREDENTIAL_ENCRYPTION_KEY)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CREDENTIAL_ENCRYPTION_KEY"],
        message: "credential encryption key is required in production",
      });
  });

function loadConfig(source = process.env) {
  return schema.parse(source);
}
module.exports = { loadConfig, configSchema: schema };
