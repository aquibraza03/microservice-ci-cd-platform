const { PostgresPolicyExceptionStore } = require("./policy/postgres-exceptions");
const { PostgresApprovalStore } = require("./approvals/postgres-store");
const { PostgresSecretReferenceStore } = require("./secrets/postgres-store");
const { PostgresByocStore } = require("./byoc/postgres-store");
const { PostgresPreviewStore } = require("./previews/postgres-store");
const http = require("http");
const crypto = require("crypto");
const { runtimeConfig, requireDurableOverrides } = require('./production');
const { PostgresAuditService } = require('./audit/postgres-service');
const { PostgresUsageLedger, PostgresEntitlementService, PostgresQuotaManager } = require('./billing/postgres');
const { withTransaction, bindTransactions } = require('./database/transaction');
const { ControlPlaneError, errorBody } = require("./errors");
const { createIdentityProvider } = require("./auth/provider");
const {
  OAuthStateStore,
  GitHubOAuthClient,
  constantTimeEqual,
} = require("./auth/oauth");
const { SessionIssuer } = require("./auth/session");
const { PERMISSIONS } = require("./auth/rbac");
const { MemoryRepository } = require("./domain/repositories");
const { PostgresRepository } = require("./domain/postgres-repository");
const {
  organizationInput,
  projectInput,
  repositoryInput,
  environmentInput,
  membershipInput,
  roleUpdateInput,
  currentOrganizationInput,
  listQuery,
  parse,
} = require("./validation/schemas");
const { createPool, checkDatabase } = require("./database/pool");
const { createGitProvider } = require("./git/github-app");
const { InstallationStateStore } = require("./git/state");
const { GitHubWebhookService } = require("./git/webhooks");
const { MemoryDeploymentStore } = require("./deployments/store");
const { PostgresDeploymentStore } = require("./deployments/postgres-store");
const {
  MemoryDeploymentQueue,
  BullDeploymentQueue,
} = require("./queue/deployment-queue");
const { DetectionService } = require("./detection/service");
const { MemoryConfigurationStore } = require("./configuration/store");
const {
  PostgresConfigurationStore,
} = require("./configuration/postgres-store");
const {
  validateConfiguration,
  exportServiceYaml,
} = require("./configuration/validation");
const { MemoryPreviewStore } = require("./previews/store");
const {
  KubernetesIngressRouter,
  TestIngressRouter,
} = require("./previews/routing");
const { PreviewReconciler } = require("./previews/reconciler");
const { PreviewController } = require("./previews/controller");
const {
  workloadName,
  KubernetesDeploymentProvider,
  TestDeploymentTargetProvider,
} = require("./providers/deployment-target");
const { AwsCloudAccountProvider } = require("./byoc/aws-provider");
const {
  CustomerKubernetesTargetProvider,
} = require("./byoc/kubernetes-provider");
const { MemoryByocStore } = require("./byoc/store");
const { MemorySecretReferenceStore } = require("./secrets/store");
const {
  AwsSecretsManagerReferenceProvider,
  KubernetesExternalSecretReferenceProvider,
} = require("./secrets/providers");
const { MemoryApprovalStore } = require("./approvals/store");
const { deploymentSnapshot } = require("./approvals/canonical");
const { CATALOG, targetPolicyStatus } = require("./policy/kyverno");
const { MemoryPolicyExceptionStore } = require("./policy/exceptions");
const { DriftDetector } = require("./policy/drift");
const { MemoryAuditService } = require("./audit/service");
const { createObservability } = require("./observability");
const { normalizeRoute } = require("./observability/metrics");
const { metricsTokenMatches } = require("./observability/logger");
const { initializeTelemetry } = require("./observability/sdk");
const { instrumentPool } = require("./observability/database");
const { UsageLedger } = require("./billing/ledger");
const { EntitlementService } = require("./billing/plans");
const { QuotaManager } = require("./billing/quotas");
const { METERS } = require("./billing/catalog");

function requestId(request) {
  if (request.platformRequestId) return request.platformRequestId;
  const supplied = request.headers["x-request-id"];
  return typeof supplied === "string" &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}
function json(response, status, body, id) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-request-id": id,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  response.end(JSON.stringify(body));
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let failed = false;
    request.on("data", (chunk) => {
      if (failed) return;
      body += chunk;
      if (body.length > 1024 * 1024) {
        failed = true;
        reject(
          new ControlPlaneError(
            413,
            "PAYLOAD_TOO_LARGE",
            "Request body is too large",
          ),
        );
        request.destroy();
      }
    });
    request.on("end", () => {
      if (failed) return;
      if (!body) resolve({});
      else
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(
            new ControlPlaneError(
              400,
              "INVALID_JSON",
              "Request body must be valid JSON",
            ),
          );
        }
    });
    request.on("error", reject);
  });
}
function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(
          new ControlPlaneError(
            413,
            "PAYLOAD_TOO_LARGE",
            "Request body is too large",
          ),
        );
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
function page(items, query) {
  const start = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(start, start + query.pageSize),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / query.pageSize),
    },
  };
}
function cookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        const index = value.indexOf("=");
        return [
          decodeURIComponent(value.slice(0, index)),
          decodeURIComponent(value.slice(index + 1)),
        ];
      }),
  );
}
async function audit(repository, event) {
  if (repository.auditService) {
    const recorded = await repository.auditService.append({
      organizationId:
        event.organizationId || "00000000-0000-0000-0000-000000000000",
      actorType: event.actorType || "user",
      actorId: event.actorId || event.actorUserId || null,
      action: event.action,
      resourceType: event.resourceType || "platform_resource",
      resourceId: event.resourceId || null,
      result: event.result || "success",
      reasonCode: event.reasonCode || null,
      requestId: event.requestId || null,
      correlationId: event.correlationId || event.requestId || null,
      sourceCategory: event.sourceCategory || "control_plane",
      objectVersion: event.objectVersion,
      idempotencyKey:
        event.idempotencyKey ||
        `${event.requestId || "internal"}:${event.action}:${event.resourceId || "none"}`,
      metadata: event.metadata || {},
    });
    // Compatibility projection for pre-Phase-3 readers. The centralized service
    // has already validated and redacted the authoritative event.
    if (repository.recordAudit)
      await repository.recordAudit({
        ...event,
        organizationId: event.organizationId || null,
        requestId: event.requestId || recorded.id,
        metadata: recorded.metadata,
      });
    return recorded;
  }
  return repository.recordAudit ? repository.recordAudit(event) : undefined;
}

function createApplication(options = {}) {
  const config = runtimeConfig(options);
  requireDurableOverrides(config, options, {
    repository: PostgresRepository, deploymentStore: PostgresDeploymentStore,
    configurationStore: PostgresConfigurationStore, previewStore: PostgresPreviewStore,
    byocStore: PostgresByocStore, secretStore: PostgresSecretReferenceStore,
    approvalStore: PostgresApprovalStore, policyExceptionStore: PostgresPolicyExceptionStore,
    auditService: PostgresAuditService, usageLedger: PostgresUsageLedger,
    entitlements: PostgresEntitlementService, quotaManager: PostgresQuotaManager,
    deploymentQueue: BullDeploymentQueue,
    identityProvider: null,
  });
  const observability =
    options.observability ||
    createObservability(config, options.observabilityOptions);
  const pool =
    options.pool === undefined
      ? createPool(config)
      : options.pool;
  instrumentPool(pool, observability.metrics);
  bindTransactions(pool);
  const repository =
    options.repository ||
    (config.CONTROL_PLANE_STORAGE === "postgres"
      ? new PostgresRepository(pool)
      : new MemoryRepository());
  if (repository.requireAccess && !repository.requireAccess.observed) {
    const originalRequireAccess = repository.requireAccess.bind(repository);
    const observedRequireAccess = function observedRequireAccess(...args) {
      const started = process.hrtime.bigint();
      let result = "allow";
      const finish = () =>
        observability.metrics.observe(
          "authorization_duration_seconds",
          { action: String(args[2] || "unknown").slice(0, 80), result },
          Number(process.hrtime.bigint() - started) / 1e9,
        );
      try {
        const value = originalRequireAccess(...args);
        if (value?.then)
          return value.then(
            (resolved) => {
              finish();
              return resolved;
            },
            (error) => {
              result = "deny";
              finish();
              throw error;
            },
          );
        finish();
        return value;
      } catch (error) {
        result = "deny";
        finish();
        throw error;
      }
    };
    observedRequireAccess.observed = true;
    repository.requireAccess = observedRequireAccess;
  }
  const identityProvider =
    options.identityProvider ||
    createIdentityProvider(config, {
      jwks: options.jwks,
      testIdentity: options.testIdentity,
      sessionValidator: (jti, subject) =>
        repository.isSessionActive(jti, subject),
    });
  const oauthState = options.oauthState || new OAuthStateStore();
  const githubClient =
    options.githubClient ||
    (config.AUTH_MODE === "github" ? new GitHubOAuthClient(config) : null);
  const sessionIssuer =
    options.sessionIssuer ||
    (config.AUTH_MODE === "github" ? new SessionIssuer(config) : null);
  const gitProvider =
    options.gitProvider ||
    (config.GITHUB_APP_ID
      ? createGitProvider(config, { fetchImpl: options.fetchImpl })
      : null);
  const installationState =
    options.installationState || new InstallationStateStore();
  const deploymentStore =
    options.deploymentStore ||
    (config.CONTROL_PLANE_STORAGE === "postgres"
      ? new PostgresDeploymentStore(repository, pool, {
          retentionDays: config.BUILD_LOG_RETENTION_DAYS,
          maxLogBytes: config.MAX_DEPLOYMENT_LOG_BYTES,
        })
      : new MemoryDeploymentStore(repository, {
          maxLogBytes: config.MAX_DEPLOYMENT_LOG_BYTES,
        }));
  const deploymentQueue =
    options.deploymentQueue ||
    (config.CONTROL_PLANE_STORAGE === "postgres"
      ? new BullDeploymentQueue({
          connection: { url: config.REDIS_URL },
          queueName: config.DEPLOYMENT_QUEUE_NAME,
          traceManager: observability.traces,
          metrics: observability.metrics,
        })
      : new MemoryDeploymentQueue({
          traceManager: observability.traces,
          metrics: observability.metrics,
        }));
  const configurationStore =
    options.configurationStore ||
    (config.CONTROL_PLANE_STORAGE === "postgres"
      ? new PostgresConfigurationStore(repository, pool)
      : new MemoryConfigurationStore(repository));
  const detectionService =
    options.detectionService ||
    new DetectionService({
      repository,
      gitProvider,
      resolveCheckout: options.resolveDetectionCheckout,
    });
  const previewStore =
    options.previewStore ||
    new (config.CONTROL_PLANE_STORAGE === "postgres" ? PostgresPreviewStore : MemoryPreviewStore)(repository, { pool,
      baseDomain: config.PREVIEW_BASE_DOMAIN,
      previewTtlMs: config.PREVIEW_TTL_SECONDS * 1000,
      challengeTtlMs: config.DOMAIN_CHALLENGE_TTL_SECONDS * 1000,
    });
  const previewRouter =
    options.previewRouter ||
    (config.DEPLOYMENT_TARGET === "test"
      ? new TestIngressRouter()
      : new KubernetesIngressRouter({
          context: config.KUBERNETES_CONTEXT,
          ingressClass: config.PREVIEW_INGRESS_CLASS,
          clusterIssuer: config.CERT_MANAGER_CLUSTER_ISSUER,
        }));
  const previewDeploymentProvider =
    options.previewDeploymentProvider ||
    (config.DEPLOYMENT_TARGET === "test"
      ? new TestDeploymentTargetProvider()
      : new KubernetesDeploymentProvider({
          context: config.KUBERNETES_CONTEXT,
          timeoutMs: config.KUBERNETES_TIMEOUT_MS,
        }));
  const previewReconciler =
    options.previewReconciler ||
    new PreviewReconciler({
      store: previewStore,
      router: previewRouter,
      deploymentProvider: previewDeploymentProvider,
      dnsProvider: options.dnsProvider,
      metrics: {
        inc(name) {
          if (name.startsWith("preview_cleanup"))
            observability.metrics.inc("preview_cleanup_total", {
              result: name.endsWith("failed") ? "failure" : "success",
            });
        },
      },
    });
  const previewController =
    options.previewController ||
    new PreviewController({
      store: previewStore,
      deploymentStore,
      deploymentQueue,
    });
  const awsProvider =
    options.awsProvider ||
    new AwsCloudAccountProvider({
      sts: options.awsStsClient || {
        assumeRoleAndGetIdentity: async () => {
          throw Object.assign(new Error("AWS client unavailable"), {
            retryable: false,
          });
        },
      },
      platformPrincipalArn:
        config.AWS_PLATFORM_PRINCIPAL_ARN ||
        "arn:aws:iam::000000000000:role/platform-test-principal",
      timeoutMs: config.BYOC_VALIDATION_TIMEOUT_MS,
      supportLevel: options.awsStsClient ? "beta" : "experimental",
    });
  const customerKubernetesProvider =
    options.customerKubernetesProvider ||
    new CustomerKubernetesTargetProvider({
      clientFactory:
        options.kubernetesClientFactory ||
        (() => ({
          discover: async () => {
            throw new Error("Kubernetes client unavailable");
          },
        })),
      lookup: options.dnsLookup,
      production: config.NODE_ENV === "production",
      allowPrivateNetworks:
        config.NODE_ENV !== "production" &&
        config.BYOC_ALLOW_PRIVATE_KUBERNETES_NETWORKS === "true",
      timeoutMs: config.BYOC_VALIDATION_TIMEOUT_MS,
      supportLevel: options.kubernetesClientFactory ? "beta" : "experimental",
    });
  const byocStore =
    options.byocStore ||
    new (config.CONTROL_PLANE_STORAGE === "postgres" ? PostgresByocStore : MemoryByocStore)(repository, { pool,
      awsProvider,
      kubernetesProvider: customerKubernetesProvider,
      encryptionKey:
        config.CREDENTIAL_ENCRYPTION_KEY ||
        (config.NODE_ENV === "test"
          ? Buffer.alloc(32, 7).toString("base64")
          : ""),
    });
  const secretStore =
    options.secretStore ||
    new (config.CONTROL_PLANE_STORAGE === "postgres" ? PostgresSecretReferenceStore : MemorySecretReferenceStore)(repository, { pool,
      byocStore,
      providers: {
        aws_secrets_manager: new AwsSecretsManagerReferenceProvider(),
        kubernetes_external_secret:
          new KubernetesExternalSecretReferenceProvider(),
      },
    });
  const auditService =
    options.auditService ||
    new (config.CONTROL_PLANE_STORAGE === 'postgres' ? PostgresAuditService : MemoryAuditService)(repository, {
      integrityKeys: {
        1: config.AUDIT_INTEGRITY_KEY
          ? Buffer.from(config.AUDIT_INTEGRITY_KEY, "base64")
          : Buffer.alloc(32, 9),
      },
    });
  repository.auditService = auditService;
  const securityEvents = [];
  const eventSink = (event) => {
    securityEvents.push({ ...event, createdAt: new Date().toISOString() });
    if (String(event.action || "").startsWith("policy."))
      observability.metrics.inc("policy_evaluations_total", {
        policy: String(event.metadata?.policy || "governance").slice(0, 64),
        mode: String(event.metadata?.mode || "evaluate").slice(0, 32),
        result: String(event.result || "success").slice(0, 32),
      });
    return audit(repository, {
      ...event,
      metadata: event.metadata || {},
    });
  };
  const approvalStore =
    options.approvalStore || new (config.CONTROL_PLANE_STORAGE === "postgres" ? PostgresApprovalStore : MemoryApprovalStore)(repository, { pool, eventSink });
  const policyExceptionStore =
    options.policyExceptionStore ||
    new (config.CONTROL_PLANE_STORAGE === "postgres" ? PostgresPolicyExceptionStore : MemoryPolicyExceptionStore)(repository, { pool, eventSink });
  const driftDetector =
    options.driftDetector ||
    new DriftDetector(repository, {
      inspect: options.driftInspector || (async () => ({ accessible: false })),
    });
  const usageLedger = options.usageLedger || (config.CONTROL_PLANE_STORAGE === 'postgres' ? new PostgresUsageLedger(pool, { auditService }) : new UsageLedger({ audit: eventSink }));
  const entitlements = options.entitlements || (config.CONTROL_PLANE_STORAGE === 'postgres' ? new PostgresEntitlementService(pool, { auditService }) : new EntitlementService());
  const quotaManager = options.quotaManager || (config.CONTROL_PLANE_STORAGE === 'postgres' ? new PostgresQuotaManager(pool, { auditService }) : new QuotaManager({ audit: eventSink }));
  Object.assign(repository, { usageLedger, entitlements, quotaManager });
  if (config.NODE_ENV === 'production') {
    for (const dependency of [deploymentStore, configurationStore, previewStore, byocStore, secretStore, approvalStore, policyExceptionStore, auditService]) {
      if (dependency.repository !== repository || dependency.pool !== pool)
        throw new Error('Production durable dependencies must share the authoritative repository and pool');
    }
    for (const dependency of [usageLedger, entitlements, quotaManager])
      if (dependency.pool !== pool) throw new Error('Production billing dependencies must share the authoritative pool');
  }
  const webhookService =
    options.webhookService ||
    (gitProvider
      ? new GitHubWebhookService(gitProvider, repository, {
          previewController,
        })
      : null);
  const startedAt = Date.now();
  const localRate = new Map(),
    streams = new Map(),
    streamMetrics = {
      opened: 0,
      closed: 0,
      reconnects: 0,
      delivered: 0,
      backpressure: 0,
    };
  const rateLimiter = options.rateLimiter || {
    check(key) {
      const current = localRate.get(key) || { started: Date.now(), count: 0 };
      if (Date.now() - current.started > config.RATE_LIMIT_WINDOW_MS) {
        current.started = Date.now();
        current.count = 0;
      }
      current.count += 1;
      localRate.set(key, current);
      return current.count <= config.RATE_LIMIT_MAX;
    },
  };

  async function handleRequest(request, response) {
    const id = requestId(request);
    try {
      const origin = request.headers.origin;
      const allowed = config.CORS_ALLOWED_ORIGINS.split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (origin && allowed.includes(origin)) {
        response.setHeader("access-control-allow-origin", origin);
        response.setHeader("vary", "Origin");
      }
      response.setHeader(
        "access-control-allow-headers",
        "Authorization, Content-Type, X-Request-ID, Idempotency-Key, Last-Event-ID, X-Audit-Download-Token",
      );
      response.setHeader("access-control-expose-headers", "X-Request-ID");
      if (request.method === "OPTIONS") {
        response.setHeader(
          "access-control-allow-methods",
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        );
        response.writeHead(204, { "x-request-id": id });
        response.end();
        return;
      }
      if (
        !rateLimiter.check(request.socket.remoteAddress || "unknown", request)
      )
        throw new ControlPlaneError(429, "RATE_LIMITED", "Too many requests");
      const url = new URL(request.url, "http://control-plane.local");
      if (
        url.pathname === "/api/v1/internal/metrics" &&
        request.method === "GET"
      ) {
        const suppliedMetricsToken =
          request.headers["x-metrics-token"] ||
          String(request.headers.authorization || "").replace(
            /^Bearer\s+/i,
            "",
          );
        if (
          !metricsTokenMatches(
            config.METRICS_TOKEN || "local-development-metrics-token",
            suppliedMetricsToken,
          )
        )
          throw new ControlPlaneError(
            404,
            "ROUTE_NOT_FOUND",
            "Route not found",
          );
        response.writeHead(200, {
          "content-type": observability.metrics.contentType(),
          "cache-control": "no-store",
          "x-request-id": id,
        });
        response.end(await observability.metrics.render());
        return;
      }
      if (url.pathname === "/api/v1/health" && request.method === "GET") {
        json(
          response,
          200,
          {
            status: "ok",
            service: config.SERVICE_NAME,
            uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          },
          id,
        );
        return;
      }
      if (url.pathname === "/api/v1/ready" && request.method === "GET") {
        let db;
        try {
          db = await checkDatabase(pool);
          if (config.CONTROL_PLANE_STORAGE === 'postgres') {
            await pool.query('SELECT 1 FROM enterprise_audit_events,usage_events,quota_reservations,quota_limits,organization_subscriptions,preview_instances,provider_connections,secret_references,approval_requests,policy_exceptions,deployment_outbox LIMIT 0');
            if (!db.ok) throw new Error('Durable state unavailable');
            if (config.NODE_ENV === 'production') await deploymentQueue.depth();
          }
        } catch {
          json(response, 503, { status: 'not_ready', dependencies: { database: 'unavailable' } }, id);
          return;
        }
        json(
          response,
          200,
          {
            status: "ready",
            dependencies: {
              database: db.configured ? "ready" : "not_configured",
            },
          },
          id,
        );
        return;
      }
      if (url.pathname === "/api/v1/version" && request.method === "GET") {
        json(
          response,
          200,
          {
            service: config.SERVICE_NAME,
            version: require("../package.json").version,
            apiVersion: config.API_VERSION,
          },
          id,
        );
        return;
      }
      if (
        url.pathname === "/api/v1/webhooks/github" &&
        request.method === "POST"
      ) {
        if (!webhookService)
          throw new ControlPlaneError(
            503,
            "GIT_PROVIDER_NOT_CONFIGURED",
            "Git provider is not configured",
          );
        json(
          response,
          202,
          await webhookService.handle(
            request.headers,
            await readRawBody(request),
          ),
          id,
        );
        return;
      }
      if (
        url.pathname === "/api/v1/auth/github/login" &&
        request.method === "GET"
      ) {
        if (!githubClient)
          throw new ControlPlaneError(
            404,
            "ROUTE_NOT_FOUND",
            "Route not found",
          );
        const flow = oauthState.create(url.searchParams.get("returnTo") || "/");
        const secure = config.NODE_ENV === "production" ? "; Secure" : "";
        response.setHeader(
          "set-cookie",
          `oauth_state=${encodeURIComponent(flow.state)}; Path=/api/v1/auth/github/callback; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
        );
        response.writeHead(302, {
          location: githubClient.authorizationUrl(flow),
          "cache-control": "no-store",
          "x-request-id": id,
        });
        response.end();
        return;
      }
      if (
        url.pathname === "/api/v1/auth/github/callback" &&
        request.method === "GET"
      ) {
        if (!githubClient || !sessionIssuer)
          throw new ControlPlaneError(
            404,
            "ROUTE_NOT_FOUND",
            "Route not found",
          );
        const state = url.searchParams.get("state") || "";
        const cookieState = cookies(request).oauth_state || "";
        if (!constantTimeEqual(state, cookieState))
          throw new ControlPlaneError(
            400,
            "OAUTH_STATE_INVALID",
            "OAuth state is invalid",
          );
        const flow = oauthState.consume(state);
        const githubIdentity = await githubClient.exchange(
          url.searchParams.get("code") || "",
          flow.verifier,
        );
        const identity = {
          ...githubIdentity,
          subject: `${config.JWT_ISSUER}|${githubIdentity.providerSubject}`,
        };
        const user = await repository.upsertUser(identity);
        const issued = await sessionIssuer.issue(githubIdentity);
        await repository.createSession(user.id, issued.jti, issued.expiresAt);
        await audit(repository, {
          actorUserId: user.id,
          action: "auth.login",
          resourceType: "session",
          resourceId: null,
          requestId: id,
          metadata: { provider: "github" },
        });
        response.setHeader(
          "set-cookie",
          `oauth_state=; Path=/api/v1/auth/github/callback; HttpOnly; SameSite=Lax; Max-Age=0${config.NODE_ENV === "production" ? "; Secure" : ""}`,
        );
        json(
          response,
          200,
          {
            accessToken: issued.token,
            tokenType: "Bearer",
            expiresAt: issued.expiresAt,
            user,
          },
          id,
        );
        return;
      }

      const authenticationStarted = process.hrtime.bigint();
      let authenticationResult = "success";
      let identity;
      try {
        identity = await identityProvider.authenticate(request);
      } catch (error) {
        authenticationResult = "failure";
        throw error;
      } finally {
        observability.metrics.observe(
          "auth_duration_seconds",
          { operation: "authenticate", result: authenticationResult },
          Number(process.hrtime.bigint() - authenticationStarted) / 1e9,
        );
      }
      const user = await repository.upsertUser(identity);
      if (url.pathname === "/api/v1/me" && request.method === "GET") {
        json(response, 200, await repository.getCurrentUser(user.id), id);
        return;
      }
      if (url.pathname === "/api/v1/logout" && request.method === "POST") {
        if (identity.sessionId)
          await repository.revokeSession(user.id, identity.sessionId);
        await audit(repository, {
          actorUserId: user.id,
          action: "auth.logout",
          resourceType: "session",
          resourceId: null,
          requestId: id,
          metadata: {},
        });
        json(response, 204, null, id);
        return;
      }
      if (
        url.pathname === "/api/v1/organizations" &&
        request.method === "POST"
      ) {
        const parsed = parse(organizationInput, await readBody(request));
        if (parsed.error)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed",
            parsed.error,
          );
        const organization = await repository.createOrganization(
          user.id,
          parsed.data,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: organization.id,
          action: "organization.created",
          resourceType: "organization",
          resourceId: organization.id,
          requestId: id,
          metadata: {},
        });
        json(response, 201, organization, id);
        return;
      }
      if (
        url.pathname === "/api/v1/organizations" &&
        request.method === "GET"
      ) {
        json(
          response,
          200,
          { items: await repository.listOrganizations(user.id) },
          id,
        );
        return;
      }
      const orgMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)$/,
      );
      if (orgMatch && request.method === "GET") {
        await repository.requireAccess(
          user.id,
          orgMatch[1],
          PERMISSIONS.OBSERVE,
        );
        json(
          response,
          200,
          await repository.requireOrganization(orgMatch[1]),
          id,
        );
        return;
      }
      const currentMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/current$/,
      );
      if (currentMatch && request.method === "PUT") {
        const parsed = parse(currentOrganizationInput, await readBody(request));
        if (parsed.error || parsed.data.organizationId !== currentMatch[1])
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed",
            parsed.error,
          );
        json(
          response,
          200,
          await repository.setCurrentOrganization(user.id, currentMatch[1]),
          id,
        );
        return;
      }
      const membershipsMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/memberships$/,
      );
      if (membershipsMatch && request.method === "GET") {
        json(
          response,
          200,
          {
            items: await repository.listMemberships(
              user.id,
              membershipsMatch[1],
            ),
          },
          id,
        );
        return;
      }
      if (membershipsMatch && request.method === "POST") {
        const parsed = parse(membershipInput, await readBody(request));
        if (parsed.error)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed",
            parsed.error,
          );
        const membership = await repository.addMembership(
          user.id,
          membershipsMatch[1],
          parsed.data.userId,
          parsed.data.role,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: membershipsMatch[1],
          action: "membership.created",
          resourceType: "membership",
          resourceId: parsed.data.userId,
          requestId: id,
          metadata: { role: parsed.data.role },
        });
        json(response, 201, membership, id);
        return;
      }
      const membershipMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/memberships\/([^/]+)$/,
      );
      if (membershipMatch && request.method === "PATCH") {
        const parsed = parse(roleUpdateInput, await readBody(request));
        if (parsed.error)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed",
            parsed.error,
          );
        await approvalStore.assertApproverChangeSafe(
          membershipMatch[1],
          membershipMatch[2],
          parsed.data.role,
        );
        const membership = await repository.assignRole(
          user.id,
          membershipMatch[1],
          membershipMatch[2],
          parsed.data.role,
          parsed.data.version,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: membershipMatch[1],
          action: "membership.role_changed",
          resourceType: "membership",
          resourceId: membershipMatch[2],
          requestId: id,
          metadata: { role: parsed.data.role },
        });
        json(response, 200, membership, id);
        return;
      }
      if (membershipMatch && request.method === "DELETE") {
        const body = await readBody(request);
        await approvalStore.assertApproverChangeSafe(
          membershipMatch[1],
          membershipMatch[2],
        );
        const membership = await repository.removeMembership(
          user.id,
          membershipMatch[1],
          membershipMatch[2],
          body.expectedVersion,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: membershipMatch[1],
          action: "membership.removed",
          resourceType: "membership",
          resourceId: membershipMatch[2],
          requestId: id,
          metadata: { authorizationVersion: membership.authorizationVersion },
        });
        json(response, 200, membership, id);
        return;
      }
      const effectivePermissions = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/effective-permissions$/,
      );
      if (effectivePermissions && request.method === "GET") {
        json(
          response,
          200,
          await repository.effectivePermissions(
            user.id,
            effectivePermissions[1],
          ),
          id,
        );
        return;
      }
      const invitations = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/invitations$/,
      );
      if (invitations && request.method === "POST") {
        const body = await readBody(request);
        if (!body.email || !body.role)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Invitation email and role are required",
          );
        const value = await repository.createInvitation(
          user.id,
          invitations[1],
          {
            email: body.email,
            role: body.role,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: invitations[1],
          action: "membership.invited",
          resourceType: "invitation",
          resourceId: value.invitation.id,
          requestId: id,
          metadata: {
            role: value.invitation.role,
            expiresAt: value.invitation.expiresAt,
          },
        });
        json(response, 201, value, id);
        return;
      }
      const invitationAccept = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/invitations\/([^/]+)\/accept$/,
      );
      if (invitationAccept && request.method === "POST") {
        const body = await readBody(request);
        const membership = await repository.acceptInvitation(
          user.id,
          invitationAccept[1],
          invitationAccept[2],
          body.token,
        );
        json(response, 200, membership, id);
        return;
      }
      const projectsMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/projects$/,
      );
      const projectMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/projects\/([^/]+)$/,
      );
      if (projectsMatch && request.method === "GET") {
        const parsed = parse(listQuery, Object.fromEntries(url.searchParams));
        if (parsed.error)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Query validation failed",
            parsed.error,
          );
        json(
          response,
          200,
          page(
            await repository.listProjects(
              user.id,
              projectsMatch[1],
              parsed.data,
            ),
            parsed.data,
          ),
          id,
        );
        return;
      }
      if (projectsMatch && request.method === "POST") {
        const parsed = parse(projectInput, await readBody(request));
        if (parsed.error)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed",
            parsed.error,
          );
        json(
          response,
          201,
          await repository.createProject(
            user.id,
            projectsMatch[1],
            parsed.data,
          ),
          id,
        );
        return;
      }
      if (projectMatch && request.method === "GET") {
        json(
          response,
          200,
          await repository.getProject(
            user.id,
            projectMatch[1],
            projectMatch[2],
          ),
          id,
        );
        return;
      }
      const servicesMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/projects\/([^/]+)\/services$/,
      );
      if (servicesMatch && request.method === "GET") {
        json(
          response,
          200,
          {
            items: await repository.listServices(
              user.id,
              servicesMatch[1],
              servicesMatch[2],
            ),
          },
          id,
        );
        return;
      }
      if (servicesMatch && request.method === "POST") {
        const body = await readBody(request);
        if (
          !/^[a-z][a-z0-9-]{1,62}$/.test(body.name || "") ||
          typeof body.repositoryId !== "string" ||
          typeof body.servicePath !== "string" ||
          body.servicePath.split(/[\\/]/).includes("..")
        )
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Service input is invalid",
          );
        json(
          response,
          201,
          await repository.createService(
            user.id,
            servicesMatch[1],
            servicesMatch[2],
            body,
          ),
          id,
        );
        return;
      }
      const repositoriesMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/repositories$/,
      );
      if (repositoriesMatch && request.method === "GET") {
        const parsed = parse(listQuery, Object.fromEntries(url.searchParams));
        if (parsed.error)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Query validation failed",
            parsed.error,
          );
        json(
          response,
          200,
          page(
            await repository.listRepositoryReferences(
              user.id,
              repositoriesMatch[1],
            ),
            parsed.data,
          ),
          id,
        );
        return;
      }
      if (repositoriesMatch && request.method === "POST") {
        const projectId = url.searchParams.get("projectId");
        if (!projectId)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "projectId is required",
          );
        const parsed = parse(repositoryInput, await readBody(request));
        if (parsed.error)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed",
            parsed.error,
          );
        json(
          response,
          201,
          await repository.createRepositoryReference(
            user.id,
            repositoriesMatch[1],
            projectId,
            parsed.data,
          ),
          id,
        );
        return;
      }
      const gitAuthorize = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/git\/installations\/authorize$/,
      );
      if (gitAuthorize && request.method === "POST") {
        if (!gitProvider)
          throw new ControlPlaneError(
            503,
            "GIT_PROVIDER_NOT_CONFIGURED",
            "Git provider is not configured",
          );
        await repository.requireAccess(
          user.id,
          gitAuthorize[1],
          PERMISSIONS.REPOSITORY_MANAGE,
        );
        const state = installationState.create(user.id, gitAuthorize[1]);
        json(
          response,
          200,
          {
            authorizationUrl:
              gitProvider.createInstallationAuthorization(state),
            expiresInSeconds: 600,
          },
          id,
        );
        return;
      }
      const gitCallback = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/git\/installations\/callback$/,
      );
      if (gitCallback && request.method === "GET") {
        if (!gitProvider)
          throw new ControlPlaneError(
            503,
            "GIT_PROVIDER_NOT_CONFIGURED",
            "Git provider is not configured",
          );
        installationState.consume(
          url.searchParams.get("state"),
          user.id,
          gitCallback[1],
        );
        const providerId = url.searchParams.get("installation_id");
        if (!/^\d+$/.test(providerId || ""))
          throw new ControlPlaneError(
            400,
            "INSTALLATION_INVALID",
            "Installation ID is invalid",
          );
        const remote = await gitProvider.getInstallation(providerId);
        if (remote.suspended_at)
          throw new ControlPlaneError(
            403,
            "GIT_PROVIDER_ACCESS_REVOKED",
            "GitHub App installation is suspended",
          );
        const installation = await repository.createInstallation(
          user.id,
          gitCallback[1],
          {
            provider: "github",
            providerInstallationId: providerId,
            accountId: String(remote.account.id),
            accountLogin: remote.account.login,
            accountType: remote.account.type,
            repositorySelection: remote.repository_selection,
          },
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: gitCallback[1],
          action: "git.installation.connected",
          resourceType: "git_installation",
          resourceId: installation.id,
          requestId: id,
          metadata: { provider: "github" },
        });
        json(response, 200, installation, id);
        return;
      }
      const installations = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/git\/installations$/,
      );
      if (installations && request.method === "GET") {
        json(
          response,
          200,
          {
            items: await repository.listInstallations(
              user.id,
              installations[1],
            ),
          },
          id,
        );
        return;
      }
      const installationRepos = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/git\/installations\/([^/]+)\/repositories$/,
      );
      if (installationRepos && request.method === "GET") {
        const installation = await repository.requireInstallation(
          user.id,
          installationRepos[1],
          installationRepos[2],
        );
        json(
          response,
          200,
          await gitProvider.listRepositories(
            installation.providerInstallationId,
            {
              page: Number(url.searchParams.get("page") || 1),
              pageSize: Number(url.searchParams.get("pageSize") || 30),
              search: url.searchParams.get("search") || "",
            },
          ),
          id,
        );
        return;
      }
      const installationBranches = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/git\/installations\/([^/]+)\/repositories\/([^/]+)\/branches$/,
      );
      if (installationBranches && request.method === "GET") {
        const installation = await repository.requireInstallation(
          user.id,
          installationBranches[1],
          installationBranches[2],
        );
        json(
          response,
          200,
          {
            items: await gitProvider.listBranches(
              installation.providerInstallationId,
              installationBranches[3],
              { page: Number(url.searchParams.get("page") || 1) },
            ),
          },
          id,
        );
        return;
      }
      const installationDelete = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/git\/installations\/([^/]+)$/,
      );
      if (installationDelete && request.method === "DELETE") {
        const installation = await repository.requireInstallation(
          user.id,
          installationDelete[1],
          installationDelete[2],
          PERMISSIONS.REPOSITORY_MANAGE,
        );
        await gitProvider.disconnectInstallation(
          installation.providerInstallationId,
        );
        await repository.disconnectInstallation(
          user.id,
          installationDelete[1],
          installation.id,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: installationDelete[1],
          action: "git.installation.disconnected",
          resourceType: "git_installation",
          resourceId: installation.id,
          requestId: id,
          metadata: { provider: "github" },
        });
        json(response, 204, null, id);
        return;
      }
      const projectRepo = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/projects\/([^/]+)\/repository$/,
      );
      if (projectRepo && request.method === "POST") {
        const body = await readBody(request);
        if (
          !/^\d+$/.test(String(body.repositoryId || "")) ||
          !/^[-A-Za-z0-9._/]{1,255}$/.test(body.selectedBranch || "")
        )
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Repository and branch are invalid",
          );
        const installation = await repository.requireInstallation(
          user.id,
          projectRepo[1],
          body.installationId,
          PERMISSIONS.REPOSITORY_MANAGE,
        );
        const metadata = await gitProvider.getRepository(
          installation.providerInstallationId,
          body.repositoryId,
        );
        const branches = await gitProvider.listBranches(
          installation.providerInstallationId,
          body.repositoryId,
        );
        if (!branches.some((branch) => branch.name === body.selectedBranch))
          throw new ControlPlaneError(
            400,
            "BRANCH_NOT_FOUND",
            "Selected branch is unavailable",
          );
        const connected = await repository.connectProviderRepository(
          user.id,
          projectRepo[1],
          projectRepo[2],
          installation.id,
          metadata,
          body.selectedBranch,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: projectRepo[1],
          projectId: projectRepo[2],
          action: "git.repository.connected",
          resourceType: "repository",
          resourceId: connected.id,
          requestId: id,
          metadata: {
            provider: "github",
            providerRepositoryId: connected.externalId,
          },
        });
        json(response, 201, connected, id);
        return;
      }
      if (projectRepo && request.method === "GET") {
        const items = await repository.listRepositoryReferences(
          user.id,
          projectRepo[1],
        );
        const item = items.find(
          (candidate) =>
            candidate.projectId === projectRepo[2] &&
            candidate.status === "active",
        );
        if (!item)
          throw new ControlPlaneError(
            404,
            "REPOSITORY_NOT_FOUND",
            "Repository not found",
          );
        json(response, 200, item, id);
        return;
      }
      if (projectRepo && request.method === "DELETE") {
        const repositoryId = url.searchParams.get("repositoryId");
        const disconnected = await repository.disconnectProviderRepository(
          user.id,
          projectRepo[1],
          repositoryId,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: projectRepo[1],
          projectId: projectRepo[2],
          action: "git.repository.disconnected",
          resourceType: "repository",
          resourceId: repositoryId,
          requestId: id,
          metadata: { provider: "github" },
        });
        json(response, 200, disconnected, id);
        return;
      }
      const projectRepoAction = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/projects\/([^/]+)\/repository\/(refresh|validate)$/,
      );
      if (projectRepoAction && request.method === "POST") {
        const body = await readBody(request);
        const connected = await repository.getProviderRepository(
          user.id,
          projectRepoAction[1],
          body.repositoryId,
          PERMISSIONS.REPOSITORY_MANAGE,
        );
        const installation = await repository.requireInstallation(
          user.id,
          projectRepoAction[1],
          connected.installationId,
        );
        const metadata = await gitProvider.getRepository(
          installation.providerInstallationId,
          connected.externalId,
        );
        if (
          projectRepoAction[3] === "refresh" &&
          repository.refreshProviderRepository
        )
          await repository.refreshProviderRepository(connected.id, metadata);
        json(response, 200, { valid: true, repository: metadata }, id);
        return;
      }
      const environmentsMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/environments$/,
      );
      if (environmentsMatch && request.method === "GET") {
        const parsed = parse(listQuery, Object.fromEntries(url.searchParams));
        if (parsed.error)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Query validation failed",
            parsed.error,
          );
        json(
          response,
          200,
          page(
            await repository.listEnvironmentReferences(
              user.id,
              environmentsMatch[1],
            ),
            parsed.data,
          ),
          id,
        );
        return;
      }
      if (environmentsMatch && request.method === "POST") {
        const projectId = url.searchParams.get("projectId");
        if (!projectId)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "projectId is required",
          );
        const parsed = parse(environmentInput, await readBody(request));
        if (parsed.error)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed",
            parsed.error,
          );
        json(
          response,
          201,
          await repository.createEnvironmentReference(
            user.id,
            environmentsMatch[1],
            projectId,
            parsed.data,
          ),
          id,
        );
        return;
      }
      const detectionCreate = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/projects\/([^/]+)\/repositories\/([^/]+)\/detections$/,
      );
      if (detectionCreate && request.method === "POST") {
        const body = await readBody(request);
        if (!/^[a-f0-9]{40,64}$/i.test(body.commitSha || ""))
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "An immutable commit SHA is required",
          );
        const result = await detectionService.detect({
          userId: user.id,
          organizationId: detectionCreate[1],
          repositoryId: detectionCreate[3],
          commitSha: body.commitSha,
        });
        const run = await configurationStore.createDetection(
          user.id,
          detectionCreate[1],
          detectionCreate[2],
          detectionCreate[3],
          result,
          request.headers["idempotency-key"],
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: detectionCreate[1],
          projectId: detectionCreate[2],
          action: "service.detection.created",
          resourceType: "repository_detection",
          resourceId: run.id,
          requestId: id,
          metadata: {
            repositoryId: detectionCreate[3],
            commitSha: body.commitSha,
          },
        });
        json(response, 201, run, id);
        return;
      }
      const detectionGet = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/detections\/([^/]+)$/,
      );
      if (detectionGet && request.method === "GET") {
        json(
          response,
          200,
          await configurationStore.getDetection(
            user.id,
            detectionGet[1],
            detectionGet[2],
          ),
          id,
        );
        return;
      }
      const draftRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/projects\/([^/]+)\/service-configuration\/draft$/,
      );
      if (draftRoute && request.method === "GET") {
        json(
          response,
          200,
          {
            draft: await configurationStore.getDraft(
              user.id,
              draftRoute[1],
              draftRoute[2],
            ),
          },
          id,
        );
        return;
      }
      if (draftRoute && request.method === "PUT") {
        const body = await readBody(request);
        const safeConfiguration = structuredClone(body.configuration || {});
        delete safeConfiguration.secretValues;
        delete safeConfiguration.secrets;
        const validation = validateConfiguration(safeConfiguration);
        const draft = await configurationStore.saveDraft(
          user.id,
          draftRoute[1],
          draftRoute[2],
          { ...body, configuration: safeConfiguration, validation },
          Number(body.version || 0),
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: draftRoute[1],
          projectId: draftRoute[2],
          action: "service.configuration_draft.saved",
          resourceType: "configuration_draft",
          resourceId: draft.id,
          requestId: id,
          metadata: { version: draft.version },
        });
        json(response, 200, draft, id);
        return;
      }
      const validateRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/projects\/([^/]+)\/service-configuration\/validate$/,
      );
      if (validateRoute && request.method === "POST") {
        await repository.requireAccess(
          user.id,
          validateRoute[1],
          PERMISSIONS.REPOSITORY_MANAGE,
        );
        await repository.getProject(
          user.id,
          validateRoute[1],
          validateRoute[2],
        );
        const body = await readBody(request);
        json(
          response,
          200,
          validateConfiguration(body.configuration || {}),
          id,
        );
        return;
      }
      const saveRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/projects\/([^/]+)\/service-configurations$/,
      );
      if (saveRoute && request.method === "POST") {
        const body = await readBody(request);
        const validation = validateConfiguration(body.configuration || {});
        const saved = await configurationStore.saveConfiguration(
          user.id,
          saveRoute[1],
          saveRoute[2],
          body,
          validation,
          exportServiceYaml(body.configuration || {}),
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: saveRoute[1],
          projectId: saveRoute[2],
          action: "service.configuration.saved",
          resourceType: "service_configuration",
          resourceId: saved.id,
          requestId: id,
          metadata: {
            repositoryId: body.repositoryId,
            commitSha: body.commitSha,
          },
        });
        json(response, 201, saved, id);
        return;
      }
      const deploymentsMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments$/,
      );
      const secretReferences = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/secret-references$/,
      );
      if (secretReferences && request.method === "GET") {
        json(
          response,
          200,
          { items: await secretStore.list(user.id, secretReferences[1]) },
          id,
        );
        return;
      }
      if (secretReferences && request.method === "POST") {
        const body = await readBody(request);
        for (const field of [
          "projectId",
          "environmentId",
          "displayName",
          "providerType",
          "externalIdentifier",
          "injectionKey",
        ])
          if (!body[field])
            throw new ControlPlaneError(
              400,
              "VALIDATION_ERROR",
              "Secret reference fields are required",
            );
        const value = await secretStore.create(user.id, secretReferences[1], body);
        await audit(repository, {
          actorUserId: user.id,
          organizationId: secretReferences[1],
          projectId: body.projectId,
          action: "secret_reference.created",
          resourceType: "secret_reference",
          resourceId: value.id,
          requestId: id,
          metadata: {
            providerType: value.providerType,
            environmentId: value.environmentId,
          },
        });
        json(response, 201, value, id);
        return;
      }
      const secretAction = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/secret-references\/([^/]+)\/(validate|rotate|disable|revoke)$/,
      );
      if (secretAction && request.method === "POST") {
        const body = await readBody(request);
        let value;
        if (secretAction[3] === "validate")
          value = await secretStore.validate(
            user.id,
            secretAction[1],
            secretAction[2],
            body.expectedVersion,
          );
        else if (secretAction[3] === "rotate")
          value = await secretStore.rotate(
            user.id,
            secretAction[1],
            secretAction[2],
            body,
            body.expectedVersion,
          );
        else
          value = await secretStore.lifecycle(
            user.id,
            secretAction[1],
            secretAction[2],
            secretAction[3],
            body.expectedVersion,
          );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: secretAction[1],
          action: `secret_reference.${secretAction[3]}`,
          resourceType: "secret_reference",
          resourceId: secretAction[2],
          requestId: id,
          metadata: {
            status: value.status,
            referenceVersion: value.referenceVersion,
          },
        });
        json(response, 200, value, id);
        return;
      }
      const serviceSecrets = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/services\/([^/]+)\/secret-references$/,
      );
      if (serviceSecrets && request.method === "PUT") {
        const body = await readBody(request);
        const value = await secretStore.attach(
          user.id,
          serviceSecrets[1],
          serviceSecrets[2],
          Array.isArray(body.referenceIds) ? body.referenceIds : [],
          body.expectedVersion || 0,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: serviceSecrets[1],
          action: "service_secret_references.updated",
          resourceType: "service",
          resourceId: serviceSecrets[2],
          requestId: id,
          metadata: {
            referenceCount: value.references.length,
            version: value.version,
          },
        });
        json(response, 200, value, id);
        return;
      }
      const providerCatalog = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/providers$/,
      );
      if (providerCatalog && request.method === "GET") {
        await repository.requireAccess(
          user.id,
          providerCatalog[1],
          PERMISSIONS.OBSERVE,
        );
        json(response, 200, { items: await byocStore.providers() }, id);
        return;
      }
      const connectionsRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/provider-connections$/,
      );
      if (connectionsRoute && request.method === "GET") {
        json(
          response,
          200,
          { items: await byocStore.listConnections(user.id, connectionsRoute[1]) },
          id,
        );
        return;
      }
      if (connectionsRoute && request.method === "POST") {
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || key.length < 8)
          throw new ControlPlaneError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "A valid Idempotency-Key is required",
          );
        const body = await readBody(request);
        if (body.providerType !== "aws")
          throw new ControlPlaneError(
            422,
            "PROVIDER_NOT_CONNECTABLE",
            "Requested cloud provider is not connectable",
          );
        const result = await byocStore.createAws(
          user.id,
          connectionsRoute[1],
          body,
          key,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: connectionsRoute[1],
          action: "provider_connection.created",
          resourceType: "provider_connection",
          resourceId: result.connection.id,
          requestId: id,
          metadata: { providerType: "aws", created: result.created },
        });
        json(response, result.created ? 201 : 200, result, id);
        return;
      }
      const connectionAction = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/provider-connections\/([^/]+)\/(validate|disable|revoke)$/,
      );
      if (connectionAction && request.method === "POST") {
        const body = await readBody(request),
          value =
            connectionAction[3] === "validate"
              ? await byocStore.validateAws(
                  user.id,
                  connectionAction[1],
                  connectionAction[2],
                  body.expectedVersion,
                )
              : await byocStore.lifecycle(
                  user.id,
                  connectionAction[1],
                  connectionAction[2],
                  connectionAction[3],
                  body.expectedVersion,
                );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: connectionAction[1],
          action: `provider_connection.${connectionAction[3]}`,
          resourceType: "provider_connection",
          resourceId: connectionAction[2],
          requestId: id,
          metadata: { status: value.status, version: value.version },
        });
        json(response, 200, value, id);
        return;
      }
      const connectionUpdate = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/provider-connections\/([^/]+)$/,
      );
      if (connectionUpdate && request.method === "PATCH") {
        const body = await readBody(request),
          value = await byocStore.updateAws(
            user.id,
            connectionUpdate[1],
            connectionUpdate[2],
            body,
            body.expectedVersion,
          );
        json(response, 200, value, id);
        return;
      }
      const targetsRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployment-targets$/,
      );
      if (targetsRoute && request.method === "GET") {
        json(
          response,
          200,
          {
            items: await byocStore.listTargets(user.id, targetsRoute[1], {
              usable: url.searchParams.get("usable") === "true",
            }),
          },
          id,
        );
        return;
      }
      if (targetsRoute && request.method === "POST") {
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || key.length < 8)
          throw new ControlPlaneError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "A valid Idempotency-Key is required",
          );
        const result = await byocStore.createKubernetesTarget(
          user.id,
          targetsRoute[1],
          await readBody(request),
          key,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: targetsRoute[1],
          action: "deployment_target.created",
          resourceType: "deployment_target",
          resourceId: result.target.id,
          requestId: id,
          metadata: {
            authenticationMethod: result.target.authenticationMethod,
            created: result.created,
          },
        });
        json(response, result.created ? 201 : 200, result, id);
        return;
      }
      const targetAction = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployment-targets\/([^/]+)\/(validate|rotate-credential|disable|revoke)$/,
      );
      if (targetAction && request.method === "POST") {
        const body = await readBody(request);
        let value;
        if (targetAction[3] === "validate")
          value = await byocStore.validateTarget(
            user.id,
            targetAction[1],
            targetAction[2],
            body.expectedVersion,
          );
        else if (targetAction[3] === "rotate-credential")
          value = await byocStore.rotateTargetCredential(
            user.id,
            targetAction[1],
            targetAction[2],
            body.serviceAccountToken,
            body.expectedVersion,
          );
        else
          value = await byocStore.targetLifecycle(
            user.id,
            targetAction[1],
            targetAction[2],
            targetAction[3],
            body.expectedVersion,
          );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: targetAction[1],
          action: `deployment_target.${targetAction[3]}`,
          resourceType: "deployment_target",
          resourceId: targetAction[2],
          requestId: id,
          metadata: { status: value.status, version: value.version },
        });
        json(response, 200, value, id);
        return;
      }
      const approvalPolicies = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/approval-policies$/,
      );
      if (approvalPolicies && request.method === "GET") {
        await repository.requireAccess(
          user.id,
          approvalPolicies[1],
          PERMISSIONS.POLICY_READ,
        );
        json(
          response,
          200,
          {
            items: await approvalStore.listPolicies(user.id, approvalPolicies[1]),
          },
          id,
        );
        return;
      }
      if (approvalPolicies && request.method === "PUT") {
        const body = await readBody(request);
        json(
          response,
          200,
          await approvalStore.setPolicy(
            user.id,
            approvalPolicies[1],
            body,
            body.expectedVersion ?? null,
          ),
          id,
        );
        return;
      }
      const approvalsRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/approvals(?:\/([^/]+))?$/,
      );
      if (approvalsRoute && request.method === "GET") {
        json(
          response,
          200,
          approvalsRoute[2]
            ? await approvalStore.get(user.id, approvalsRoute[1], approvalsRoute[2])
            : { items: await approvalStore.list(user.id, approvalsRoute[1]) },
          id,
        );
        return;
      }
      const approvalDecision = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/approvals\/([^/]+)\/(approve|reject|cancel|override)$/,
      );
      if (approvalDecision && request.method === "POST") {
        const body = await readBody(request);
        let value;
        if (approvalDecision[3] === "cancel")
          value = await approvalStore.cancel(
            user.id,
            approvalDecision[1],
            approvalDecision[2],
          );
        else if (approvalDecision[3] === "override")
          value = await approvalStore.override(
            user.id,
            approvalDecision[1],
            approvalDecision[2],
            body.justification,
          );
        else
          value = await approvalStore.decide(
            user.id,
            approvalDecision[1],
            approvalDecision[2],
            { decision: approvalDecision[3], reason: body.reason },
          );
        if (value.createdAt) {
          observability.metrics.observe(
            "approval_wait_duration_seconds",
            { action: value.action, result: value.state },
            Math.max(0, (Date.now() - Date.parse(value.createdAt)) / 1000),
          );
        }
        if (
          ["approved", "overridden"].includes(value.state) &&
          value.action === "deployment.production" &&
          value.resourceId
        ) {
          const deployment = await deploymentStore.access(
            value.requesterId,
            approvalDecision[1],
            value.resourceId,
            PERMISSIONS.DEPLOYMENT_PRODUCTION,
          );
          if (
            deployment.currentState !== "waiting_for_approval" ||
            deployment.stateVersion !== value.resourceVersion
          )
            await approvalStore.invalidate(
              user.id,
              approvalDecision[1],
              value.id,
              "Deployment state changed before execution",
            );
          else {
            const snapshot = value.snapshot || {};
            if (snapshot.deploymentTarget?.id)
              await byocStore.assertTargetUsable(
                value.requesterId,
                approvalDecision[1],
                snapshot.deploymentTarget.id,
                {
                  environment: snapshot.environment,
                  namespace: deployment.configurationSnapshot.targetNamespace,
                },
              );
            for (const reference of snapshot.secretReferences || []) {
              const current = await secretStore.get(
                value.requesterId,
                approvalDecision[1],
                reference.id,
              );
              if (
                current.status !== "active" ||
                current.referenceVersion !== reference.referenceVersion
              )
                throw new ControlPlaneError(
                  409,
                  "SECRET_REFERENCE_CHANGED",
                  "A secret reference changed while the operation was waiting",
                );
              if (current.providerConnectionId) {
                const connection = await byocStore.connection(
                  value.requesterId,
                  approvalDecision[1],
                  current.providerConnectionId,
                );
                if (connection.status !== "active")
                  throw new ControlPlaneError(
                    409,
                    "PROVIDER_CONNECTION_NOT_USABLE",
                    "A provider connection is no longer active",
                  );
              }
            }
            const resume = async () => {
            await approvalStore.beginExecution(
              value.requesterId,
              approvalDecision[1],
              value.id,
              value.snapshot,
              `deployment:${deployment.id}`,
            );
            const queued = await deploymentStore.transition(
              deployment.id,
              "queued",
              {
                expectedVersion: deployment.stateVersion,
                commandId: `approval:${value.id}`,
                safeMessage: "Approved deployment queued",
              },
            );
            await approvalStore.finishExecution(value.id, true, approvalDecision[1]);
            return queued;
            };
            const queued = pool ? await withTransaction(pool, resume) : await resume();
            queued.workflowId = deployment.id;
            queued.telemetryContext = request.telemetryContext;
            await observability.traces.segment(
              "approval.resumption",
              {
                parent: request.telemetryContext,
                links: [deployment.telemetryContext].filter(Boolean),
                workflowId: deployment.id,
                attributes: { "approval.result": value.state },
              },
              () => deploymentQueue.enqueue(queued),
            );
          }
        }
        json(response, 200, value, id);
        return;
      }
      const policyCatalogue = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/security-policies$/,
      );
      if (policyCatalogue && request.method === "GET") {
        await repository.requireAccess(
          user.id,
          policyCatalogue[1],
          PERMISSIONS.POLICY_READ,
        );
        const targetId = url.searchParams.get("targetId"),
          target = targetId
            ? await byocStore.target(user.id, policyCatalogue[1], targetId)
            : null;
        json(
          response,
          200,
          {
            items: CATALOG.map((policy) => ({
              ...policy,
              status: targetPolicyStatus({
                target,
                policyId: policy.id,
                configuredMode: url.searchParams.get("mode") || "audit",
              }),
            })),
          },
          id,
        );
        return;
      }
      const exceptionsRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/policy-exceptions$/,
      );
      if (exceptionsRoute && request.method === "GET") {
        json(
          response,
          200,
          { items: await policyExceptionStore.list(user.id, exceptionsRoute[1]) },
          id,
        );
        return;
      }
      if (exceptionsRoute && request.method === "POST") {
        json(
          response,
          201,
          await policyExceptionStore.request(
            user.id,
            exceptionsRoute[1],
            await readBody(request),
          ),
          id,
        );
        return;
      }
      const exceptionAction = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/policy-exceptions\/([^/]+)\/(approve|revoke)$/,
      );
      if (exceptionAction && request.method === "POST") {
        const body = await readBody(request);
        const value =
          exceptionAction[3] === "approve"
            ? await policyExceptionStore.approve(
                user.id,
                exceptionAction[1],
                exceptionAction[2],
                body,
              )
            : await policyExceptionStore.revoke(
                user.id,
                exceptionAction[1],
                exceptionAction[2],
              );
        json(response, 200, value, id);
        return;
      }
      const driftRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/drift$/,
      );
      if (driftRoute && request.method === "POST") {
        const deployment = await deploymentStore.access(
          user.id,
          driftRoute[1],
          driftRoute[2],
          PERMISSIONS.DEPLOYMENT_READ,
        );
        const snapshot = deployment.configurationSnapshot || {};
        json(
          response,
          200,
          await driftDetector.run(user.id, driftRoute[1], {
            deploymentId: deployment.id,
            imageDigest: deployment.imageDigest,
            configurationSnapshotHash:
              snapshot.configurationSnapshotHash || null,
            targetId: snapshot.deploymentTargetId || null,
            namespace: snapshot.targetNamespace || null,
            secretReferences: snapshot.secretReferences || [],
            ownershipLabels: {
              "platform.example/deployment-id": deployment.id,
            },
            policyStatus: snapshot.policyStatus || "unknown",
          }),
          id,
        );
        return;
      }
      if (deploymentsMatch && request.method === "POST") {
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || key.length < 8 || key.length > 128)
          throw new ControlPlaneError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "A valid Idempotency-Key header is required",
          );
        const body = await readBody(request);
        if (
          !body.projectId ||
          !body.serviceId ||
          !body.repositoryId ||
          !body.environment ||
          !body.commitSha ||
          !body.branch
        )
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Deployment fields are required",
          );
        if (body.deploymentTargetId) {
          const namespace = body.configurationSnapshot?.targetNamespace;
          if (!namespace)
            throw new ControlPlaneError(
              400,
              "TARGET_NAMESPACE_REQUIRED",
              "A target namespace is required",
            );
          const target = await byocStore.assertTargetUsable(
            user.id,
            deploymentsMatch[1],
            body.deploymentTargetId,
            { environment: body.environment, namespace },
          );
          body.configurationSnapshot = {
            ...body.configurationSnapshot,
            deploymentTargetId: target.id,
            targetNamespace: namespace,
            targetCredentialVersion: target.credentialVersion,
            targetClusterFingerprint: target.clusterFingerprint,
          };
        }
        if (body.environmentId) {
          const references = await secretStore.deploymentReferences(
            user.id,
            deploymentsMatch[1],
            {
              projectId: body.projectId,
              serviceId: body.serviceId,
              environmentId: body.environmentId,
              isPreview: Boolean(body.preview),
              forked: Boolean(body.verifiedProviderMetadata?.fork),
            },
          );
          body.configurationSnapshot = {
            ...body.configurationSnapshot,
            secretReferences: references,
          };
        }
        await deploymentStore.assertOperationAvailable?.(
          deploymentsMatch[1],
          body.serviceId,
          body.environment,
          key,
        );
        const approvalContext = {
          action: "deployment.production",
          projectId: body.projectId,
          environment: body.environment,
          resourceType: "deployment",
        };
        const protectedByPolicy =
          body.environment === "production" &&
          Boolean(
            await approvalStore.matchingPolicy(deploymentsMatch[1], approvalContext),
          );
        if (protectedByPolicy) body.initialState = "waiting_for_approval";
        const acceptDeployment = async () => {
        const result = await deploymentStore.create(
          user.id,
          deploymentsMatch[1],
          body,
          key,
        );
        result.deployment.workflowId = result.deployment.id;
        result.deployment.telemetryContext = request.telemetryContext;
        if (result.created && protectedByPolicy) {
          const snapshot = deploymentSnapshot({
            ...body,
            organizationId: deploymentsMatch[1],
            requestingActorId: user.id,
          });
          const approval = await approvalStore.request(
            user.id,
            deploymentsMatch[1],
            {
              ...approvalContext,
              resourceId: result.deployment.id,
              resourceVersion: result.deployment.stateVersion,
            },
            snapshot,
            `deployment:${key}`,
          );
          result.deployment.approval = approval.approval && {
            id: approval.approval.id,
            state: approval.approval.state,
            snapshotDigest: approval.approval.snapshotDigest,
            expiresAt: approval.approval.expiresAt,
          };
        }
        await audit(repository, {
          actorUserId: user.id,
          organizationId: deploymentsMatch[1],
          projectId: body.projectId,
          action: "deployment.created",
          resourceType: "deployment",
          resourceId: result.deployment.id,
          requestId: id,
          metadata: { created: result.created },
        });
        return result;
        };
        const result = pool ? await withTransaction(pool, acceptDeployment) : await acceptDeployment();
        if (result.created && !protectedByPolicy) await deploymentQueue.enqueue(result.deployment);
        json(response, result.created ? 201 : 200, result.deployment, id);
        return;
      }
      if (deploymentsMatch && request.method === "GET") {
        const parsed = parse(listQuery, Object.fromEntries(url.searchParams));
        if (parsed.error)
          throw new ControlPlaneError(
            400,
            "VALIDATION_ERROR",
            "Query validation failed",
            parsed.error,
          );
        const items = await deploymentStore.list(user.id, deploymentsMatch[1], {
          state: url.searchParams.get("state"),
          projectId: url.searchParams.get("projectId"),
        });
        json(response, 200, page(items, parsed.data), id);
        return;
      }
      const deploymentMatch = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)$/,
      );
      if (deploymentMatch && request.method === "GET") {
        json(
          response,
          200,
          await deploymentStore.access(
            user.id,
            deploymentMatch[1],
            deploymentMatch[2],
          ),
          id,
        );
        return;
      }
      const deploymentEvents = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/(events|stages)$/,
      );
      if (deploymentEvents && request.method === "GET") {
        const limit = Math.min(
            Number(url.searchParams.get("pageSize") || 100),
            500,
          ),
          after = Number(url.searchParams.get("after") || 0),
          items =
            deploymentEvents[3] === "events"
              ? await deploymentStore.history(
                  user.id,
                  deploymentEvents[1],
                  deploymentEvents[2],
                  {
                    after,
                    limit: limit + 1,
                    stage: url.searchParams.get("stage"),
                    level: url.searchParams.get("level"),
                    from: url.searchParams.get("from"),
                    to: url.searchParams.get("to"),
                    search: url.searchParams.get("search"),
                  },
                )
              : await deploymentStore.listStages(
                  user.id,
                  deploymentEvents[1],
                  deploymentEvents[2],
                );
        const pageItems = items.slice(0, limit);
        json(
          response,
          200,
          {
            items: pageItems,
            pagination: {
              after,
              nextAfter:
                items.length > limit ? pageItems.at(-1)?.sequence : null,
              hasMore: items.length > limit,
            },
          },
          id,
        );
        return;
      }
      const deploymentCancel = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/cancel$/,
      );
      if (deploymentCancel && request.method === "POST") {
        const body = await readBody(request);
        const item = await deploymentStore.requestCancellation(
          user.id,
          deploymentCancel[1],
          deploymentCancel[2],
          body.reason,
        );
        await deploymentQueue.cancel(item.id);
        await audit(repository, {
          actorUserId: user.id,
          organizationId: deploymentCancel[1],
          action: "deployment.cancel_requested",
          resourceType: "deployment",
          resourceId: item.id,
          requestId: id,
          metadata: {},
        });
        json(response, 202, item, id);
        return;
      }
      const deploymentRetry = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/retry$/,
      );
      if (deploymentRetry && request.method === "POST") {
        const item = await deploymentStore.access(
          user.id,
          deploymentRetry[1],
          deploymentRetry[2],
          PERMISSIONS.DEPLOYMENT_CREATE,
        );
        if (item.currentState !== "failed")
          throw new ControlPlaneError(
            409,
            "DEPLOYMENT_NOT_FAILED",
            "Only failed deployments can be retried",
          );
        const updated = await deploymentStore.transition(item.id, "queued", {
          expectedVersion: item.stateVersion,
          commandId: `retry:${request.headers["idempotency-key"] || id}`,
          safeMessage: "Deployment retry queued",
        });
        await deploymentQueue.enqueue(updated);
        json(response, 202, updated, id);
        return;
      }
      const deploymentRollback = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/rollback$/,
      );
      if (deploymentRollback && request.method === "POST") {
        const body = await readBody(request),
          key = request.headers["idempotency-key"];
        if (!key)
          throw new ControlPlaneError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Idempotency-Key is required",
          );
        const result = await deploymentStore.createRollback(
          user.id,
          deploymentRollback[1],
          deploymentRollback[2],
          body,
          key,
        );
        if (result.created) await deploymentQueue.enqueue(result.deployment);
        await audit(repository, {
          actorUserId: user.id,
          organizationId: deploymentRollback[1],
          action: "deployment.rollback_requested",
          resourceType: "deployment",
          resourceId: result.deployment.id,
          requestId: id,
          metadata: {
            sourceDeploymentId: deploymentRollback[2],
            targetDeploymentId: result.deployment.rollbackTargetId,
            approvalId: body.approvalId || null,
            emergencyOverride: Boolean(body.emergencyOverride),
          },
        });
        json(response, 202, result.deployment, id);
        return;
      }
      const rollbackTargets = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/rollback-targets$/,
      );
      if (rollbackTargets && request.method === "GET") {
        json(
          response,
          200,
          {
            items: await deploymentStore.listRollbackTargets(
              user.id,
              rollbackTargets[1],
              rollbackTargets[2],
            ),
          },
          id,
        );
        return;
      }
      const rollbackComparison = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/rollback-comparison$/,
      );
      if (rollbackComparison && request.method === "GET") {
        const targetDeploymentId = url.searchParams.get("targetDeploymentId");
        if (!targetDeploymentId)
          throw new ControlPlaneError(
            400,
            "ROLLBACK_TARGET_REQUIRED",
            "Target deployment is required",
          );
        json(
          response,
          200,
          await deploymentStore.rollbackComparison(
            user.id,
            rollbackComparison[1],
            rollbackComparison[2],
            targetDeploymentId,
          ),
          id,
        );
        return;
      }
      const rollbackApproval = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/rollback-approvals$/,
      );
      if (rollbackApproval && request.method === "POST") {
        const body = await readBody(request),
          value = await deploymentStore.approveRollback(
            user.id,
            rollbackApproval[1],
            rollbackApproval[2],
            body.targetDeploymentId,
            body.justification,
          );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: rollbackApproval[1],
          action: "deployment.rollback_approved",
          resourceType: "deployment",
          resourceId: rollbackApproval[2],
          requestId: id,
          metadata: {
            targetDeploymentId: body.targetDeploymentId,
            approvalId: value.id,
          },
        });
        json(response, 201, value, id);
        return;
      }
      const rollbackPolicy = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/environments\/([^/]+)\/rollback-policy$/,
      );
      if (rollbackPolicy && request.method === "PUT") {
        json(
          response,
          200,
          await deploymentStore.setRollbackPolicy(
            user.id,
            rollbackPolicy[1],
            decodeURIComponent(rollbackPolicy[2]),
            await readBody(request),
          ),
          id,
        );
        return;
      }
      const deploymentStream = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/stream$/,
      );
      if (deploymentStream && request.method === "GET") {
        const orgId = deploymentStream[1],
          deploymentId = deploymentStream[2];
        await deploymentStore.access(user.id, orgId, deploymentId);
        const userKey = `u:${user.id}`,
          orgKey = `o:${orgId}`;
        if (
          (streams.get(userKey) || 0) >= config.SSE_MAX_PER_USER ||
          (streams.get(orgKey) || 0) >= config.SSE_MAX_PER_ORGANIZATION
        )
          throw new ControlPlaneError(
            429,
            "STREAM_CONNECTION_LIMIT",
            "Live stream connection limit reached",
          );
        let cursor = Number(
          request.headers["last-event-id"] ||
            url.searchParams.get("after") ||
            0,
        );
        if (!Number.isSafeInteger(cursor) || cursor < 0)
          throw new ControlPlaneError(
            400,
            "INVALID_EVENT_CURSOR",
            "Last-Event-ID is invalid",
          );
        streams.set(userKey, (streams.get(userKey) || 0) + 1);
        streams.set(orgKey, (streams.get(orgKey) || 0) + 1);
        streamMetrics.opened++;
        observability.metrics.inc("log_stream_connections_total", {
          transport: "sse",
          result: "opened",
        });
        observability.metrics.inc("log_streams_active", { transport: "sse" });
        if (cursor) streamMetrics.reconnects++;
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-store",
          connection: "keep-alive",
          "x-request-id": id,
          "x-accel-buffering": "no",
        });
        let sending = false,
          closed = false,
          timer,
          keepalive,
          maxDuration;
        const close = (reason = "client") => {
          if (closed) return;
          closed = true;
          clearInterval(timer);
          clearInterval(keepalive);
          clearTimeout(maxDuration);
          streams.set(userKey, Math.max(0, (streams.get(userKey) || 1) - 1));
          streams.set(orgKey, Math.max(0, (streams.get(orgKey) || 1) - 1));
          streamMetrics.closed++;
          observability.metrics.inc(
            "log_streams_active",
            { transport: "sse" },
            -1,
          );
          observability.metrics.inc("log_stream_disconnects_total", { reason });
          response.end();
        };
        const send = async () => {
          if (sending || closed) return;
          sending = true;
          try {
            await deploymentStore.access(user.id, orgId, deploymentId);
            for (const event of await deploymentStore.history(
              user.id,
              orgId,
              deploymentId,
              { after: cursor, limit: 500 },
            )) {
              if (Number(event.sequence) !== cursor + 1) {
                response.write(
                  `event: gap\ndata: ${JSON.stringify({ expected: cursor + 1, received: Number(event.sequence) })}\n\n`,
                );
              }
              cursor = Number(event.sequence);
              if (
                !response.write(
                  `id: ${event.sequence}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`,
                )
              ) {
                streamMetrics.backpressure++;
                await new Promise((resolve) => response.once("drain", resolve));
              }
              streamMetrics.delivered++;
              if (event.timestamp)
                observability.metrics.set(
                  "log_stream_freshness_seconds",
                  { transport: "sse" },
                  Math.max(
                    0,
                    (Date.now() - Date.parse(event.timestamp)) / 1000,
                  ),
                );
            }
            const latest = await deploymentStore.access(
              user.id,
              orgId,
              deploymentId,
            );
            if (
              [
                "build_complete",
                "ready",
                "failed",
                "cancelled",
                "rolled_back",
              ].includes(latest.currentState)
            ) {
              response.write(
                `event: complete\ndata: ${JSON.stringify({ deploymentId, state: latest.currentState, lastSequence: cursor })}\n\n`,
              );
              close("completed");
            }
          } catch {
            close("error");
          } finally {
            sending = false;
          }
        };
        await send();
        if (closed) return;
        timer = setInterval(() => void send(), 1000);
        keepalive = setInterval(() => {
          if (!response.write(`: heartbeat ${Date.now()}\n\n`))
            streamMetrics.backpressure++;
        }, config.SSE_HEARTBEAT_MS);
        maxDuration = setTimeout(
          () => close("max_duration"),
          config.SSE_MAX_DURATION_MS,
        );
        request.on("close", () => close("client"));
        return;
      }
      if (
        url.pathname === "/api/v1/metrics/streams" &&
        request.method === "GET"
      ) {
        json(
          response,
          200,
          {
            ...streamMetrics,
            active: [...streams.entries()]
              .filter(([key]) => key.startsWith("u:"))
              .reduce((n, [, value]) => n + value, 0),
          },
          id,
        );
        return;
      }
      const logAuthorization = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/logs\/authorization$/,
      );
      if (logAuthorization && request.method === "POST") {
        await deploymentStore.access(
          user.id,
          logAuthorization[1],
          logAuthorization[2],
        );
        json(
          response,
          200,
          {
            downloadUrl: `/api/v1/organizations/${encodeURIComponent(logAuthorization[1])}/deployments/${encodeURIComponent(logAuthorization[2])}/logs`,
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            authorization: "bearer-required",
          },
          id,
        );
        return;
      }
      const logRetention = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/logs\/retention$/,
      );
      if (logRetention && request.method === "GET") {
        json(
          response,
          200,
          await deploymentStore.retention(
            user.id,
            logRetention[1],
            logRetention[2],
          ),
          id,
        );
        return;
      }
      const logDownload = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/deployments\/([^/]+)\/logs$/,
      );
      if (logDownload && request.method === "GET") {
        const logs = await deploymentStore.listLogs(
          user.id,
          logDownload[1],
          logDownload[2],
        );
        response.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": `attachment; filename="deployment-${logDownload[2]}.log"`,
          "cache-control": "no-store",
          "x-request-id": id,
        });
        for (const item of logs) {
          if (
            !response.write(
              `[${item.sequence}] [${item.stage || "worker"}] ${item.content}\n`,
            )
          )
            await new Promise((resolve) => response.once("drain", resolve));
        }
        response.end();
        return;
      }
      const previewPolicies = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/preview-policies$/,
      );
      if (previewPolicies && request.method === "PUT") {
        const body = await readBody(request);
        json(
          response,
          200,
          await previewStore.policy(user.id, previewPolicies[1], body),
          id,
        );
        return;
      }
      const previewsRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/previews$/,
      );
      if (previewsRoute && request.method === "GET") {
        json(
          response,
          200,
          { items: await previewStore.list(user.id, previewsRoute[1]) },
          id,
        );
        return;
      }
      if (previewsRoute && request.method === "POST") {
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || key.length < 8)
          throw new ControlPlaneError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "A valid Idempotency-Key header is required",
          );
        const body = await readBody(request);
        const result = await previewController.createManual(
          user.id,
          previewsRoute[1],
          body,
          key,
        );
        await audit(repository, {
          actorUserId: user.id,
          organizationId: previewsRoute[1],
          projectId: body.projectId,
          action: "preview.created",
          resourceType: "preview",
          resourceId: result.preview.id,
          requestId: id,
          metadata: {
            revisionId: result.revision.id,
            commitSha: result.revision.commitSha,
          },
        });
        json(response, result.created ? 201 : 200, result, id);
        return;
      }
      const previewRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/previews\/([^/]+)$/,
      );
      if (previewRoute && request.method === "GET") {
        json(
          response,
          200,
          await previewStore.get(user.id, previewRoute[1], previewRoute[2]),
          id,
        );
        return;
      }
      if (previewRoute && request.method === "DELETE") {
        await previewStore.get(user.id, previewRoute[1], previewRoute[2]);
        await repository.requireAccess(
          user.id,
          previewRoute[1],
          PERMISSIONS.DEPLOYMENT_CREATE,
        );
        const job = await previewStore.scheduleCleanup(previewRoute[2], "manual", previewRoute[1]);
        json(response, 202, job, id);
        return;
      }
      const previewRouting = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/previews\/([^/]+)\/route$/,
      );
      if (previewRouting && request.method === "POST") {
        const org = await repository.requireOrganization(previewRouting[1]),
          preview = await previewStore.get(
            user.id,
            previewRouting[1],
            previewRouting[2],
          ),
          project = await repository.getProject(
            user.id,
            previewRouting[1],
            preview.projectId,
          ),
          service = await repository.getService(
            user.id,
            previewRouting[1],
            preview.serviceId,
          ),
          resourceName = preview.isolationKey,
          route = await previewStore.route(user.id, previewRouting[1], {
            previewId: preview.id,
            namespace: `platform-${org.slug}`,
            resourceName,
            backendService: workloadName(project.slug, service.name, {
              isolationKey: preview.isolationKey,
            }),
            backendPort: Number((await readBody(request)).backendPort || 3000),
            tlsRequired: true,
          });
        await previewStore.setDeploymentResource(preview.organizationId, preview.id, {
          namespace: route.namespace,
          workload: route.backendService,
          organizationSlug: org.slug,
          deploymentId: preview.revision.deploymentId,
          isolationKey: preview.isolationKey,
        });
        try {
          const inspected = await previewRouter.apply({
            ...route,
            routeId: route.id,
            previewId: preview.id,
            organizationId: preview.organizationId,
          });
          const cert = await previewRouter.certificate(route);
          await previewStore.updateRoute(preview.organizationId, route.id, {
            status:
              inspected.exists && inspected.backendResolved
                ? "ready"
                : "failed",
            certificateStatus: cert.status,
            certificateExpiresAt: cert.expiresAt || null,
          });
        } catch (error) {
          await previewStore.updateRoute(preview.organizationId, route.id, {
            status: "failed",
            failureCode: error.code || "ROUTE_OPERATION_FAILED",
          });
          throw error;
        }
        json(
          response,
          201,
          await previewStore.get(user.id, previewRouting[1], preview.id),
          id,
        );
        return;
      }
      const previewVerify = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/previews\/([^/]+)\/verify$/,
      );
      if (previewVerify && request.method === "POST") {
        const preview = await previewStore.get(
            user.id,
            previewVerify[1],
            previewVerify[2],
          ),
          route = preview.route;
        if (!route)
          throw new ControlPlaneError(
            409,
            "ROUTE_NOT_CREATED",
            "Preview route has not been created",
          );
        const revision = preview.revision,
          deployment = revision.deploymentId
            ? await deploymentStore.access(
                user.id,
                previewVerify[1],
                revision.deploymentId,
              )
            : null;
        if (!deployment || deployment.currentState !== "ready")
          throw new ControlPlaneError(
            409,
            "DEPLOYMENT_NOT_READY",
            "Preview deployment health has not passed",
          );
        const inspected = await previewRouter.inspect({
            ...route,
            routeId: route.id,
          }),
          cert = await previewRouter.certificate(route),
          scope = config.PREVIEW_BASE_DOMAIN.endsWith(".local")
            ? "local"
            : "public",
          httpVerified = options.previewHttpVerifier
            ? await options.previewHttpVerifier({
                hostname: route.hostname,
                expectedServiceId: preview.serviceId,
                scope,
              })
            : config.DEPLOYMENT_TARGET === "test";
        await previewStore.updateRoute(preview.organizationId, route.id, {
          status:
            inspected.exists && inspected.backendResolved ? "ready" : "failed",
          certificateStatus: cert.status,
          certificateExpiresAt: cert.expiresAt || null,
        });
        json(
          response,
          200,
          await previewStore.markReady(preview.id, { organizationId: preview.organizationId,
            routeId: route.id,
            deploymentHealthy: true,
            httpVerified,
            scope,
          }),
          id,
        );
        return;
      }
      const domainsRoute = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/domains$/,
      );
      if (domainsRoute && request.method === "GET") {
        json(
          response,
          200,
          { items: await previewStore.listDomains(user.id, domainsRoute[1]) },
          id,
        );
        return;
      }
      if (domainsRoute && request.method === "POST") {
        const body = await readBody(request),
          result = await previewStore.requestDomain(user.id, domainsRoute[1], body);
        await audit(repository, {
          actorUserId: user.id,
          organizationId: domainsRoute[1],
          projectId: body.projectId,
          action: "domain.challenge_created",
          resourceType: "custom_domain",
          resourceId: result.domain.id,
          requestId: id,
          metadata: { hostname: result.domain.hostnameAscii },
        });
        json(response, 201, result, id);
        return;
      }
      const domainAction = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/domains\/([^/]+)\/(verify|activate)$/,
      );
      if (domainAction && request.method === "POST") {
        const body = await readBody(request);
        if (domainAction[3] === "verify") {
          json(
            response,
            200,
            await previewStore.verifyDomain(
              user.id,
              domainAction[1],
              domainAction[2],
              body,
            ),
            id,
          );
          return;
        }
        const domain = await previewStore._domain(domainAction[1], domainAction[2]),
          org = await repository.requireOrganization(domainAction[1]),
          project = await repository.getProject(
            user.id,
            domainAction[1],
            domain.projectId,
          ),
          service = await repository.getService(
            user.id,
            domainAction[1],
            domain.serviceId,
          ),
          resourceName = `domain-${crypto.createHash("sha256").update(domain.hostnameAscii).digest("hex").slice(0, 20)}`,
          result = await previewStore.activateDomain(
            user.id,
            domainAction[1],
            domain.id,
            {
              namespace: `platform-${org.slug}`,
              resourceName,
              backendService: `${project.slug}-${service.name}`
                .slice(0, 63)
                .replace(/-$/, ""),
              backendPort: Number(body.backendPort || 3000),
            },
          );
        const inspected = await previewRouter.apply({
            ...result.route,
            routeId: result.route.id,
            previewId: `domain-${domain.id}`,
            organizationId: domain.organizationId,
          }),
          cert = await previewRouter.certificate(result.route);
        await previewStore.updateRoute(domain.organizationId, result.route.id, {
          status:
            inspected.exists && inspected.backendResolved ? "ready" : "failed",
          certificateStatus: cert.status,
          certificateExpiresAt: cert.expiresAt || null,
        });
        Object.assign(domain, await previewStore.setDomainStatus(domain.organizationId, domain.id,
          cert.status === "ready" ? "active" : "certificate_pending"));
        json(response, 200, { domain, route: result.route }, id);
        return;
      }
      const domainDelete = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/domains\/([^/]+)$/,
      );
      if (domainDelete && request.method === "DELETE") {
        const domain = await previewStore._domain(domainDelete[1], domainDelete[2]);
        await repository.requireAccess(
          user.id,
          domainDelete[1],
          PERMISSIONS.ENVIRONMENT_MANAGE,
        );
        if (domain.routeId) {
          const route = await previewStore.routeRecord(domain.organizationId, domain.routeId);
          await previewRouter.deleteOwned({
            ...route,
            routeId: route.id,
            previewId: `domain-${domain.id}`,
            organizationId: domain.organizationId,
          });
          await previewStore.updateRoute(domain.organizationId, route.id, {
            status: "removed",
            certificateStatus: "removed",
          });
        }
        json(
          response,
          200,
          await previewStore.removeDomain(user.id, domainDelete[1], domain.id),
          id,
        );
        return;
      }
      const previewReconcile = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/previews\/reconcile$/,
      );
      if (previewReconcile && request.method === "POST") {
        await repository.requireAccess(
          user.id,
          previewReconcile[1],
          PERMISSIONS.ENVIRONMENT_MANAGE,
        );
        json(
          response,
          200,
          {
            items: await previewReconciler.reconcileCleanup(previewReconcile[1]),
            certificateWarnings: await previewReconciler.certificateWarnings(30, previewReconcile[1]),
          },
          id,
        );
        return;
      }
      const auditCollection = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/audit\/events$/,
      );
      const billingOverview = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/billing\/overview$/,
      );
      if (billingOverview && request.method === "GET") {
        await repository.requireAccess(user.id, billingOverview[1], PERMISSIONS.BILLING_READ);
        json(response, 200, {
          plan: await entitlements.effective(billingOverview[1]),
          meters: Object.values(METERS),
          currentUsage: await usageLedger.aggregate(billingOverview[1]),
          dataState: "processed_unreconciled",
          paymentCollection: "unsupported",
        }, id); return;
      }
      const billingUsage = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/billing\/usage$/,
      );
      if (billingUsage && request.method === "GET") {
        await repository.requireAccess(user.id, billingUsage[1], PERMISSIONS.BILLING_READ);
        json(response, 200, await usageLedger.list(billingUsage[1], {
          meterId: url.searchParams.get("meterId") || undefined,
          cursor: Number(url.searchParams.get("cursor") || 0),
          limit: Number(url.searchParams.get("limit") || 50),
        }), id); return;
      }
      const billingPlan = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/billing\/plan$/,
      );
      if (billingPlan && request.method === "PUT") {
        await repository.requireAccess(user.id, billingPlan[1], PERMISSIONS.BILLING_MANAGE);
        const body = await readBody(request);
        const assigned = await entitlements.assign(billingPlan[1], body.planId, body.effectiveAt);
        await eventSink({ action: "billing.plan.assigned", organizationId: billingPlan[1], actorId: user.id, resourceType: "plan", resourceId: body.planId, result: "success", idempotencyKey: `plan:${billingPlan[1]}:${assigned.effectiveAt}`, metadata: { planVersion: assigned.planVersion } });
        json(response, 200, assigned, id); return;
      }
      if (auditCollection && request.method === "GET") {
        const organizationId = auditCollection[1];
        const query = Object.fromEntries(url.searchParams.entries());
        const result = await auditService.search(user.id, organizationId, query);
        await auditService.append({
          organizationId,
          actorId: user.id,
          action: "audit.search.performed",
          resourceType: "audit_event",
          result: "success",
          requestId: id,
          correlationId: id,
          sourceCategory: "audit",
          idempotencyKey: `audit-search:${id}`,
          metadata: { filters: Object.keys(query).sort() },
        });
        json(response, 200, result, id);
        return;
      }
      const auditEvent = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/audit\/events\/([^/]+)$/,
      );
      if (auditEvent && request.method === "GET") {
        json(
          response,
          200,
          await auditService.get(user.id, auditEvent[1], auditEvent[2]),
          id,
        );
        return;
      }
      const auditVerify = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/audit\/integrity\/verify$/,
      );
      if (auditVerify && request.method === "POST") {
        const auditRange = await readBody(request);
        const verification = await auditService.verify(
          user.id,
          auditVerify[1],
          auditRange,
        );
        observability.metrics.inc("audit_jobs_total", {
          operation: "integrity_verify",
          result: verification.valid ? "success" : "failure",
        });
        json(response, 200, verification, id);
        return;
      }
      const auditExports = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/audit\/exports$/,
      );
      if (auditExports && request.method === "POST") {
        const exportRequest = await readBody(request);
        const idempotencyKey = request.headers["idempotency-key"];
        if (!idempotencyKey)
          throw new ControlPlaneError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Idempotency-Key is required",
          );
        const exportJob = await auditService.requestExport(
          user.id,
          auditExports[1],
          exportRequest.filters || {},
          idempotencyKey,
        );
        observability.metrics.inc("audit_jobs_total", {
          operation: "export_request",
          result: "accepted",
        });
        json(response, 202, exportJob, id);
        return;
      }
      const auditDownload = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/audit\/exports\/([^/]+)\/download$/,
      );
      if (auditDownload && request.method === "GET") {
        const output = await auditService.download(
          user.id,
          auditDownload[1],
          auditDownload[2],
          request.headers["x-audit-download-token"],
        );
        response.writeHead(200, {
          "content-type": output.contentType,
          "content-disposition": `attachment; filename="audit-${auditDownload[2]}.jsonl"`,
          "cache-control": "no-store",
          "x-content-sha256": output.sha256,
          "x-request-id": id,
        });
        response.end(output.body);
        return;
      }
      const auditRetention = url.pathname.match(
        /^\/api\/v1\/organizations\/([^/]+)\/audit\/retention$/,
      );
      if (auditRetention && request.method === "GET") {
        json(
          response,
          200,
          await auditService.retentionDetails(user.id, auditRetention[1]),
          id,
        );
        return;
      }
      if (auditRetention && request.method === "PUT") {
        const retentionRequest = await readBody(request);
        json(
          response,
          200,
          await auditService.setRetention(
            user.id,
            auditRetention[1],
            retentionRequest.retentionDays,
          ),
          id,
        );
        return;
      }
      throw new ControlPlaneError(404, "ROUTE_NOT_FOUND", "Route not found");
    } catch (error) {
      const normalized =
        error instanceof ControlPlaneError
          ? error
          : new ControlPlaneError(
              500,
              "INTERNAL_SERVER_ERROR",
              "An unexpected error occurred",
            );
      json(response, normalized.status, errorBody(normalized, id), id);
    }
  }
  async function handle(request, response) {
    const started = process.hrtime.bigint();
    const route = normalizeRoute(request.url);
    const method = String(request.method || "GET").toUpperCase();
    const parent = observability.traces.accept(request.headers);
    request.platformRequestId = requestId(request);
    request.telemetryContext = parent;
    observability.metrics.inc("http_active_requests", {
      service: config.SERVICE_NAME,
    });
    response.once("finish", () => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const statusClass = `${Math.floor(response.statusCode / 100)}xx`;
      const result =
        response.statusCode >= 500
          ? "platform_error"
          : response.statusCode >= 400
            ? "client_error"
            : "success";
      observability.metrics.inc("http_requests_total", {
        method,
        route,
        status_class: statusClass,
        result,
      });
      observability.metrics.observe(
        "http_request_duration_seconds",
        { method, route, result },
        seconds,
      );
      observability.metrics.inc(
        "http_active_requests",
        { service: config.SERVICE_NAME },
        -1,
      );
      observability.logger.log(
        response.statusCode >= 500 ? "error" : "info",
        "http.request",
        {
          requestId: request.platformRequestId,
          traceId: parent.traceId,
          result,
          method,
          route,
          statusCode: response.statusCode,
          durationSeconds: seconds,
        },
      );
    });
    return observability.traces.segment(
      "http.request",
      {
        parent,
        attributes: { "http.request.method": method, "http.route": route },
        workflowId: request.headers["x-workflow-id"] || null,
      },
      () => handleRequest(request, response),
    );
  }
  return {
    config,
    repository,
    pool,
    deploymentStore,
    deploymentQueue,
    previewStore,
    previewRouter,
    previewReconciler,
    byocStore,
    secretStore,
    approvalStore,
    policyExceptionStore,
    driftDetector,
    auditService,
    usageLedger,
    entitlements,
    quotaManager,
    observability,
    securityEvents,
    handle,
  };
}
function startServer(options = {}) {
  const app = createApplication(options);
  const telemetryRuntime = initializeTelemetry(
    app.config,
    options.telemetryOptions,
  );
  const server = http.createServer(app.handle);
  const shutdown = () =>
    server.close(async () => {
      if (app.deploymentQueue) await app.deploymentQueue.close();
      if (app.pool) await app.pool.end();
      await telemetryRuntime.shutdown();
    });
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  server.on("error", (error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Control plane server error",
        error: error.message,
      }),
    );
    process.exitCode = 1;
  });
  server.listen(app.config.PORT, () =>
    console.log(
      JSON.stringify({
        level: "info",
        message: "Control plane started",
        port: app.config.PORT,
      }),
    ),
  );
  return server;
}
if (require.main === module) startServer();
module.exports = { createApplication, startServer, page };
