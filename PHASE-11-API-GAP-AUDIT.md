# Phase 11 Step 1: API Gap and Contract Audit

**Audit date:** 2026-08-24  
**Scope:** backend services, executable HTTP handlers, deployment/infrastructure automation, service manifests, existing API contracts, and frontend integration metadata.  
**Change policy:** no backend, frontend, test, configuration, or infrastructure implementation changes were made for this audit.

## Executive conclusion

This repository does not currently contain a product control-plane backend. The executable backend surface is limited to a development/test `auth-service` stub and a `platform-smoke-test` health/info service. GitHub Actions, Jenkins, shell scripts, Docker actions, Kubernetes manifests, and Terraform modules implement automation or infrastructure definitions, not browser-consumable APIs.

The frontend has a documented dashboard/projects contract and working query/service boundaries, but no corresponding backend implementation was found in this repository. Therefore those capabilities are not classified as fully available. The frontend also contains explicit UI foundations for the remaining modules, but those do not establish backend availability.

## Capability matrix

| Capability | Backend | API | Contract | Frontend | Real-time | Status | Missing Work |
|---|---|---|---|---|---|---|---|
| Pipelines | No pipeline-definition service; CI workflows are automation | None | Frontend placeholder only; no backend contract | `/pipelines` unavailable foundation; navigation flag | None | **C. FRONTEND-ONLY** | Pipeline model/service, CRUD and trigger APIs, authz, persistence, query hooks, tests |
| Pipeline Runs | Workflow scripts can execute CI jobs; no run service/store | None in backend; frontend documents `GET /dashboard/pipeline-runs` | Frontend Zod/dashboard contract only | `/pipeline-runs` consumes configured dashboard source | None | **B. PARTIALLY AVAILABLE** | Backend run ingestion/query API, durable run state, detail/stage/job/log/artifact contracts, authz |
| Live Logs | Shell/CI commands emit logs; no log service | None | No log query, cursor, or stream contract | `/logs` unavailable/static viewer boundary | None; no WebSocket/SSE/polling | **B. PARTIALLY AVAILABLE** | Log storage/query API, streaming protocol, retention, redaction, authorization, bounded pagination |
| Artifacts | CI/Docker workflows produce build outputs; no artifact registry API | None | No artifact schema/download contract | Run-detail placeholder only | None | **B. PARTIALLY AVAILABLE** | Artifact metadata store, list/download APIs, signed URL policy, retention, permissions |
| Deployments | Deployment shell scripts, GitHub workflows, Jenkins pipelines, and provider modules exist; no deployment service | None in backend; frontend documents `GET /dashboard/deployments` | Frontend Zod/dashboard contract only | `/deployments` consumes configured dashboard source; detail unavailable | None | **B. PARTIALLY AVAILABLE** | Deployment API, durable event/timeline model, provider execution boundary, authz, rollback policy |
| Environments | Environment `.env`, manifests, and Terraform variables exist; no environment service | None | Frontend `Environment` embedded type only | `/environments` unavailable foundation | None | **B. PARTIALLY AVAILABLE** | Environment list/detail/health/config-summary APIs, secret masking, tenant/project scoping |
| Docker / Container Registry | Dockerfiles, build actions, Trivy/SBOM workflows, and registry configuration exist | None | No registry/image API | `/docker` and image-detail foundations unavailable | None | **B. PARTIALLY AVAILABLE** | Registry integration service, image/tag/digest/vulnerability/SBOM APIs, credential broker |
| Kubernetes | K8s manifests, deploy actions, rollout/health scripts, and provider configuration exist | None | No cluster/resource API | `/kubernetes` and cluster-detail foundations unavailable | None | **B. PARTIALLY AVAILABLE** | Cluster credential broker, inventory/workload/event APIs, watch/poll contract, authorization |
| Terraform | Terraform modules, plan/apply scripts, and CI workflow exist; root configuration is incomplete per prior audit | None | No workspace/plan/state API | `/terraform` unavailable foundation | None | **B. PARTIALLY AVAILABLE** | Remote execution service, workspace/plan/apply APIs, state/lock boundaries, policy approvals |
| Repositories | No repository integration service | None | Frontend gap document only | `/repositories` explicit unavailable state | None | **C. FRONTEND-ONLY** | Provider connection/list/detail API, OAuth/token broker, webhook sync, permissions |
| Global Search | No search/index service | None | Frontend gap document only | Ctrl/Cmd+K command/search UI; results unavailable without endpoint | None | **C. FRONTEND-ONLY** | Indexed resource API, authorization-aware result filtering, ranking, pagination, audit controls |
| Notifications | Workflow notification scripts/providers exist, but no in-app notification service/store | None | Frontend gap document only | Notification center UI and typed boundary; unavailable without endpoint | None | **C. FRONTEND-ONLY** | Notification persistence/list/read APIs, fan-out/event source, authorization, retention, delivery status |

### Classification interpretation

- **A. FULLY AVAILABLE:** none found.
- **B. PARTIALLY AVAILABLE:** automation or infrastructure capability exists, but no usable product API and/or durable contract exists.
- **C. FRONTEND-ONLY:** frontend route/boundary exists, but no backend capability or API exists in this repository.
- **D. MISSING:** neither frontend nor backend capability exists. None of the 12 requested capabilities are entirely absent from the frontend because Part 3 created foundations; this does not mean the backend exists.
- **E. BLOCKED:** not used as the primary classification because the repository lacks a backend API to block. Infrastructure credentials and provider setup are dependencies, but they do not turn scripts into APIs.

## 1. Existing API inventory

### Executable HTTP services

| Service | Routes | Methods | Request/response | Auth/authz | Persistence |
|---|---|---|---|---|---|
| `services/auth-service` | `/health`, `/ready`, `/login`, `/env` | `GET`, `HEAD`; all other methods return 405 | JSON responses; `/login` returns only `{ message: "Auth service login endpoint" }`; no request body schema | No authentication or authorization; `/env` exposes service/environment metadata | None |
| `services/platform-smoke-test` | `/health`, `/ready`, `/info`, fallback `/` | Handler accepts all methods and returns text/plain | Plain text: `ok`, `ready`, `uptime:<n>s`, or `platform smoke test running` | None | In-memory process start time only |

The auth service is explicitly a test/demo stub. Its `/login` route is not a credential-verifying login API and must not be used as a production authentication contract.

### Documented frontend-facing contracts

`frontend/docs/API_CONTRACT.md` documents typed/configured contracts for:

- Dashboard metrics
- Dashboard pipeline-run list
- Dashboard deployment list
- Dashboard health
- Dashboard alerts
- Dashboard security
- Dashboard activity
- Projects list/detail

Those routes are not implemented by an executable backend service in this repository. They are frontend contract declarations and integration points, not evidence of deployed API availability.

## 2. Existing backend services

- `services/auth-service`: Node HTTP test stub with security headers, health/readiness, environment response, and a non-functional login placeholder.
- `services/platform-smoke-test`: Node HTTP smoke-test service for health/readiness checks.
- `services/orders-service`: placeholder only.
- `services/payments-service`: placeholder only.

The repository also contains service templates for Node, Python, and Go. Templates are scaffolding and do not constitute deployed product services or domain APIs.

## 3. Existing data models

No backend domain models, database schemas, migrations, repositories, ORM models, event schemas, or persistent stores were found for pipelines, runs, logs, artifacts, deployments, environments, registries, Kubernetes resources, Terraform workspaces, repositories, search, or notifications.

Existing typed models are frontend-side Zod contracts under `frontend/packages/types`, including:

- `PipelineRun`, `Deployment`, `Environment`, `ProjectSummary`, and dashboard response types.
- These types validate configured frontend responses; they do not provide backend persistence or route implementations.

Infrastructure metadata exists in `service.yml`, environment files, Terraform variables, Kubernetes manifests, and workflow inputs. These describe deployment/build operations, not API resource models.

## 4. Existing authentication boundaries

- The frontend has an authentication abstraction with development-only `dev`/`guest` strategies and a backend-agnostic JWT strategy.
- The frontend shared HTTP client is configured to attach bearer tokens and handle session expiry.
- The backend `auth-service` does not validate credentials, issue real tokens, expose sessions, or implement OAuth/OIDC.
- No backend gateway or middleware was found that enforces authentication on DevOps resources.
- Development auth is suitable only for local/test frontend flows and must remain isolated from production configuration.

## 5. Existing authorization boundaries

- Frontend navigation uses feature flags and permission names such as `pipelines:read`, `deployments:read`, and `infrastructure:read`.
- No backend permission middleware, RBAC evaluator, tenant resolver, resource-level policy, or authorization database was found.
- Frontend visibility is not a security boundary. Every future API must enforce authorization server-side and scope resources by tenant, organization, project, and environment.

## 6. Existing API error conventions

Frontend documentation expects structured `{ error: string }` responses with HTTP status classes for validation, unauthorized, forbidden, not found, and server errors. The frontend normalizes network, timeout, auth, permission, not-found, server, and unavailable conditions through its API client.

Backend evidence is inconsistent with that contract:

- `auth-service` returns JSON `{ error, allowedMethods }` for unsupported methods and `{ error: "Not Found" }` for unknown paths.
- `platform-smoke-test` returns plain text for all routes and does not expose structured API errors.
- No shared backend error envelope, correlation/reference ID, validation error schema, or documented error catalog was found.

## 7. Existing pagination conventions

The frontend contract defines:

```ts
type Page<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};
```

No backend list endpoint implementing this envelope was found. CI/workflow matrices are bounded automation lists, not API pagination. Future high-volume resources such as logs, runs, events, Kubernetes objects, and search results should prefer cursor pagination and explicit limits.

## 8. Existing real-time mechanisms

No WebSocket server, SSE endpoint, event bus consumer, subscription API, or application polling service was found. Workflow logs are process output. Kubernetes rollout checks and deployment scripts are synchronous shell operations. No real-time mechanism is currently available to the frontend.

## 9. Missing API contracts

Priority contracts required before enabling the corresponding frontend flags:

1. **Pipeline definitions:** list/detail, create/update, enable/disable, trigger, retry/cancel; pipeline repository/branch/trigger schema and permission model.
2. **Pipeline runs:** paginated query/filter/sort, detail, stage/job graph, actor/commit metadata, retry/cancel, status transitions, timestamps, and idempotency.
3. **Logs:** bounded cursor query, run/job/resource scope, severity/timestamp fields, redaction guarantees, download policy, and SSE/WebSocket/polling protocol.
4. **Artifacts:** metadata list/detail, immutable identity, checksum, storage location abstraction, signed download operation, retention, and authorization.
5. **Deployments:** list/detail, timeline events, environment/service/version, provider operation state, health checks, rollback policy, and audit trail.
6. **Environments:** list/detail, health, current release, service inventory, safe configuration summary, masked values, deployment history, and project/tenant scope.
7. **Docker registry:** registry/repository/image/tag/digest metadata, vulnerability/SBOM linkage, build status, and server-side credential handling.
8. **Kubernetes:** cluster inventory, namespaces, workloads, pods, services, ingress, nodes, events, logs, watch/poll strategy, and credential broker.
9. **Terraform:** workspace, plan, apply, drift, lock, policy approval, state metadata, logs, and remote execution identity.
10. **Repositories:** provider connection, organization/repository list/detail, OAuth/token broker, default branch, webhook sync, and connection health.
11. **Global search:** authorized grouped results, resource types, ranking, pagination/cursors, empty/error behavior, and index freshness.
12. **Notifications:** persisted notifications, unread/read mutations, filtering/grouping, severity, resource links, delivery source, and retention.

Every contract should define HTTP methods/routes, request/response schemas, status codes, authn/authz, tenant scope, idempotency, rate limits, audit events, and observability fields before frontend implementation.

## 10. Recommended implementation order

1. Establish the API gateway/control-plane service, real authentication integration, tenant context, authorization middleware, structured errors, request IDs, and OpenAPI generation.
2. Add persistent project/repository/pipeline/run/deployment/environment domain storage and migrations.
3. Implement pipeline definitions and run ingestion/state transitions because deployments, logs, artifacts, and activity depend on them.
4. Implement run stages/jobs, logs, artifacts, and event/timeline APIs.
5. Implement environments and deployments with provider adapters and audit/policy enforcement.
6. Add repository integrations and webhook synchronization.
7. Add Docker registry/image security APIs.
8. Add Kubernetes inventory and controlled operations through a credential broker.
9. Add Terraform remote execution/workspace APIs with policy approval and state isolation.
10. Add notification fan-out/persistence and authorization-aware global search after resource events and indexes exist.
11. Add SSE/WebSocket/polling only after resource state and event semantics are stable.

## 11. Dependencies between APIs

- Pipelines depend on repositories, projects, identity, and execution workers.
- Pipeline runs depend on pipeline definitions, commit/provider metadata, workers, and durable state.
- Logs and artifacts depend on run/job identity and object storage/retention.
- Deployments depend on runs or release records, environments, services, provider adapters, and health checks.
- Environment details depend on deployments plus provider inventory and secret-safe configuration projection.
- Docker depends on repository/build records, registry credentials, scanner/SBOM services, and artifact storage.
- Kubernetes depends on environment mapping, cluster credential brokerage, and workload inventory.
- Terraform depends on environment/workspace mapping, remote runners, state/lock storage, and policy engine.
- Notifications depend on domain events and persisted resource references.
- Global search depends on authorized indexes for projects, repositories, pipelines, runs, deployments, and environments.

## 12. Security risks

1. The auth service `/login` is a stub and must not be mistaken for authentication.
2. No backend authorization boundary was found; frontend permissions cannot protect APIs.
3. No tenant isolation or organization context exists in the backend.
4. Infrastructure scripts reference credentials/configuration paths; these must remain server/runner-side and never be sent to browsers.
5. Logs may contain tokens, credentials, or build arguments unless a server-side redaction pipeline is implemented.
6. Kubernetes and Terraform operations require credential brokering, least privilege, audit logging, and approval enforcement.
7. Artifact and log downloads require short-lived authorized URLs or streaming authorization; raw storage paths must not leak.
8. Search indexes must enforce resource authorization at query time, not only at indexing time.
9. Notification resource links must be permission checked when opened.
10. Existing workflow/security reports identify deployment-path, Terraform-root, and service-test blockers that must be resolved before treating automation as an operational backend.

## 13. Infrastructure dependencies

- API gateway or control-plane runtime with TLS, rate limiting, request IDs, and auth middleware.
- Identity provider supporting production OIDC/OAuth/JWT validation.
- Durable relational database for tenant/project/pipeline/run/deployment/environment metadata.
- Queue/worker system for pipeline and deployment execution.
- Object storage for logs/artifacts with retention and signed access.
- Registry integration and scanner/SBOM persistence.
- Kubernetes API access through a server-side credential broker.
- Terraform runner/state backend/lock service and policy engine.
- Event bus or durable event/outbox for notifications, activity, search indexing, and real-time updates.
- Metrics/logging/tracing infrastructure with tenant/resource correlation.

## Final status

No requested capability qualifies as **A. FULLY AVAILABLE** in this repository. The frontend can be connected to future APIs through its existing typed service/query architecture, but the backend contracts and implementations must be established first. This audit is complete; no implementation work was started.
