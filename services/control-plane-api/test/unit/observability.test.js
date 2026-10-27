const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const yaml = require("yaml");
const {
  CATALOG,
  LABEL_BUDGET,
  FORBIDDEN_LABELS,
  PlatformMetrics,
  classifyError,
  normalizeRoute,
  validateCatalog,
} = require("../../src/observability/metrics");
const {
  TraceManager,
  parseTraceparent,
  samplingDecision,
} = require("../../src/observability/tracing");
const { OperationalLogger } = require("../../src/observability/logger");
const { initializeTelemetry } = require("../../src/observability/sdk");
const { MemoryDeploymentQueue } = require("../../src/queue/deployment-queue");

const root = path.join(__dirname, "../../../..");

describe("Phase 4 Part 1 observability", () => {
  it("uses valid Prometheus names, base units and bounded low-cardinality labels", async () => {
    expect(validateCatalog()).to.equal(true);
    for (const [name, labels] of Object.entries(CATALOG)) {
      expect(labels.length, name).to.be.at.most(LABEL_BUDGET);
      expect(
        labels.some((label) => FORBIDDEN_LABELS.has(label)),
        name,
      ).to.equal(false);
      if (/(_duration|_delay|_age|_expiry)_seconds$/.test(name))
        expect(name, name).to.match(/_seconds$/);
    }
    expect(
      normalizeRoute(
        "/api/v1/deployments/94b2f20b-54df-41c1-a187-a7f8a7e0ab1a?token=canary",
      ),
    ).to.equal("/api/v1/deployments/:id");
    expect(
      normalizeRoute(
        "/api/v1/organizations/org_61f0f14a-project-user-value/projects",
      ),
    ).to.equal("/api/v1/organizations/:id/projects");
    expect(classifyError({ code: "user-provided-canary-123" })).to.equal(
      "internal",
    );
    expect(classifyError({ status: 429 })).to.equal("rate_limited");
    const metrics = new PlatformMetrics();
    metrics.inc("http_requests_total", {
      method: "GET",
      route: "/api/v1/me",
      status_class: "2xx",
      result: "success",
    });
    expect(await metrics.render()).to.include("platform_http_requests_total");
  });

  it("propagates only safe W3C context through queues and links retry/resumption segments", async () => {
    const traces = new TraceManager();
    const incoming = traces.accept({
      traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    });
    const queue = new MemoryDeploymentQueue({ traceManager: traces });
    await queue.enqueue({
      id: "deployment-1",
      organizationId: "org-canary",
      telemetryContext: incoming,
      workflowId: "workflow-1",
    });
    const metadata = queue.jobs.get("deployment-1").data.telemetry;
    expect(Object.keys(metadata)).to.have.members([
      "traceparent",
      "workflowId",
    ]);
    expect(parseTraceparent(metadata.traceparent).traceId).to.equal(
      incoming.traceId,
    );
    const resumed = traces.fromQueue(metadata);
    await traces.segment(
      "worker.retry",
      { links: [resumed.parent], workflowId: resumed.workflowId, attempt: 2 },
      async () => true,
    );
    await traces.segment(
      "approval.resumption",
      { links: [resumed.parent], workflowId: resumed.workflowId },
      async () => true,
    );
    expect(traces.segments.at(-2).links).to.include(incoming.traceId);
    expect(traces.segments.at(-1).workflowId).to.equal("workflow-1");
    expect(traces.segments.every((segment) => segment.endedAt)).to.equal(true);
  });

  it("applies explicit sampling rules", () => {
    expect(samplingDecision({ route: "/health", random: () => 0.5 })).to.equal(
      false,
    );
    expect(samplingDecision({ result: "error", random: () => 1 })).to.equal(
      true,
    );
    expect(samplingDecision({ durationSeconds: 3, random: () => 1 })).to.equal(
      true,
    );
    expect(
      samplingDecision({ securitySensitive: true, random: () => 1 }),
    ).to.equal(true);
    expect(samplingDecision({ random: () => 0.05 })).to.equal(true);
  });

  it("redacts canary secrets and prevents log forging without mixing deployment logs", () => {
    const output = [];
    const logger = new OperationalLogger({ sink: (line) => output.push(line) });
    const event = logger.log("error", "provider\nforged", {
      authorization: "Bearer SYNTHETIC_TELEMETRY_CANARY",
      message: "postgres://user:SYNTHETIC_TELEMETRY_CANARY@db/name\nforged",
      deploymentId: "deployment-safe-id",
    });
    expect(JSON.stringify(event)).not.to.include("SYNTHETIC_TELEMETRY_CANARY");
    expect(event.operation).not.to.include("\n");
    expect(output).to.have.length(1);
    expect(event).not.to.have.property("sequence");
    expect(event).not.to.have.property("safeMessage");
  });

  it("fails open with bounded telemetry configuration when exporter construction fails", async () => {
    const runtime = initializeTelemetry(
      {
        OTEL_TRACES_ENDPOINT: "http://collector:4318/v1/traces",
        OTEL_EXPORT_TIMEOUT_MS: 100,
        OTEL_MAX_QUEUE_SIZE: 128,
        OTEL_MAX_EXPORT_BATCH_SIZE: 32,
        OTEL_EXPORT_INTERVAL_MS: 100,
        SERVICE_NAME: "test",
        NODE_ENV: "test",
      },
      {
        exporterFactory: () => {
          throw new Error("collector unavailable");
        },
      },
    );
    expect(runtime.enabled).to.equal(false);
    await runtime.shutdown();
  });

  it("parses collector, dashboards, alert rules and maintenance/inhibition routing", () => {
    const collector = yaml.parse(
      fs.readFileSync(path.join(root, "ops/otel/collector.yaml"), "utf8"),
    );
    expect(collector.processors.memory_limiter.limit_mib).to.equal(512);
    expect(
      collector.exporters["otlphttp/traces"].sending_queue.queue_size,
    ).to.equal(2048);
    expect(
      collector.exporters["otlphttp/traces"].retry_on_failure.max_elapsed_time,
    ).to.equal("60s");
    const dashboard = JSON.parse(
      fs.readFileSync(
        path.join(root, "ops/grafana/dashboards/platform-operations.json"),
        "utf8",
      ),
    );
    expect(dashboard.panels).to.have.length(16);
    for (const panel of dashboard.panels) {
      expect(panel.targets[0].expr).to.match(/platform_/);
      expect(panel.description).to.include("Purpose:");
      expect(panel.description).to.include("Unit:");
      expect(panel.description).to.include("Range:");
    }
    const rules = yaml.parse(
      fs.readFileSync(
        path.join(root, "ops/alerts/platform-slo-rules.yaml"),
        "utf8",
      ),
    );
    const alerts = rules.spec.groups.flatMap((group) => group.rules);
    expect(alerts.length).to.be.at.least(20);
    expect(
      alerts.find((rule) => rule.alert === "WorkerFleetUnavailable").expr,
    ).to.include("absent");
    expect(
      alerts.every(
        (rule) => rule.annotations.runbook && rule.annotations.missing_data,
      ),
    ).to.equal(true);
    const routing = yaml.parse(
      fs.readFileSync(
        path.join(root, "ops/alertmanager/alertmanager.yaml"),
        "utf8",
      ),
    );
    expect(routing.route.group_by).to.include("alertname");
    expect(routing.route.routes[0].matchers).to.include('maintenance!="true"');
    expect(routing.inhibit_rules.length).to.be.greaterThan(0);
  });
});
