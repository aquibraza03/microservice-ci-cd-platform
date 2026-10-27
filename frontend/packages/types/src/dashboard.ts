import { z } from "zod";

/**
 * Dashboard contracts (metrics, system health, alerts, security, activity).
 *
 * These map the DOCUMENTED dashboard API contract (see
 * `frontend/docs/API_CONTRACT.md`). Widgets consume these typed shapes through
 * the dashboard data source and render loading/empty/error states — they never
 * hardcode production values.
 */

export const DashboardTimeRange = {
  H24: "24h",
  D7: "7d",
  D30: "30d",
  D90: "90d"
} as const;

export type DashboardTimeRange = (typeof DashboardTimeRange)[keyof typeof DashboardTimeRange];

export const DashboardTimeRangeSchema = z.enum([
  DashboardTimeRange.H24,
  DashboardTimeRange.D7,
  DashboardTimeRange.D30,
  DashboardTimeRange.D90
]);

/** Units understood by the metric card formatter. */
export const MetricUnit = {
  NUMBER: "number",
  PERCENT: "percent",
  MS: "ms"
} as const;

export type MetricUnit = (typeof MetricUnit)[keyof typeof MetricUnit];

export const MetricUnitSchema = z.enum([MetricUnit.NUMBER, MetricUnit.PERCENT, MetricUnit.MS]);

/**
 * A single dashboard KPI. `id` is a stable key the UI maps to a localized
 * label (e.g. `pipelines`, `deployments`, `projects`, `alerts`, `successRate`,
 * `avgDuration`). The trend/delta is derived client-side from `previousValue`.
 */
export const MetricSummarySchema = z.object({
  id: z.string().min(1),
  value: z.number(),
  previousValue: z.number().optional().nullable(),
  unit: MetricUnitSchema.default(MetricUnit.NUMBER),
  sparkline: z.array(z.number()).default([])
});

export type MetricSummary = z.infer<typeof MetricSummarySchema>;

export const DashboardMetricsSchema = z.object({
  range: DashboardTimeRangeSchema,
  generatedAt: z.string(),
  metrics: z.array(MetricSummarySchema)
});

export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;

export const ServiceStatus = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  DOWN: "down",
  UNKNOWN: "unknown"
} as const;

export type ServiceStatus = (typeof ServiceStatus)[keyof typeof ServiceStatus];

export const ServiceStatusSchema = z.enum([
  ServiceStatus.HEALTHY,
  ServiceStatus.DEGRADED,
  ServiceStatus.DOWN,
  ServiceStatus.UNKNOWN
]);

export const SystemHealthStatus = {
  OPERATIONAL: "operational",
  DEGRADED: "degraded",
  PARTIAL: "partial",
  OUTAGE: "outage",
  UNKNOWN: "unknown"
} as const;

export type SystemHealthStatus = (typeof SystemHealthStatus)[keyof typeof SystemHealthStatus];

export const SystemHealthStatusSchema = z.enum([
  SystemHealthStatus.OPERATIONAL,
  SystemHealthStatus.DEGRADED,
  SystemHealthStatus.PARTIAL,
  SystemHealthStatus.OUTAGE,
  SystemHealthStatus.UNKNOWN
]);

export const SystemServiceSchema = z.object({
  name: z.string().min(1),
  status: ServiceStatusSchema,
  latencyMs: z.number().nonnegative().optional().nullable(),
  message: z.string().optional().nullable()
});

export type SystemService = z.infer<typeof SystemServiceSchema>;

export const SystemHealthSchema = z.object({
  status: SystemHealthStatusSchema,
  services: z.array(SystemServiceSchema),
  checkedAt: z.string(),
  incidentCount: z.number().int().nonnegative().default(0)
});

export type SystemHealth = z.infer<typeof SystemHealthSchema>;

export const AlertSeverity = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  INFO: "info"
} as const;

export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export const AlertSeveritySchema = z.enum([
  AlertSeverity.CRITICAL,
  AlertSeverity.HIGH,
  AlertSeverity.MEDIUM,
  AlertSeverity.LOW,
  AlertSeverity.INFO
]);

export const AlertStatus = {
  OPEN: "open",
  ACKNOWLEDGED: "acknowledged",
  RESOLVED: "resolved"
} as const;

export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];

export const AlertStatusSchema = z.enum([
  AlertStatus.OPEN,
  AlertStatus.ACKNOWLEDGED,
  AlertStatus.RESOLVED
]);

export const AlertSchema = z.object({
  id: z.string().min(1),
  severity: AlertSeveritySchema,
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  source: z.string().default("platform"),
  status: AlertStatusSchema,
  createdAt: z.string()
});

export type Alert = z.infer<typeof AlertSchema>;

export const VulnerabilityCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative()
});

export type VulnerabilityCounts = z.infer<typeof VulnerabilityCountsSchema>;

export const RiskLevel = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
  UNKNOWN: "unknown"
} as const;

export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const RiskLevelSchema = z.enum([
  RiskLevel.LOW,
  RiskLevel.MEDIUM,
  RiskLevel.HIGH,
  RiskLevel.CRITICAL,
  RiskLevel.UNKNOWN
]);

export const SecuritySummarySchema = z.object({
  vulnerabilities: VulnerabilityCountsSchema,
  riskLevel: RiskLevelSchema.optional().nullable(),
  lastScanAt: z.string().optional().nullable(),
  sbomPackages: z.number().int().nonnegative().default(0)
});

export type SecuritySummary = z.infer<typeof SecuritySummarySchema>;

export const ActivityType = {
  PIPELINE: "pipeline",
  DEPLOYMENT: "deployment",
  SECURITY: "security",
  ALERT: "alert",
  PROJECT: "project",
  AUTH: "auth",
  SYSTEM: "system"
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const ActivityTypeSchema = z.enum([
  ActivityType.PIPELINE,
  ActivityType.DEPLOYMENT,
  ActivityType.SECURITY,
  ActivityType.ALERT,
  ActivityType.PROJECT,
  ActivityType.AUTH,
  ActivityType.SYSTEM
]);

export const ActivityItemSchema = z.object({
  id: z.string().min(1),
  type: ActivityTypeSchema,
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  actor: z.string().optional().nullable(),
  createdAt: z.string()
});

export type ActivityItem = z.infer<typeof ActivityItemSchema>;
