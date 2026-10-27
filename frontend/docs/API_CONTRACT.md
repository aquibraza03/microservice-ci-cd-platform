# Control Plane API Contract

This document is the **frontend ↔ backend contract** for the Dashboard and core
user experience (Phase 10 Part 2). The frontend never invents backend behavior:
every widget reads a typed, validated response from one of the endpoints below.
If an endpoint is not implemented yet, the consuming widget renders an honest
empty / unavailable / error state (never hardcoded values).

Endpoints are configuration-driven through `NEXT_PUBLIC_*` variables
(`NEXT_PUBLIC_DASHBOARD_*`, `NEXT_PUBLIC_PROJECTS_*`) and resolved against
`NEXT_PUBLIC_API_BASE_URL`. The defaults below are the canonical paths.

## Conventions

- `Content-Type: application/json`; authenticated with `Authorization: Bearer <token>`.
- List endpoints return the standard pagination envelope:

```ts
type Page<T> = {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};
```

- Errors return `{ error: string }` with appropriate HTTP status codes
  (400 validation, 401/403 auth, 404 missing, 5xx server).
- Timestamps are ISO-8601 strings.

## Dashboard

### `GET /dashboard/metrics?range=24h|7d|30d|90d`

```ts
{
  range: "24h" | "7d" | "30d" | "90d";
  generatedAt: string; // ISO-8601
  metrics: Array<{
    id: string; // stable key: pipelines|deployments|projects|alerts|successRate|avgDuration
    value: number;
    previousValue?: number | null; // same metric for the previous period
    unit?: "number" | "percent" | "ms";
    sparkline?: number[]; // sampled series over the range
  }>;
}
```

### `GET /dashboard/pipeline-runs?limit=&status=`

`Page<PipelineRun>` where:

```ts
type PipelineRun = {
  id: string;
  projectId: string;
  projectName: string;
  pipelineName: string;
  branch: string;
  commit: string;
  commitMessage?: string;
  trigger: "manual" | "schedule" | "webhook" | "ci";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "skipped";
  actor?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
};
```

### `GET /dashboard/deployments?limit=`

`Page<Deployment>` where:

```ts
type Deployment = {
  id: string;
  projectId: string;
  projectName: string;
  environment: {
    id: string;
    name: string;
    kind: "production" | "staging" | "development" | "preview" | "canary";
    url?: string | null;
  };
  version: string; // image tag / release
  status: "pending" | "running" | "succeeded" | "failed" | "rolled-back" | "cancelled";
  actor?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
};
```

### `GET /dashboard/health`

```ts
{
  status: "operational" | "degraded" | "partial" | "outage" | "unknown";
  checkedAt: string;
  incidentCount?: number;
  services: Array<{
    name: string;                  // e.g. api, database, cache, message-queue, registry, kubernetes
    status: "healthy" | "degraded" | "down" | "unknown";
    latencyMs?: number | null;
    message?: string | null;
  }>;
}
```

### `GET /dashboard/alerts?limit=`

`Page<Alert>` where:

```ts
type Alert = {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description?: string | null;
  source: string;
  status: "open" | "acknowledged" | "resolved";
  createdAt: string;
};
```

### `GET /dashboard/security`

```ts
{
  vulnerabilities: { total: number; critical: number; high: number; medium: number; low: number; resolved: number };
  riskLevel?: "low" | "medium" | "high" | "critical" | "unknown" | null;
  lastScanAt?: string | null;
  sbomPackages?: number;
}
```

### `GET /dashboard/activity?limit=`

`Page<ActivityItem>` where:

```ts
type ActivityItem = {
  id: string;
  type: "pipeline" | "deployment" | "security" | "alert" | "project" | "auth" | "system";
  title: string;
  description?: string | null;
  actor?: string | null;
  createdAt: string;
};
```

## Projects

### `GET /projects?search=&status=&page=&pageSize=`

`Page<ProjectSummary>` where:

```ts
type ProjectSummary = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  status: "active" | "archived";
  namespaceId?: string | null;
  teamId?: string | null;
  repositoryCount: number;
  pipelineCount: number;
  deploymentCount: number;
  owner?: string | null;
  lastActivityAt?: string | null;
};
```

### `GET /projects/{id}`

`ProjectDetail` = `ProjectSummary` plus:

```ts
{
  createdAt: string;
  updatedAt: string;
  defaultBranch: string;
  repositoryUrl?: string | null;
  environments: Environment[];
}
```

## Organizations

### `GET /organizations` · `POST /organizations` · `GET /organizations/{id}`

Implemented against the control-plane-api `organizations` table. Requires
authentication; membership is enforced server-side (`requireAccess`).

## Repositories

### `GET /organizations/{id}/repositories?page=&pageSize=` · `POST /organizations/{id}/repositories?projectId=`

`Page<RepositoryReference>`. Implemented and Postgres-backed. This is a
reference record only (id, provider, externalId, name, defaultBranch,
visibility, status) — it identifies an external repository but does not
proxy provider OAuth, commits, branches, pipeline status, or deployments.
The frontend's Repositories page reads this contract directly.

## Environments

### `GET /organizations/{id}/environments?page=&pageSize=` · `POST /organizations/{id}/environments?projectId=`

`Page<EnvironmentReference>`. Implemented and Postgres-backed. Same
reference-record scope as Repositories: identifies a deployment target
(name, type, status) but does not carry live deployment status, release
history, or infrastructure metrics for that environment — those remain
pending (see "DevOps module contracts pending" below, which still applies to
the environment _detail_ route). The frontend's Environments list page reads
this contract directly.

## DevOps module contracts pending

The following route foundations are intentionally unavailable until backend
contracts are approved: pipeline definitions and actions, pipeline run
details/stages/jobs, log queries and streaming, artifacts/downloads,
deployment details/timelines, environment details (single-resource fetch),
Docker registries/images, Kubernetes clusters/resources, and Terraform
workspaces/plans/applies. Each contract must use the conventions above, avoid
returning secrets, and support pagination or cursoring for large resources.
The frontend must add typed Zod schemas and services through the existing
`HttpClient` before enabling the corresponding feature flag.

## Not yet implemented

The following sections are prepared in the navigation model behind feature
flags (default **off**). Enable the corresponding `NEXT_PUBLIC_FEATURE_*` flag
together with the module's backend contract to expose them:

| Section         | Feature flag                          |
| --------------- | ------------------------------------- |
| Pipelines       | `NEXT_PUBLIC_FEATURE_PIPELINES`       |
| Docker          | `NEXT_PUBLIC_FEATURE_CONTAINERS`      |
| Kubernetes      | `NEXT_PUBLIC_FEATURE_INFRASTRUCTURE`  |
| Terraform       | `NEXT_PUBLIC_FEATURE_INFRASTRUCTURE`  |
| Logs            | `NEXT_PUBLIC_FEATURE_LOGS`            |
| Traces          | `NEXT_PUBLIC_FEATURE_TRACES`          |
| Alerts          | `NEXT_PUBLIC_FEATURE_ALERTS`          |
| Security        | `NEXT_PUBLIC_FEATURE_SECURITY`        |
| Vulnerabilities | `NEXT_PUBLIC_FEATURE_VULNERABILITIES` |
| SBOM            | `NEXT_PUBLIC_FEATURE_SBOM`            |
| Compliance      | `NEXT_PUBLIC_FEATURE_COMPLIANCE`      |
| Users           | `NEXT_PUBLIC_FEATURE_USERS`           |
| Teams           | `NEXT_PUBLIC_FEATURE_TEAMS`           |
| Settings        | `NEXT_PUBLIC_FEATURE_SETTINGS`        |

## Development data source

`NEXT_PUBLIC_DASHBOARD_SOURCE=dev` enables a **development-only** sample data
source so the UI can be exercised without a backend. It is explicitly
forbidden in production builds (the factory throws), and widgets render a
"sample data" indicator while it is active. The `http` source (default) always
talks to the real contract above.

## DevOps module contracts pending

The following route foundations are intentionally unavailable until backend
contracts are approved: pipeline definitions and actions, pipeline run
details/stages/jobs, log queries and streaming, artifacts/downloads,
deployment details/timelines, environment list/details, Docker
registries/images, Kubernetes clusters/resources, and Terraform
workspaces/plans/applies. Each contract must use the conventions above, avoid
returning secrets, and support pagination or cursoring for large resources.
The frontend must add typed Zod schemas and services through the existing
`HttpClient` before enabling the corresponding feature flag.
