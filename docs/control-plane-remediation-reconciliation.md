# Architecture reconciliation before implementation

3 October 2026. Baseline: production-readiness-audit-2026-10-03.md and its artifacts. Scope for this increment: first evidence-backed remediation only, production frontend authentication selection. No Phase 2 operations. Git metadata remains absent.

## Route map

`resolveUrl` appends configured endpoint to API base (default http://localhost:8080/api). Absolute endpoint URLs remain absolute. next.config.mjs has headers but no rewrite/proxy. Thus the service URL is the browser request URL under defaults; no Next proxy forwards it. Actual deployed browser/proxy configuration has not been observed and is not inferred.

| UI/service | Default constructed URL path | Backend | Finding |
|---|---|---|---|
| MetricGrid/dashboard.service | /api/dashboard/metrics | absent | Not fixed by adding v1 alone |
| RecentPipelineRuns/dashboard.service | /api/dashboard/pipeline-runs | absent | Run domain not established |
| ProjectsOverview/projects.service | /api/projects | absent | Use of existing scoped contract needs adapter/hook work |
| ProjectsView/control-plane.service | /api/v1/organizations/{org}/projects | server projectsMatch | Existing authoritative route |
| RecentDeployments/dashboard.service | /api/dashboard/deployments | scoped deployment API exists | DTO/state mapping unresolved |
| Health/alerts/security/activity panels | /api/dashboard/{health,alerts,security,activity} | dashboard handlers absent | Per-domain authority gate below |
| JwtAuthStrategy/auth.service | /api/auth/{login,refresh,me,logout} | CP uses GitHub callback, /api/v1/me and /logout; auth-service login is a stub | Production identity deployment contract not proven |

## Auth map

Frontend config → createStrategy → guest/dev/JWT → TokenManager → Axios Bearer → backend JwtIdentityProvider issuer/audience/algorithm/kid verification → required session validation → internal user → repository requireAccess → active organization membership/RBAC/resource scope → tenant-qualified SQL. UI authenticated status is not backend authority. Existing production backend guards remain untouched.

Defect: GuestAuthStrategy reports AUTHENTICATED and its factory accepts auth disabled/guest in production. DevAuthStrategy already rejects production. Environment validation currently checks only dev dashboard data. First fix will reject unsafe auth both in environment parsing and strategy construction, including direct GuestAuthStrategy construction. Existing jwt and refresh-token providers are the supported production selection contract; no new provider is created. Live identity deployment remains unverified.

## Data provenance map / authority gate

| Feature/field | Domain/repository/table | Class | Decision |
|---|---|---|---|
| Project id/name/slug/status | PostgresRepository/projects | A: authoritative source exists | Existing scoped API; no new route in first increment |
| Project counts/branch/environments | Frontend defaults 0/main/[]; backend base DTO lacks these | D: contract ambiguous | No fabricated values; later DTO/UI correction required |
| Metrics (pipelineRuns, deployments, successRate, openAlerts) | Partial deployment state; no agreed metric window/denominator or alert/run source | D | No metric aggregation without domain definition |
| Pipeline runs | No pipeline-run schema identified in migrations | C: domain source missing | Never equate deployment to run |
| Deployments | PostgresDeploymentStore/deployments and stages/events | B: source exists, adapter missing | Existing states/environment scope must define DTO first |
| Health | API readiness exists; product SystemHealth semantics broader | D | Do not alias operational health |
| Alerts | No persisted product alert domain identified | C | No log-to-alert invention |
| Security vulnerability totals | Policies/audit exist; persisted vulnerability summary authority not established | C | Never return invented zero CVEs |
| Activity | PostgresAuditService/enterprise_audit_events | B/D: source exists, safe product projection unresolved | Audit permission is not automatically dashboard permission; no raw payload exposure |

Existing missing-route requests fail and widgets render errors. No unavailable-success payload is defined for missing metric values. Therefore no new dashboard endpoint qualifies for COMPLETE in this increment. Method/path/auth/query/default/max/DTO/empty/errors/sort/pagination/consistency for each new adapter must be agreed before implementation; existing frontend types alone do not settle those questions.

## Transaction map

Existing project POST: identity → REPOSITORY_MANAGE → input validation at route → withTransaction → projects insert + project_members owner insert → COMMIT → 201. No mutation added. Deployment creation/resumption uses existing database transaction plus quota/usage/audit/outbox; publication occurs after commit. Auth selection fix performs no backend/DB write and changes no transaction boundary.

## Failure map

Backend ControlPlaneError → status + {error:{code,message,requestId,details?}}; unknown exceptions → generic sanitized 500. Frontend toApiError currently recognizes string error/message, losing structured fields; ECONNABORTED is classified ABORTED before its unreachable TIMEOUT branch. Separate later fix. For this increment unsafe production selection must throw before producing a session or making an auth request. Current local .env.local dev setting must remain rejected in production.

## Exact remediation order

1. Production auth configuration/factory/direct guest guards; targeted tests, full frontend regression/typecheck/build under explicit existing JWT selection. This is the only implementation authorized by the request's first-increment instruction.
2. Safe structured errors and timeout normalization, after a separate incremental gate.
3. Project display authority and bounded SQL pagination, with explicit DTO compatibility and real PostgreSQL/tenant tests.
4. Scoped dashboard projects/deployment adapters only after independent contract gates; no duplicate unscoped routes.
5. Activity safe projection only after permission/semantics gate. Leave metrics/pipeline/health/alerts/security unresolved until authority exists.

Build validation will use non-secret process-scoped auth-enabled=true, provider=jwt, dashboard=http, NODE_ENV=production. This validates existing production selection/build compatibility, not a live issuer or login flow. No local file credentials, backend JWT validation, or infrastructure settings will be altered.
