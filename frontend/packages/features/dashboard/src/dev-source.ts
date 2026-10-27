import type {
  ActivityItem,
  Alert,
  DashboardMetrics,
  DashboardTimeRange,
  Deployment,
  PipelineRun,
  ProjectDetail,
  ProjectSummary,
  SecuritySummary,
  SystemHealth
} from "@saas/types";
import type { DashboardDataSource } from "./data-source";

/**
 * Development-only sample data source.
 *
 * Produces a deterministic, clearly-labelled dataset so the UI can be exercised
 * without a backend. It is FORBIDDEN in production builds: the guard throws
 * when `NODE_ENV === "production"`, and consumers render a "sample data"
 * indicator while this source is active.
 */

function assertNotProduction(): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    throw new Error("The development dashboard data source is disabled in production builds.");
  }
}

/** Small deterministic PRNG so generated data is stable across renders/tests. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

const PROJECTS: Array<Omit<ProjectSummary, "lastActivityAt">> = [
  {
    id: "prj-001",
    slug: "platform-api",
    name: "Platform API",
    description: "Core control plane API gateway and domain services.",
    status: "active",
    repositoryCount: 6,
    pipelineCount: 24,
    deploymentCount: 132,
    owner: "platform-team"
  },
  {
    id: "prj-002",
    slug: "identity",
    name: "Identity Service",
    description: "Authentication, SSO, and token lifecycle management.",
    status: "active",
    repositoryCount: 3,
    pipelineCount: 12,
    deploymentCount: 64,
    owner: "security-team"
  },
  {
    id: "prj-003",
    slug: "billing",
    name: "Billing Engine",
    description: "Usage metering, invoicing, and subscription management.",
    status: "active",
    repositoryCount: 4,
    pipelineCount: 15,
    deploymentCount: 41,
    owner: "finance-team"
  },
  {
    id: "prj-004",
    slug: "notifications",
    name: "Notifications",
    description: "Cross-channel notification delivery (email, push, webhook).",
    status: "active",
    repositoryCount: 2,
    pipelineCount: 9,
    deploymentCount: 87,
    owner: "platform-team"
  },
  {
    id: "prj-005",
    slug: "admin-console",
    name: "Admin Console",
    description: "Internal operations and administration UI.",
    status: "active",
    repositoryCount: 2,
    pipelineCount: 8,
    deploymentCount: 33,
    owner: "platform-team"
  },
  {
    id: "prj-006",
    slug: "search",
    name: "Search Service",
    description: "Distributed search and document indexing.",
    status: "active",
    repositoryCount: 3,
    pipelineCount: 11,
    deploymentCount: 29,
    owner: "data-team"
  },
  {
    id: "prj-007",
    slug: "gateway",
    name: "API Gateway",
    description: "Edge routing, rate limiting, and mTLS termination.",
    status: "active",
    repositoryCount: 2,
    pipelineCount: 7,
    deploymentCount: 51,
    owner: "infra-team"
  },
  {
    id: "prj-008",
    slug: "data-warehouse",
    name: "Data Warehouse",
    description: "Analytics pipeline and reporting store.",
    status: "active",
    repositoryCount: 5,
    pipelineCount: 18,
    deploymentCount: 22,
    owner: "data-team"
  },
  {
    id: "prj-009",
    slug: "ml-serving",
    name: "ML Serving",
    description: "Model inference and feature store serving layer.",
    status: "active",
    repositoryCount: 4,
    pipelineCount: 13,
    deploymentCount: 17,
    owner: "data-team"
  },
  {
    id: "prj-010",
    slug: "mobile-api",
    name: "Mobile API",
    description: "Backend for the mobile client.",
    status: "active",
    repositoryCount: 2,
    pipelineCount: 6,
    deploymentCount: 48,
    owner: "client-team"
  },
  {
    id: "prj-011",
    slug: "legacy-crm",
    name: "CRM Migration",
    description: "Legacy CRM with phased migration.",
    status: "archived",
    repositoryCount: 3,
    pipelineCount: 0,
    deploymentCount: 5,
    owner: "sales-team"
  },
  {
    id: "prj-012",
    slug: "feature-flags",
    name: "Feature Flags",
    description: "Flag management and progressive delivery service.",
    status: "active",
    repositoryCount: 2,
    pipelineCount: 10,
    deploymentCount: 26,
    owner: "platform-team"
  }
];

const PIPELINE_NAMES = ["Build", "Test", "Lint", "Deploy", "Security scan"];
const BRANCHES = [
  "main",
  "release/2026.08",
  "feature/checkout-redesign",
  "hotfix/rate-limit",
  "chore/deps"
];
const COMMITS = ["9f2a1c4", "3b8d77e", "c01ef2a", "77a3d9b", "e5b4c1a", "2f9c6d0", "d1a4e8c"];
const ACTORS = ["alex.reed", "maya.patel", "jordan.lee", "sam.okafor", "priya.sharma"];
const VERSIONS = ["v1.24.0", "v1.24.1", "v2.0.0-rc.3", "sha-9f2a1c4", "2026.08.1"];
const COMMIT_MESSAGES = [
  "fix: handle empty cart in checkout",
  "feat: add audit log exports",
  "chore: bump runtime image",
  "fix: respect tenant timezone",
  "feat: rate limit by namespace",
  "refactor: extract billing client"
];

function buildPipelines(rand: () => number, now: number, limit: number): PipelineRun[] {
  const statuses: Array<PipelineRun["status"]> = [
    "succeeded",
    "succeeded",
    "succeeded",
    "succeeded",
    "succeeded",
    "failed",
    "failed",
    "running",
    "running",
    "queued",
    "cancelled",
    "skipped"
  ];
  const runs: PipelineRun[] = [];
  for (let index = 0; index < limit; index += 1) {
    const project = PROJECTS[Math.floor(rand() * PROJECTS.length)]!;
    const status = statuses[Math.floor(rand() * statuses.length)]!;
    const startedMs = now - Math.floor(rand() * 48 * 3600_000);
    const durationMs =
      status === "queued" || status === "skipped" ? null : 40_000 + Math.floor(rand() * 9 * 60_000);
    const finishedMs =
      status === "succeeded" || status === "failed" || status === "cancelled"
        ? startedMs + (durationMs ?? 0)
        : null;
    runs.push({
      id: `run-${String(index + 1).padStart(4, "0")}`,
      projectId: project.id,
      projectName: project.name,
      pipelineName: PIPELINE_NAMES[Math.floor(rand() * PIPELINE_NAMES.length)]!,
      branch: BRANCHES[Math.floor(rand() * BRANCHES.length)]!,
      commit: COMMITS[Math.floor(rand() * COMMITS.length)]!,
      commitMessage: COMMIT_MESSAGES[Math.floor(rand() * COMMIT_MESSAGES.length)]!,
      trigger: (["manual", "schedule", "webhook", "ci"] as const)[Math.floor(rand() * 4)]!,
      status,
      actor: ACTORS[Math.floor(rand() * ACTORS.length)]!,
      startedAt: iso(startedMs),
      finishedAt: finishedMs ? iso(finishedMs) : null,
      durationMs
    });
  }
  return runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

function buildDeployments(rand: () => number, now: number, limit: number): Deployment[] {
  const kinds: Array<Deployment["environment"]["kind"]> = [
    "production",
    "staging",
    "development",
    "preview",
    "canary"
  ];
  const statuses: Array<Deployment["status"]> = [
    "succeeded",
    "succeeded",
    "succeeded",
    "running",
    "pending",
    "failed",
    "rolled-back"
  ];
  const deployments: Deployment[] = [];
  for (let index = 0; index < limit; index += 1) {
    const project = PROJECTS[Math.floor(rand() * PROJECTS.length)]!;
    const status = statuses[Math.floor(rand() * statuses.length)]!;
    const startedMs = now - Math.floor(rand() * 24 * 3600_000);
    const durationMs = status === "pending" ? null : 20_000 + Math.floor(rand() * 5 * 60_000);
    const finishedMs =
      status === "succeeded" || status === "failed" || status === "rolled-back"
        ? startedMs + (durationMs ?? 0)
        : null;
    const kind = kinds[Math.floor(rand() * kinds.length)]!;
    deployments.push({
      id: `dep-${String(index + 1).padStart(4, "0")}`,
      projectId: project.id,
      projectName: project.name,
      environment: { id: `env-${kind}`, name: kind, kind },
      version: VERSIONS[Math.floor(rand() * VERSIONS.length)]!,
      status,
      actor: ACTORS[Math.floor(rand() * ACTORS.length)]!,
      startedAt: iso(startedMs),
      finishedAt: finishedMs ? iso(finishedMs) : null,
      durationMs
    });
  }
  return deployments.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

function buildAlerts(rand: () => number, now: number, limit: number): Alert[] {
  const severities: Array<Alert["severity"]> = ["critical", "high", "medium", "low", "info"];
  const statuses: Array<Alert["status"]> = ["open", "open", "acknowledged", "resolved"];
  const templates: Array<[string, string]> = [
    ["Error rate above threshold", "HTTP 5xx rate exceeded 1% over 10 minutes."],
    ["Queue depth growing", "Message queue backlog increased 5x in 30 minutes."],
    ["Certificate expiring", "TLS certificate for api.example.com expires in 14 days."],
    ["Disk usage high", "Database volume usage above 85%."],
    ["Build time regression", "Average pipeline duration increased 40% on main."],
    ["Auth failure spike", "Login failures increased for the organization."],
    ["Deployment rollback", "Version v1.24.0 rolled back automatically."]
  ];
  const alerts: Alert[] = [];
  for (let index = 0; index < limit; index += 1) {
    const [title, description] = templates[Math.floor(rand() * templates.length)]!;
    alerts.push({
      id: `alt-${String(index + 1).padStart(4, "0")}`,
      severity: severities[Math.floor(rand() * severities.length)]!,
      title,
      description,
      source: ["monitoring", "ci", "security"][Math.floor(rand() * 3)]!,
      status: statuses[Math.floor(rand() * statuses.length)]!,
      createdAt: iso(now - Math.floor(rand() * 72 * 3600_000))
    });
  }
  return alerts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function buildActivity(rand: () => number, now: number, limit: number): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (let index = 0; index < limit; index += 1) {
    const project = PROJECTS[Math.floor(rand() * PROJECTS.length)]!;
    const type = (["pipeline", "deployment", "security", "alert", "project", "auth"] as const)[
      Math.floor(rand() * 6)
    ]!;
    const actor = ACTORS[Math.floor(rand() * ACTORS.length)]!;
    items.push({
      id: `act-${String(index + 1).padStart(4, "0")}`,
      type,
      title: `${actor} ${type === "deployment" ? "deployed" : type === "pipeline" ? "ran a pipeline for" : type === "security" ? "scanned" : "updated"} ${project.name}`,
      description:
        type === "deployment"
          ? `Deployed ${VERSIONS[Math.floor(rand() * VERSIONS.length)]} to staging`
          : type === "pipeline"
            ? `${PIPELINE_NAMES[Math.floor(rand() * PIPELINE_NAMES.length)]} succeeded`
            : null,
      actor,
      createdAt: iso(now - Math.floor(rand() * 24 * 3600_000))
    });
  }
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function createDevDataSource(now: number = Date.now()): DashboardDataSource {
  assertNotProduction();

  const rand = mulberry32(20260813);
  const pipelineRuns = buildPipelines(rand, now, 48);
  const deployments = buildDeployments(rand, now, 16);
  const alerts = buildAlerts(rand, now, 12);
  const activity = buildActivity(rand, now, 16);

  const projects: ProjectSummary[] = PROJECTS.map((project, index) => ({
    ...project,
    lastActivityAt: iso(now - index * 7 * 3600_000)
  }));

  const projectDetails: ProjectDetail[] = PROJECTS.map((project, index) => ({
    ...project,
    createdAt: iso(now - 400 * 24 * 3600_000 - index * 9 * 24 * 3600_000),
    updatedAt: iso(now - index * 7 * 3600_000),
    defaultBranch: "main",
    repositoryUrl: `https://git.example.com/${project.slug}.git`,
    environments: [
      {
        id: `env-prod-${project.id}`,
        name: "Production",
        kind: "production",
        url: `https://${project.slug}.example.com`
      },
      {
        id: `env-staging-${project.id}`,
        name: "Staging",
        kind: "staging",
        url: `https://staging-${project.slug}.example.com`
      },
      { id: `env-dev-${project.id}`, name: "Development", kind: "development", url: null }
    ]
  }));

  const systemHealth: SystemHealth = {
    status: "operational",
    checkedAt: iso(now),
    incidentCount: 0,
    services: [
      { name: "api", status: "healthy", latencyMs: 42 },
      { name: "database", status: "healthy", latencyMs: 11 },
      { name: "cache", status: "healthy", latencyMs: 4 },
      { name: "message-queue", status: "healthy", latencyMs: 23 },
      { name: "container-registry", status: "healthy", latencyMs: 87 },
      { name: "kubernetes", status: "healthy", latencyMs: 120 }
    ]
  };

  const securitySummary: SecuritySummary = {
    vulnerabilities: { total: 38, critical: 2, high: 6, medium: 18, low: 12, resolved: 21 },
    riskLevel: "medium",
    lastScanAt: iso(now - 26 * 3600_000),
    sbomPackages: 142
  };

  const metrics = (range: DashboardTimeRange): DashboardMetrics => {
    const points = range === "24h" ? 12 : 20;
    const series = (base: number, volatility: number) =>
      Array.from({ length: points }, (_, index) =>
        Math.max(
          0,
          Math.round(
            base + Math.sin(index / 2.4) * base * volatility + (rand() - 0.5) * base * volatility
          )
        )
      );
    return {
      range,
      generatedAt: iso(now),
      metrics: [
        {
          id: "pipelineRuns",
          value: 184,
          previousValue: 162,
          unit: "number",
          sparkline: series(160, 0.18)
        },
        {
          id: "deployments",
          value: 26,
          previousValue: 31,
          unit: "number",
          sparkline: series(28, 0.25)
        },
        {
          id: "projects",
          value: PROJECTS.filter((p) => p.status === "active").length,
          previousValue: 10,
          unit: "number",
          sparkline: series(11, 0.05)
        },
        {
          id: "successRate",
          value: 94.6,
          previousValue: 92.1,
          unit: "percent",
          sparkline: series(94, 0.02)
        },
        { id: "openAlerts", value: 3, previousValue: 7, unit: "number", sparkline: series(5, 0.35) }
      ]
    };
  };

  return {
    isSample: true,
    getMetrics: (range) => Promise.resolve(metrics(range)),
    getPipelineRuns: ({ limit = pipelineRuns.length, status } = {}) =>
      Promise.resolve({
        items: pipelineRuns
          .filter((run) => (status ? run.status === status : true))
          .slice(0, limit),
        pagination: { page: 1, pageSize: limit, totalItems: pipelineRuns.length, totalPages: 1 }
      }),
    getDeployments: ({ limit = deployments.length } = {}) =>
      Promise.resolve({
        items: deployments.slice(0, limit),
        pagination: { page: 1, pageSize: limit, totalItems: deployments.length, totalPages: 1 }
      }),
    getSystemHealth: () => Promise.resolve(systemHealth),
    getAlerts: ({ limit = alerts.length } = {}) =>
      Promise.resolve({
        items: alerts.slice(0, limit),
        pagination: { page: 1, pageSize: limit, totalItems: alerts.length, totalPages: 1 }
      }),
    getSecuritySummary: () => Promise.resolve(securitySummary),
    getActivity: ({ limit = activity.length } = {}) =>
      Promise.resolve({
        items: activity.slice(0, limit),
        pagination: { page: 1, pageSize: limit, totalItems: activity.length, totalPages: 1 }
      }),
    listProjects: ({ search, status, page = 1, pageSize = 10 } = {}) => {
      const needle = search?.toLowerCase();
      const filtered = projects.filter(
        (project) =>
          (status ? project.status === status : true) &&
          (needle
            ? project.name.toLowerCase().includes(needle) ||
              project.slug.toLowerCase().includes(needle)
            : true)
      );
      const start = (page - 1) * pageSize;
      return Promise.resolve({
        items: filtered.slice(start, start + pageSize),
        pagination: {
          page,
          pageSize,
          totalItems: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / pageSize))
        }
      });
    },
    getProject: (id) => {
      const project = projectDetails.find((p) => p.id === id);
      if (!project) return Promise.reject(new Error(`Project ${id} not found`));
      return Promise.resolve(project);
    }
  };
}
