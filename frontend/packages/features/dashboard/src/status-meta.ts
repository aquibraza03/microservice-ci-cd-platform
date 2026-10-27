import type { MessageKey } from "@saas/intl";
import type { StatusBadgeTone } from "@saas/ui";
import type {
  ActivityType,
  AlertSeverity,
  AlertStatus,
  DashboardTimeRange,
  DeploymentStatus,
  EnvironmentKind,
  PipelineStatus,
  PipelineTrigger,
  ProjectStatus,
  ServiceStatus,
  SystemHealthStatus
} from "@saas/types";

export type StatusMeta = {
  tone: StatusBadgeTone;
  labelKey: MessageKey;
};

export const pipelineStatusMeta: Record<PipelineStatus, StatusMeta> = {
  succeeded: { tone: "success", labelKey: "status.pipeline.succeeded" },
  running: { tone: "info", labelKey: "status.pipeline.running" },
  queued: { tone: "neutral", labelKey: "status.pipeline.queued" },
  failed: { tone: "destructive", labelKey: "status.pipeline.failed" },
  cancelled: { tone: "warning", labelKey: "status.pipeline.cancelled" },
  skipped: { tone: "neutral", labelKey: "status.pipeline.skipped" }
};

export const deploymentStatusMeta: Record<DeploymentStatus, StatusMeta> = {
  succeeded: { tone: "success", labelKey: "status.deployment.succeeded" },
  running: { tone: "info", labelKey: "status.deployment.running" },
  pending: { tone: "neutral", labelKey: "status.deployment.pending" },
  failed: { tone: "destructive", labelKey: "status.deployment.failed" },
  "rolled-back": { tone: "warning", labelKey: "status.deployment.rolledBack" },
  cancelled: { tone: "neutral", labelKey: "status.deployment.cancelled" }
};

export const serviceStatusMeta: Record<ServiceStatus, StatusMeta> = {
  healthy: { tone: "success", labelKey: "status.service.healthy" },
  degraded: { tone: "warning", labelKey: "status.service.degraded" },
  down: { tone: "destructive", labelKey: "status.service.down" },
  unknown: { tone: "neutral", labelKey: "status.service.unknown" }
};

export const systemHealthStatusMeta: Record<SystemHealthStatus, StatusMeta> = {
  operational: { tone: "success", labelKey: "status.health.operational" },
  degraded: { tone: "warning", labelKey: "status.health.degraded" },
  partial: { tone: "warning", labelKey: "status.health.partial" },
  outage: { tone: "destructive", labelKey: "status.health.outage" },
  unknown: { tone: "neutral", labelKey: "status.health.unknown" }
};

export const alertSeverityMeta: Record<AlertSeverity, StatusMeta> = {
  critical: { tone: "destructive", labelKey: "status.alert.critical" },
  high: { tone: "destructive", labelKey: "status.alert.high" },
  medium: { tone: "warning", labelKey: "status.alert.medium" },
  low: { tone: "info", labelKey: "status.alert.low" },
  info: { tone: "info", labelKey: "status.alert.info" }
};

export const alertStatusMeta: Record<AlertStatus, StatusMeta> = {
  open: { tone: "warning", labelKey: "status.alert.open" },
  acknowledged: { tone: "info", labelKey: "status.alert.acknowledged" },
  resolved: { tone: "success", labelKey: "status.alert.resolved" }
};

export const projectStatusMeta: Record<ProjectStatus, StatusMeta> = {
  active: { tone: "success", labelKey: "status.project.active" },
  archived: { tone: "neutral", labelKey: "status.project.archived" }
};

export const environmentKindMeta: Record<EnvironmentKind, StatusMeta> = {
  production: { tone: "primary", labelKey: "status.environment.production" },
  staging: { tone: "warning", labelKey: "status.environment.staging" },
  development: { tone: "info", labelKey: "status.environment.development" },
  preview: { tone: "info", labelKey: "status.environment.preview" },
  canary: { tone: "warning", labelKey: "status.environment.canary" }
};

export const activityTypeMeta: Record<ActivityType, StatusMeta> = {
  pipeline: { tone: "info", labelKey: "status.activity.pipeline" },
  deployment: { tone: "success", labelKey: "status.activity.deployment" },
  security: { tone: "warning", labelKey: "status.activity.security" },
  alert: { tone: "destructive", labelKey: "status.activity.alert" },
  project: { tone: "primary", labelKey: "status.activity.project" },
  auth: { tone: "neutral", labelKey: "status.activity.auth" },
  system: { tone: "neutral", labelKey: "status.activity.system" }
};

export const pipelineTriggerMeta: Record<PipelineTrigger, MessageKey> = {
  manual: "status.trigger.manual",
  schedule: "status.trigger.schedule",
  webhook: "status.trigger.webhook",
  ci: "status.trigger.ci"
};

export const dashboardRangeLabelKey: Record<DashboardTimeRange, MessageKey> = {
  "24h": "dashboard.range.24h",
  "7d": "dashboard.range.7d",
  "30d": "dashboard.range.30d",
  "90d": "dashboard.range.90d"
};

/** Metric ids returned by the contract that the UI knows how to localize. */
export const metricLabelKeys: Record<string, MessageKey> = {
  pipelineRuns: "dashboard.metrics.pipelineRuns",
  deployments: "dashboard.metrics.deployments",
  projects: "dashboard.metrics.projects",
  successRate: "dashboard.metrics.successRate",
  openAlerts: "dashboard.metrics.openAlerts"
};
