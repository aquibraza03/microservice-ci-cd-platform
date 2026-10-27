# Microservice CI/CD Platform

## Reproducible local staging

The isolated Phase 2 Kind foundation is documented in
[`docs/phase2-staging-runbook.md`](docs/phase2-staging-runbook.md).
Its execution results and acceptance matrix are recorded in
[`docs/phase2-staging-report.md`](docs/phase2-staging-report.md).
Use its guarded lifecycle commands, not the older development Kind scripts.

## Phase 3 enterprise controls

Phase 3 adds provider-neutral BYOC resources, centrally evaluated organization RBAC,
external secret references, immutable approval snapshots, Kyverno policy modelling,
drift reporting, and a tenant-scoped enterprise audit API. Audit events are schema
validated and redacted, receive a per-organization sequence, and are chained with
versioned HMAC integrity metadata. The application describes this as tamper-evident,
not immutable: WORM retention requires separately configured external storage.

AWS account connections use AssumeRole and external IDs; Kubernetes targets are
separate resources. AWS, customer Kubernetes, public DNS/TLS, and Kyverno admission
are not production-verified by the bundled mocked test suite. See
`PHASE3_FINAL_REPORT.md` and `PHASE3_RELEASE_CHECKLIST.md` before staging.

This repository is a self-service deployment platform. Included services are reference workloads used to validate the platform. Users connect and deploy their own services.

## Phase 2 Part 1: service configuration

After connecting a repository, open `/services/configure?projectId=<project-id>`. The dashboard pins detection to a full commit SHA, presents independently configurable candidates, autosaves a versioned draft, validates platform limits on the server and exports the accepted configuration as `service.yml`. Detection is a proposal: it never executes repository code and deployable configuration is saved only after server validation.

Tier 1 support is `service.yml`, generic Dockerfiles, Node.js `package.json`, and multiple package/Dockerfile roots. Python, Go, Maven and Gradle rules are recognition-only and explicitly experimental.

This repository is a self-service deployment platform. Included services are reference workloads used to validate the platform. Users connect and deploy their own services.

The product direction is a Vercel-like workflow for containerized microservices: connect a repository, describe a service, run a pipeline, build an image and deploy it to Kubernetes. This repository is an early implementation and is **not production-ready**. Historical audit documents are retained as reference material and are not evidence that a feature works.

## Implementation status

| Capability | Status | Verified scope or limitation |
| --- | --- | --- |
| Frontend dashboard and typed UI packages | Implemented | Install, lint, typecheck, unit tests and production build verified in the Checkpoint 1 report |
| Reference Node workloads | Implemented | `auth-service` and `platform-smoke-test` validate service conventions; they are not platform product services |
| Control-plane identity and organization foundation | Implemented | Verified JWT, GitHub OAuth adapter, tracked sessions, organizations and centralized RBAC are covered by local tests; live GitHub exchange requires external configuration |
| PostgreSQL persistence | Implemented | Additive migrations and real repository tests run in CI; local execution requires PostgreSQL |
| Service templates and CI scripts | Partially implemented | Node, Python and Go templates exist; tool-dependent paths require further validation |
| GitHub Actions and Jenkins assets | Partially implemented | Definitions exist; they were inspected but not executed on hosted runners/Jenkins |
| Terraform and Kubernetes assets | Partially implemented | Restricted Kubernetes provider and Kind harness exist; production ingress/TLS remain outside Phase 1 |
| GitHub OAuth login | Requires external configuration | State/PKCE flow and adapter are implemented; a GitHub OAuth App and production keys are required |
| GitHub App repository access | Partially implemented | Installation, repository/branch selection and verified webhook ingestion are implemented; live GitHub acceptance requires external configuration |
| Deployment pipeline | Implemented | Durable state machine, BullMQ worker, digest-gated delivery, health verification and rollback are implemented; live infrastructure acceptance is separately reported |
| Redis/BullMQ jobs and deployment workers | Implemented | Separate producer/worker, retries, heartbeat, cancellation and Redis integration test |
| Rootless BuildKit execution | Implemented | Rootless worker integration forbids the host Docker socket; container execution requires a compatible Docker host |
| GHCR publishing | Requires external configuration | Production adapter uses narrowly scoped credentials and registry-confirmed digests; live GHCR was not verified here |
| Kubernetes deployment service | Implemented | Generated restricted workloads, rollout monitoring and health verification; external cluster access requires kubeconfig/RBAC |
| BYOC provider catalog | Implemented | Backend capability catalog; AWS and Kubernetes are beta, while Azure/GCP are planned and not connectable |
| AWS account connection | Beta | STS AssumeRole/external-ID flow is unit-tested with an injected client; no live AWS account was verified here |
| Customer Kubernetes target | Beta | Namespace, permission, identity and SSRF validation plus encrypted token fallback are unit-tested; no customer cluster was verified here |
| Enterprise organization RBAC | Implemented in memory / schema ready | Default-deny policy decisions, nine fixed roles, scoped assignments, grant restrictions, final-owner protection and immediate repository revalidation are unit-tested; PostgreSQL runtime integration remains required |
| Managed secret references | Beta | AWS Secrets Manager and Kubernetes External Secrets reference metadata are unit-tested; plaintext is not stored or exposed, build secrets are unsupported, and no live provider was verified |
| Server-Sent Events | Implemented | Authorized ordered replay and live dashboard states through rollout and rollback |
| Managed production secrets | Planned | Interface direction documented; provider adapters are not implemented |
| Production observability | Partially implemented | Logging/Prometheus assets exist; end-to-end collection was not verified |
| OAuth app, GitHub App, GHCR, cloud and cluster credentials | Requires external configuration | Never committed to this repository |

## Phase 1 architecture

Accepted decisions are indexed in [`docs/adr/`](docs/adr/README.md): GitHub OAuth behind a provider abstraction, GitHub App installation tokens, PostgreSQL, Redis with BullMQ, ephemeral rootless BuildKit workers, GHCR, Kubernetes with Kind locally, SSE, secret-store adapters, structured logs and Prometheus-compatible metrics.

Checkpoint 2 authentication, organization, permission, migration and production-configuration guidance is in [`docs/authentication-organizations.md`](docs/authentication-organizations.md).

Checkpoint 3 GitHub App setup, permissions, callback/webhook URLs and troubleshooting are in [`docs/GITHUB_APP.md`](docs/GITHUB_APP.md). This checkpoint records Git events only; it does not build images or deploy workloads.

Checkpoint 4 deployment state, queue, worker isolation, service contract and SSE guidance is in [`docs/DEPLOYMENT_PIPELINE.md`](docs/DEPLOYMENT_PIPELINE.md). A `build_complete` record means pre-deployment work produced local image metadata; it is not a successful deployment.

Checkpoint 5 GHCR, supply-chain, Kind/Kubernetes, health and rollback operations are documented in [`docs/PHASE1_RUNBOOK.md`](docs/PHASE1_RUNBOOK.md). Only a deployment that passes digest, scan, signature, rollout, readiness and liveness gates becomes `ready`.

Phase 2 Part 4 safe dashboard rollback, compatibility gates and final verification are documented in [`docs/PHASE2-PART4-SAFE-ROLLBACK.md`](docs/PHASE2-PART4-SAFE-ROLLBACK.md) and [`docs/PHASE2-FINAL-VERIFICATION.md`](docs/PHASE2-FINAL-VERIFICATION.md). The report distinguishes automated provider testing from real-cluster acceptance and contains no invented evidence.

Phase 3 Part 1 separates cloud-account connections from runtime deployment targets. AWS uses AssumeRole with a unique external ID; Kubernetes targets validate identity, DNS/address safety, namespace scope and minimum permissions. See [`PHASE3_PART1_HANDOFF.md`](PHASE3_PART1_HANDOFF.md). The dashboard route is `/cloud-connections`.

Phase 3 Part 2 adds centralized scoped authorization and provider-neutral runtime-secret references. The dashboard route is `/access-security`. See [`docs/PHASE3-PART2-AUTHORIZATION-SECRETS.md`](docs/PHASE3-PART2-AUTHORIZATION-SECRETS.md) and [`PHASE3_PART2_HANDOFF.md`](PHASE3_PART2_HANDOFF.md). Custom roles, browser secret reads, plaintext vault storage and build secrets are intentionally unavailable.

Phase 3 Part 3 adds immutable approval snapshots, protected production-deployment pausing, Kyverno policy rendering and preflight checks, scoped expiring exceptions, and on-demand read-only drift detection. The dashboard route is `/release-governance`. Kyverno `enforce` status requires target-confirmed active admission; this checkpoint did not have a disposable Kyverno cluster, so admission enforcement is not claimed. See [`docs/PHASE3-PART3-RELEASE-GOVERNANCE.md`](docs/PHASE3-PART3-RELEASE-GOVERNANCE.md) and [`PHASE3_PART3_HANDOFF.md`](PHASE3_PART3_HANDOFF.md).

Phase 4 Part 1 adds bounded Prometheus-compatible metrics, W3C trace-context propagation across deployment jobs, centrally redacted JSON operational logs, OpenTelemetry Collector configurations, version-controlled dashboards, SLO burn-rate alerts and initial runbooks. Metrics endpoints require a dedicated token and must remain private. SLO targets are provisional until production traffic validates them. See [`SLO_CATALOG.md`](SLO_CATALOG.md), [`ALERT_CATALOG.md`](ALERT_CATALOG.md), and [`PHASE4_PART1_HANDOFF.md`](PHASE4_PART1_HANDOFF.md).

Phase 4 Part 2 provides production-refusing load and controlled-failure harnesses, deterministic synthetic datasets, encrypted PostgreSQL backup tooling, isolated restore verification, DR inventories, alerts and runbooks. Only a 5 rps local in-memory health baseline was executed; PostgreSQL clean-room restoration was blocked by missing PostgreSQL tooling/runtime, so Part 2 is not marked complete or production-verified. See [`CAPACITY_REPORT.md`](CAPACITY_REPORT.md), [`DISASTER_RECOVERY_RUNBOOK.md`](DISASTER_RECOVERY_RUNBOOK.md), and [`PHASE4_PART2_HANDOFF.md`](PHASE4_PART2_HANDOFF.md).

The build architecture explicitly rejects mounting `/var/run/docker.sock` or any host Docker socket into workers.

## Repository map

| Path | Purpose |
| --- | --- |
| `frontend/` | Next.js dashboard monorepo |
| `services/control-plane-api/` | Early control-plane API and PostgreSQL foundation |
| `services/auth-service/` | Reference Node workload; not platform authentication |
| `services/platform-smoke-test/` | Reference workload for platform validation |
| `templates/` | Service scaffolds |
| `ci/`, `.github/`, `jenkins/` | Pipeline and automation assets |
| `deploy/`, `terraform/`, `environments/` | Deployment and infrastructure assets |
| `docker/` | Local dependency and development Compose files |
| `ops/` | Observability configuration generators |

## Local dependencies

Prerequisites are Docker Engine with Compose v2 and, for the Node applications, Node.js 22 with npm 10 or newer.

```bash
cp .env.example .env.local
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml up -d --wait
```

This starts PostgreSQL at `localhost:55432` and Redis at `localhost:56379` using named volumes and an isolated bridge network. To also start the development OCI registry at `localhost:5001`:

```bash
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml --profile kind up -d --wait
```

See [`docs/local-development.md`](docs/local-development.md) for health checks, database migration, startup and shutdown instructions.

## Verification

Frontend:

```bash
cd frontend
npm ci
npm audit --omit=dev
npm run lint
npm run typecheck
npm test
npm run build
```

Node services:

```bash
for service in auth-service control-plane-api platform-smoke-test; do
  (cd "services/$service" && npm ci && npm run lint && npm test && npm audit --omit=dev)
done
```

See [`docs/CHECKPOINT-1-BASELINE.md`](docs/CHECKPOINT-1-BASELINE.md) for the exact observed baseline and limitations.

## Security

Never commit `.env.local`, provider credentials, tokens, kubeconfigs or registry passwords. Report vulnerabilities as described in [`SECURITY.md`](SECURITY.md).

## Phase 4 operations and billing foundation

Operational evidence and limits are documented in [`PHASE4_PRODUCTION_OPERATIONS_REPORT.md`](PHASE4_PRODUCTION_OPERATIONS_REPORT.md), [`CAPACITY_REPORT.md`](CAPACITY_REPORT.md), and [`DISASTER_RECOVERY_RUNBOOK.md`](DISASTER_RECOVERY_RUNBOOK.md). Metering, plans, entitlement evaluation, and quota behavior are documented in [`BILLING_AND_QUOTAS.md`](BILLING_AND_QUOTAS.md); operational response starts at [`runbooks/README.md`](runbooks/README.md).

The platform does not collect payments, store card data, calculate tax, or claim legally compliant invoices. Current billing components are foundations and are not production-ready until the unchecked gates in [`PHASE4_RELEASE_CHECKLIST.md`](PHASE4_RELEASE_CHECKLIST.md) pass, including a clean-room restore and PostgreSQL contention verification.
