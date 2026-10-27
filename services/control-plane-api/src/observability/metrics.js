const client = require("prom-client");
const { ControlPlaneError } = require("../errors");

const FORBIDDEN_LABELS = new Set([
  "organization_id",
  "user_id",
  "project_id",
  "deployment_id",
  "request_id",
  "trace_id",
  "repository_url",
  "commit_sha",
  "path",
  "message",
  "error_message",
]);
const LABEL_BUDGET = 5;
const METRIC_PREFIX = "platform_";
const DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300, 900,
];

const CATALOG = Object.freeze({
  http_requests_total: ["method", "route", "status_class", "result"],
  http_request_duration_seconds: ["method", "route", "result"],
  http_active_requests: ["service"],
  auth_duration_seconds: ["operation", "result"],
  authorization_duration_seconds: ["action", "result"],
  queue_depth: ["queue", "state"],
  queue_oldest_job_age_seconds: ["queue"],
  jobs_total: ["worker_type", "result"],
  job_duration_seconds: ["worker_type", "result"],
  job_retries_total: ["worker_type", "error_category"],
  dead_letter_jobs_total: ["worker_type", "error_category"],
  worker_available: ["worker_type"],
  database_pool_connections: ["state"],
  database_operation_duration_seconds: ["operation", "result"],
  redis_operation_duration_seconds: ["operation", "result"],
  builds: ["state", "environment_class"],
  build_stage_duration_seconds: ["stage", "result"],
  provider_operation_duration_seconds: ["provider_type", "operation", "result"],
  provider_rate_limits_total: ["provider_type", "operation"],
  deployment_transitions_total: ["stage", "result", "environment_class"],
  deployment_stage_duration_seconds: ["stage", "result", "environment_class"],
  rollout_failures_total: ["error_category", "environment_class"],
  log_streams_active: ["transport"],
  log_stream_connections_total: ["transport", "result"],
  log_stream_disconnects_total: ["reason"],
  log_stream_freshness_seconds: ["transport"],
  preview_cleanup_backlog: ["state"],
  preview_cleanup_total: ["result"],
  preview_cleanup_delay_seconds: ["result"],
  certificate_expiry_seconds: ["environment_class"],
  approval_wait_duration_seconds: ["action", "result"],
  policy_evaluations_total: ["policy", "mode", "result"],
  audit_jobs_total: ["operation", "result"],
  telemetry_dropped_total: ["signal", "reason"],
  telemetry_exporter_queue_usage_ratio: ["signal", "exporter"],
  telemetry_exporter_failures_total: ["signal", "exporter", "error_category"],
  backup_jobs_total: ["result"],
  backup_last_success_timestamp_seconds: ["backend"],
  pitr_verification_timestamp_seconds: ["result"],
  restore_tests_total: ["result", "backup_age_class"],
  restore_last_success_timestamp_seconds: ["recovery_path"],
  reconciliation_failures_total: ["component"],
  capacity_saturation_total: ["component", "threshold"],
  failure_test_aborts_total: ["reason"],
  dr_verification_failures_total: ["scenario"],
  usage_ingestion_total: ["meter", "result"],
  usage_processing_failures_total: ["meter", "error_category"],
  usage_processing_lag_seconds: ["meter"],
  usage_dead_letter_total: ["meter", "error_category"],
  usage_duplicates_total: ["meter"],
  usage_reconciliation_difference: ["meter", "status"],
  quota_denials_total: ["resource_type", "environment_class"],
  quota_reservations_active: ["resource_type"],
  quota_reservations_expired_total: ["resource_type"],
  quota_reservation_leaks: ["resource_type"],
  usage_adjustments_total: ["meter", "reason_category"],
  billing_period_closes_total: ["result"],
});

function validateCatalog(catalog = CATALOG) {
  for (const [name, labels] of Object.entries(catalog)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || labels.length > LABEL_BUDGET)
      throw new Error(`Metric ${name} exceeds naming or label budget`);
    for (const label of labels)
      if (FORBIDDEN_LABELS.has(label))
        throw new Error(`Metric ${name} uses forbidden label ${label}`);
  }
  return true;
}

function normalizeRoute(value = "/unknown") {
  let route;
  try {
    route = new URL(value, "http://local").pathname;
  } catch {
    route = "/invalid";
  }
  return (
    route
      .replace(
        /\/(?:org|project|proj|environment|env|service|svc|deployment|dep|preview|prv|target|tgt|connection|conn|approval|apr|export|exp)_[a-z0-9_-]+(?=\/|$)/gi,
        "/:id",
      )
      .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ":id")
      .replace(/\b[0-9a-f]{32,64}\b/gi, ":id")
      .replace(/\/\d+(?=\/|$)/g, "/:id")
      .split("/")
      .slice(0, 9)
      .join("/")
      .slice(0, 160) || "/"
  );
}

function classifyError(error = {}) {
  const value = String(error.code || error.name || "internal").toLowerCase();
  if (error.status === 429 || value.includes("rate")) return "rate_limited";
  if (value.includes("timeout") || value.includes("abort")) return "timeout";
  if (value.includes("auth") || value.includes("permission"))
    return "authorization";
  if (value.includes("network") || value.includes("connect")) return "network";
  if (value.includes("policy") || value.includes("signature")) return "policy";
  if (value.includes("validation") || value.includes("invalid"))
    return "validation";
  return "internal";
}

class PlatformMetrics {
  constructor({ registry = new client.Registry() } = {}) {
    validateCatalog();
    this.registry = registry;
    this.metrics = new Map();
    client.collectDefaultMetrics({
      register: registry,
      prefix: `${METRIC_PREFIX}process_`,
    });
    const counterNames = new Set([
      "http_requests_total",
      "jobs_total",
      "job_retries_total",
      "dead_letter_jobs_total",
      "provider_rate_limits_total",
      "deployment_transitions_total",
      "rollout_failures_total",
      "log_stream_connections_total",
      "log_stream_disconnects_total",
      "preview_cleanup_total",
      "policy_evaluations_total",
      "audit_jobs_total",
      "telemetry_dropped_total",
      "telemetry_exporter_failures_total",
      "backup_jobs_total",
      "restore_tests_total",
      "reconciliation_failures_total",
      "capacity_saturation_total",
      "failure_test_aborts_total",
      "dr_verification_failures_total",
      "usage_ingestion_total",
      "usage_processing_failures_total",
      "usage_dead_letter_total",
      "usage_duplicates_total",
      "quota_denials_total",
      "quota_reservations_expired_total",
      "usage_adjustments_total",
      "billing_period_closes_total",
    ]);
    const histogramNames = new Set(
      Object.keys(CATALOG).filter(
        (name) =>
          name.endsWith("_duration_seconds") || name.endsWith("_delay_seconds"),
      ),
    );
    for (const [name, labelNames] of Object.entries(CATALOG)) {
      const config = {
        name: `${METRIC_PREFIX}${name}`,
        help: `Platform ${name.replaceAll("_", " ")}`,
        labelNames,
        registers: [registry],
      };
      const metric = counterNames.has(name)
        ? new client.Counter(config)
        : histogramNames.has(name)
          ? new client.Histogram({ ...config, buckets: DURATION_BUCKETS })
          : new client.Gauge(config);
      this.metrics.set(name, metric);
    }
  }
  _metric(name) {
    const metric = this.metrics.get(name);
    if (!metric)
      throw new ControlPlaneError(500, "METRIC_UNKNOWN", "Unknown metric");
    return metric;
  }
  inc(name, labels = {}, value = 1) {
    this._metric(name).inc(labels, value);
  }
  set(name, labels = {}, value) {
    this._metric(name).set(labels, value);
  }
  observe(name, labels = {}, seconds) {
    this._metric(name).observe(labels, seconds);
  }
  async render() {
    return this.registry.metrics();
  }
  contentType() {
    return this.registry.contentType;
  }
}

module.exports = {
  CATALOG,
  LABEL_BUDGET,
  FORBIDDEN_LABELS,
  PlatformMetrics,
  classifyError,
  normalizeRoute,
  validateCatalog,
};
