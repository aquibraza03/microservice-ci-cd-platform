const http = require("http");
const { workerReady } = require('./readiness');
const { runtimeConfig, requireDurableOverrides } = require('../production');
const { bindTransactions } = require('../database/transaction');
const { PostgresAuditService } = require('../audit/postgres-service');
const { PostgresUsageLedger, PostgresEntitlementService, PostgresQuotaManager } = require('../billing/postgres');
const { PostgresByocStore } = require('../byoc/postgres-store');
const { dispatchDeploymentOutbox } = require('../queue/outbox');
const { createPool } = require("../database/pool");
const { PostgresRepository } = require("../domain/postgres-repository");
const { PostgresDeploymentStore } = require("../deployments/postgres-store");
const { BullDeploymentQueue } = require("../queue/deployment-queue");
const { GitHubAppProvider } = require("../git/github-app");
const { RootlessBuildKitExecutor } = require("./buildkit");
const { DeploymentPipeline } = require("./pipeline");
const { PipelineMetrics } = require("../metrics/pipeline-metrics");
const { createObservability } = require("../observability");
const { metricsTokenMatches } = require("../observability/logger");
const { initializeTelemetry } = require("../observability/sdk");
const { classifyError } = require("../observability/metrics");
const { instrumentPool } = require("../observability/database");
const {
  GhcrRegistryProvider,
  LocalRegistryProvider,
  TestRegistryProvider,
} = require("../providers/registry");
const {
  SupplyChainVerifier,
  TestSupplyChainVerifier,
  VulnerabilityPolicy,
} = require("../supply-chain/verifier");
const {
  KubernetesDeploymentProvider,
  TestDeploymentTargetProvider,
} = require("../providers/deployment-target");
const {
  HttpHealthVerifier,
  TestHealthVerifier,
} = require("../providers/health-verifier");
async function startWorker(options = {}) {
  const config = runtimeConfig(options);
  requireDurableOverrides(config, options, { repository: PostgresRepository, store: PostgresDeploymentStore, queue: BullDeploymentQueue, pipeline: null });
  if (config.CONTROL_PLANE_STORAGE !== 'postgres') throw new Error('Worker requires PostgreSQL durable state');
  const pool = bindTransactions(options.pool || createPool(config));
  try { await pool.query('SELECT 1 FROM enterprise_audit_events,usage_events,quota_reservations,quota_limits,organization_subscriptions,deployment_outbox LIMIT 0'); }
  catch (error) { if (pool) await pool.end(); throw error; }
  const telemetryRuntime = initializeTelemetry(
    config,
    options.telemetryOptions,
  );
  const observability =
    options.observability ||
    createObservability(
      { ...config, SERVICE_NAME: "deployment-worker" },
      options.observabilityOptions,
    );
  if (config.CONTROL_PLANE_STORAGE !== "postgres")
    throw new Error("Worker requires PostgreSQL durable state");
  const repository = options.repository || new PostgresRepository(pool),
    store =
      options.store ||
      new PostgresDeploymentStore(repository, pool, {
        retentionDays: config.BUILD_LOG_RETENTION_DAYS,
        maxLogBytes: config.MAX_DEPLOYMENT_LOG_BYTES,
      }),
    queue =
      options.queue ||
      new BullDeploymentQueue({
        connection: { url: config.REDIS_URL },
        queueName: config.DEPLOYMENT_QUEUE_NAME,
        traceManager: observability.traces,
        metrics: observability.metrics,
      }),
    git = options.gitProvider || new GitHubAppProvider(config),
    builder =
      options.buildExecutor ||
      new RootlessBuildKitExecutor({
        command: config.BUILDKIT_COMMAND,
        timeoutMs: config.WORKER_JOB_TIMEOUT_MS,
      }),
    registry =
      options.registryProvider ||
      (config.REGISTRY_PROVIDER === "test"
        ? new TestRegistryProvider()
        : config.REGISTRY_PROVIDER === "local"
          ? new LocalRegistryProvider({ host: config.LOCAL_REGISTRY_HOST })
          : new GhcrRegistryProvider({
              owner: config.GHCR_OWNER,
              username: config.GHCR_USERNAME,
              token: config.GHCR_TOKEN,
            })),
    supply =
      options.supplyChainVerifier ||
      (config.SUPPLY_CHAIN_MODE === "test"
        ? new TestSupplyChainVerifier()
        : new SupplyChainVerifier({
            policy: new VulnerabilityPolicy({
              high: config.HIGH_VULNERABILITY_POLICY,
            }),
            cosignKeyPath: config.COSIGN_KEY_PATH,
            certificateIdentity: config.COSIGN_CERTIFICATE_IDENTITY,
            certificateIssuer: config.COSIGN_CERTIFICATE_ISSUER,
          })),
    target =
      options.deploymentProvider ||
      (config.DEPLOYMENT_TARGET === "test"
        ? new TestDeploymentTargetProvider()
        : new KubernetesDeploymentProvider({
            context: config.KUBERNETES_CONTEXT,
            timeoutMs: config.KUBERNETES_TIMEOUT_MS,
            endpointHost: config.KIND_ENDPOINT_HOST,
          })),
    health =
      options.healthVerifier ||
      (config.DEPLOYMENT_TARGET === "test"
        ? new TestHealthVerifier()
        : new HttpHealthVerifier({ timeoutMs: config.KUBERNETES_TIMEOUT_MS })),
    metrics = options.metrics || new PipelineMetrics(),
    pipeline =
      options.pipeline ||
      new DeploymentPipeline({
        store,
        repository,
        gitProvider: git,
        buildExecutor: builder,
        registryProvider: registry,
        supplyChainVerifier: supply,
        deploymentProvider: target,
        healthVerifier: health,
        registryOwner: config.GHCR_OWNER,
        heartbeatMs: config.WORKER_HEARTBEAT_MS,
        maxRepositoryBytes: config.MAX_REPOSITORY_BYTES,
        observability,
      });
  if (config.NODE_ENV === 'production' && (repository.pool !== pool || store.repository !== repository || store.pool !== pool)) {
    await queue.close(); await pool.end();
    throw new Error('Production worker dependencies must share the authoritative repository and pool');
  }
  instrumentPool(pool, observability.metrics);
  repository.auditService = new PostgresAuditService(repository, { integrityKeys: { 1: config.AUDIT_INTEGRITY_KEY ? Buffer.from(config.AUDIT_INTEGRITY_KEY, 'base64') : Buffer.alloc(32, 9) } });
  repository.usageLedger = new PostgresUsageLedger(pool, { auditService: repository.auditService });
  repository.entitlements = new PostgresEntitlementService(pool, { auditService: repository.auditService });
  repository.quotaManager = new PostgresQuotaManager(pool, { auditService: repository.auditService });
  await pool.query('SELECT 1 FROM enterprise_audit_events LIMIT 0');
  const recovery = new PostgresByocStore(repository, {});
  let maintaining = false;
  const maintain = async () => {
    if (maintaining) return;
    maintaining = true;
    try { await recovery.recoverInterruptedValidations(); await dispatchDeploymentOutbox(pool, queue, store); }
    finally { maintaining = false; }
  };
  await maintain();
  const maintenance = setInterval(() => { void maintain().catch(() => { ready = false; }); }, 5000);
  maintenance.unref();
  let ready = false;
  const worker = queue.createWorker(
    async (job) => {
      metrics.heartbeat();
      if (job.attemptsMade) metrics.inc("retried_jobs");
      const queued = observability.traces.fromQueue(job.data.telemetry);
      const started = process.hrtime.bigint();
      return observability.traces.segment(
        "deployment.worker.attempt",
        {
          links: [queued.parent].filter(Boolean),
          workflowId: queued.workflowId || job.data.deploymentId,
          attempt: job.attemptsMade + 1,
          attributes: { "worker.type": "deployment" },
        },
        async () => {
          try {
            const result = await pipeline.execute(job.data.deploymentId, { organizationId: job.data.organizationId });
            metrics.inc("completed_jobs");
            observability.metrics.inc("jobs_total", {
              worker_type: "deployment",
              result: "success",
            });
            return result;
          } catch (error) {
            metrics.inc("failed_jobs");
            observability.metrics.inc("jobs_total", {
              worker_type: "deployment",
              result: "failure",
            });
            if (job.attemptsMade)
              observability.metrics.inc("job_retries_total", {
                worker_type: "deployment",
                error_category: classifyError(error),
              });
            throw error;
          } finally {
            observability.metrics.observe(
              "job_duration_seconds",
              { worker_type: "deployment", result: "completed" },
              Number(process.hrtime.bigint() - started) / 1e9,
            );
          }
        },
      );
    },
    { concurrency: config.WORKER_CONCURRENCY },
  );
  worker.on("ready", () => {
    ready = true;
    observability.metrics.set(
      "worker_available",
      { worker_type: "deployment" },
      1,
    );
  });
  worker.on("stalled", () => metrics.inc("retried_jobs"));
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200);
      res.end("ok");
      return;
    }
    if (req.url === "/ready") {
      ready = await workerReady({ pool, queue, worker });
      res.writeHead(ready ? 200 : 503);
      res.end(ready ? "ready" : "not ready");
      return;
    }
    if (req.url === "/metrics") {
      const supplied =
        req.headers["x-metrics-token"] ||
        String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (
        !metricsTokenMatches(
          config.METRICS_TOKEN || "local-development-metrics-token",
          supplied,
        )
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      await queue.depth();
      res.writeHead(200, {
        "content-type": observability.metrics.contentType(),
      });
      res.end(
        `${await observability.metrics.render()}${metrics.render(await queue.depth())}`,
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(Number(process.env.WORKER_HEALTH_PORT || 3002));
  const shutdown = async () => {
    clearInterval(maintenance);
    ready = false;
    observability.metrics.set(
      "worker_available",
      { worker_type: "deployment" },
      0,
    );
    await worker.close();
    await queue.close();
    await pool.end();
    await telemetryRuntime.shutdown();
    server.close();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return { worker, server, shutdown, observability };
}
if (require.main === module)
  startWorker().catch((error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Worker startup failed",
        error: error.message,
      }),
    );
    process.exitCode = 1;
  });
module.exports = { startWorker };
