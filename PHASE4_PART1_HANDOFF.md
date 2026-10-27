# Phase 4 Part 1 handoff

## 1. Observability architecture

The API and deployment worker emit Prometheus metrics, W3C trace context and JSON operational logs. OpenTelemetry exporters are fail-open and bounded. A private collector receives OTLP traces, scrapes authenticated application metrics, applies memory, batching and redaction processors, and exports to operator-configured metrics, trace and log destinations. User deployment events and tamper-evident security audit events remain separate from internal logs.

Runtime topology is browser → control-plane API → PostgreSQL/Redis → BullMQ worker → Git/build/registry/Kubernetes providers. Both API and worker expose private metrics. Queue metadata contains only `traceparent` and stable workflow ID; retries and approval resumptions are short segments linked to earlier context, never hours-long spans. Decisions are recorded in `docs/adr/0014-production-observability.md`.

## 2. SLI/SLO catalogue

`SLO_CATALOG.md` defines 28 user-outcome SLIs across control-plane, deployment, preview, live-observability and external-dependency journeys. Each records impact, event definition, numerator, denominator, source, provisional target, window, exclusions, missing-data behavior, retention, budget policy, alerts and limitations. Expected user validation failures are excluded only through bounded categories; unknown failures count against the SLO. All targets are **provisional** because production traffic was unavailable.

## 3. Metric catalogue

`services/control-plane-api/src/observability/metrics.js` is the executable catalogue. It covers API/auth/authz, queues/jobs/workers, PostgreSQL/Redis, builds/stages, providers, streams, previews, certificates, approvals, policy, audit and telemetry health. Durations are second-based histograms. Current paths emit API, authorization, queue, Redis, worker, build/deployment, provider, stream, preview-cleanup, approval, policy and audit signals; collector self-metrics supply exporter health. Certificate-expiry and provider-specific series appear only when those controllers execute.

## 4. Cardinality and cost policy

- At most five labels per application metric.
- Organization/user/project/deployment/request/trace IDs, repository URLs, commits, arbitrary paths/messages and raw errors are forbidden metric labels.
- Routes normalize UUIDs, hashes, numbers and platform-prefixed resource IDs.
- Collection interval: 30 seconds. Metrics retention: 30 days; traces: 14 days; operational logs: 30 days.
- SDK span queue: 2,048; batch: 256; export timeout/interval: 5 seconds.
- Collector memory: 512 MiB plus 128 MiB spike allowance; exporter retry elapsed time: 60 seconds maximum.
- Expected series counts and storage guardrails are documented in ADR 0014. CI validates names, units, dimensions and label count.

## 5. Trace and workflow-correlation model

Inbound `traceparent` is parsed under W3C rules. HTTP requests, worker attempts, stages, provider calls, retries and resumptions are short spans. `workflowId` persists correlation; retry and resumption spans use links rather than false long parent-child timing. Instrumented operations include auth/authz, deployment creation/execution, Git acquisition, build and security stages, registry, Kubernetes and approval resumption.

## 6. Sampling policy

- Ordinary successful traffic: 10%.
- Health endpoints: 0.1%.
- Errors, requests slower than two seconds, workflow failures and security-sensitive operations: 100% under the application decision policy.
- Tail sampling is not implemented or claimed.
- Attributes are allow-shaped, control-character sanitized, limited to 256 characters and reject sensitive key names.

## 7. Logging and redaction policy

Operational logs contain timestamp, severity, service, environment, operation, request/trace/workflow/job/deployment correlation, stage, result and safe error category. Central redaction removes secret-shaped fields, bearer values, private keys and database/Redis URLs; it limits depth, count and length and neutralizes controls. Synthetic-canary tests scan serialized output. Operational records are not copied into user deployment streams; audit events retain their separate schema and integrity chain.

## 8. Collector and backend configuration

- `ops/otel/collector.yaml`: production-oriented TLS/authenticated pipeline with memory limiter, redaction, batching, bounded queues/retries and health endpoint.
- `ops/otel/collector-local.yaml`: local development profile.
- `deploy/k8s/observability/otel-collector.yaml`: namespace-scoped deployment, service and ingress-denying NetworkPolicy.
- `ops/alertmanager/alertmanager.yaml`: grouping, deduplication, critical-over-warning inhibition, maintenance handling and a non-paging test receiver.

The Kubernetes manifest intentionally requires `REPLACE_WITH_VERIFIED_DIGEST`. No real backend credentials or paging receiver were configured.

## 9. Dashboard catalogue

`ops/grafana/dashboards/platform-operations.json` has 15 decision-oriented panels covering journey SLOs/error budgets, API, queue/workers, deployment/build, Kubernetes/providers, PostgreSQL/Redis, streams, previews, rollback, approval/policy and pipeline health. Each embeds purpose, PromQL, unit, range, interpretation and alert/runbook references.

## 10. Alert catalogue

`ops/alerts/platform-slo-rules.yaml` defines 21 symptom/burn alerts covering fast/slow burn, API, worker/queue, deployment/build capacity, data services, registry/Kubernetes/Git, streams, previews, certificates, audit integrity and telemetry failures. `ALERT_CATALOG.md` records severity, impact, condition, duration, missing-data behavior, owner, route, dashboard, runbook and resolution. Real paging is intentionally not connected.

## 11. Runbook catalogue

Critical/high coverage is in `runbooks/`: `api-slo`, `worker-queue`, `data-services`, `deployment-providers`, `live-observability`, `audit-integrity`, and `telemetry-pipeline`. Each includes symptoms, impact, access, diagnostics, safe mitigation, escalation, recovery, evidence and owner.

## 12. Files changed

Added `src/observability/*`, observability tests, ADR 0014, SLO/alert catalogues, collector/Alertmanager configs, dashboard JSON, alert rules, Kubernetes collector resources, runbooks and this handoff. Modified API server/config/OpenAPI/environment examples, deployment queue, worker/pipeline, package manifests/locks, ADR index and README. No database migration was needed; telemetry does not alter authoritative deployment or audit storage.

## 13. Commands executed

```text
npm ci (frontend and Node services)
npm --prefix services/control-plane-api run lint
npm --prefix services/control-plane-api run test:all
npm --prefix services/control-plane-api run test:migration:contract
npm --prefix services/control-plane-api run verify:phase3
npm --prefix services/control-plane-api audit --audit-level=high
npm --prefix services/auth-service run lint && npm --prefix services/auth-service test
npm --prefix services/platform-smoke-test run lint && npm --prefix services/platform-smoke-test test
npm --prefix frontend run verify
npm --prefix frontend audit --audit-level=high
bash ci/security.sh control-plane-api phase4-part1
```

## 14. Test results

- Control plane: lint passed; 19 unit, 2 HTTP, 46 deployment, 9 detection/configuration, 22 preview, 19 BYOC and 62 security tests passed.
- Migration contract passed. Live PostgreSQL migrations were not run because no database endpoint was provided.
- Phase 3 enterprise harness passed at its declared mocked-integration level.
- Auth fixture: lint and 58 tests passed. Smoke fixture: lint and 8 tests passed.
- Frontend: format, type-check, 94 tests and production build passed; lint had 48 pre-existing warnings and zero errors.
- Control-plane and smoke audits: zero vulnerabilities.
- Container security scan was blocked before image inspection because Trivy is not installed; OSV Scanner was also unavailable. This is an environment blocker, not a passing scan.
- Pre-existing findings remain separate: auth fixture has one high `js-yaml` advisory; frontend has three moderate Vitest-chain findings and one high `js-yaml` advisory. They were not force-upgraded across breaking versions in observability scope.

## 15. Verification classification

| Capability | Classification | Evidence |
| --- | --- | --- |
| Metric catalogue, cardinality and redaction | Unit-tested | Catalogue, route normalization and canary tests |
| Metrics endpoint authorization | Integration-tested | HTTP denial/allow tests |
| Queue context and retry/resumption links | Unit-tested | Safe metadata and link assertions |
| Collector/dashboard/alerts | Unit-tested / rendered config | YAML/JSON parsing and bounded-setting assertions |
| Missing-data and maintenance routing | Unit-tested | Rule and Alertmanager assertions |
| Earlier feature regression | Integration-tested with mocks | Existing suites and Phase 3 harness |
| Exporter outage | Mocked | Failed exporter construction remains fail-open |
| Local Kubernetes collector | Not verified | No cluster; verified image digest unavailable |
| Staging/live telemetry and paging | Not verified | No backend credentials, traffic or authorized receiver |

## 16. Known limitations

- SLO thresholds are provisional and not calibrated with production traffic.
- No live PostgreSQL/Redis, telemetry backend or Kubernetes deployment was available.
- Tail sampling is absent. Browser tracing is deliberately limited.
- stdout is the local log destination; durable central storage is operator-supplied.
- Certificate, DNS and external-secret series require those real operations to run.
- Production collector image digests and backend authentication remain deployment inputs.
- Baseline frontend/auth dependency advisories remain open.
- Trivy/OSV image and source scanning remains unverified in this environment.

## 17. Exact prerequisites for Part 2

1. Supply verified digest-pinned collector/backend images and private registry access.
2. Provide a disposable Kubernetes cluster and telemetry backend credentials.
3. Configure private Prometheus scraping plus OTLP TLS/authentication.
4. Collect representative traffic to calibrate targets and histogram buckets.
5. Resolve or formally accept baseline auth/frontend dependency advisories.
6. Complete live PostgreSQL/Redis and collector-outage verification before capacity/failure testing.
7. Keep paging disabled until ownership, escalation and maintenance integration are approved.

## Completion assessment

Code-level leakage, cardinality and asynchronous propagation gates are verified. Part 1 is implemented and functionally tested at unit/mocked integration level, but is **not production-verified**; local Kubernetes and staging/live checks remain blocked by infrastructure and credentials.
