import { z } from "zod";

/**
 * Platform domain contracts (projects, pipelines, deployments).
 *
 * These map the DOCUMENTED dashboard/control-plane API contract (see
 * `frontend/docs/API_CONTRACT.md`). The frontend fetches these resources over
 * the shared HTTP client; nothing here invents backend behavior — when an
 * endpoint is not implemented yet the consuming widget renders an honest
 * empty/unavailable state.
 */

export const PipelineStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELLED: "cancelled",
  SKIPPED: "skipped"
} as const;

export type PipelineStatus = (typeof PipelineStatus)[keyof typeof PipelineStatus];

export const PipelineStatusSchema = z.enum([
  PipelineStatus.QUEUED,
  PipelineStatus.RUNNING,
  PipelineStatus.SUCCEEDED,
  PipelineStatus.FAILED,
  PipelineStatus.CANCELLED,
  PipelineStatus.SKIPPED
]);

export const PipelineTrigger = {
  MANUAL: "manual",
  SCHEDULE: "schedule",
  WEBHOOK: "webhook",
  CI: "ci"
} as const;

export type PipelineTrigger = (typeof PipelineTrigger)[keyof typeof PipelineTrigger];

export const PipelineTriggerSchema = z.enum([
  PipelineTrigger.MANUAL,
  PipelineTrigger.SCHEDULE,
  PipelineTrigger.WEBHOOK,
  PipelineTrigger.CI
]);

export const PipelineRunSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string(),
  pipelineName: z.string(),
  branch: z.string(),
  commit: z.string(),
  commitMessage: z.string().default(""),
  trigger: PipelineTriggerSchema,
  status: PipelineStatusSchema,
  actor: z.string().optional().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().optional().nullable(),
  durationMs: z.number().int().nonnegative().optional().nullable()
});

export type PipelineRun = z.infer<typeof PipelineRunSchema>;

export const DeploymentStatus = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  ROLLED_BACK: "rolled-back",
  CANCELLED: "cancelled"
} as const;

export type DeploymentStatus = (typeof DeploymentStatus)[keyof typeof DeploymentStatus];

export const DeploymentStatusSchema = z.enum([
  DeploymentStatus.PENDING,
  DeploymentStatus.RUNNING,
  DeploymentStatus.SUCCEEDED,
  DeploymentStatus.FAILED,
  DeploymentStatus.ROLLED_BACK,
  DeploymentStatus.CANCELLED
]);

export const EnvironmentKind = {
  PRODUCTION: "production",
  STAGING: "staging",
  DEVELOPMENT: "development",
  PREVIEW: "preview",
  CANARY: "canary"
} as const;

export type EnvironmentKind = (typeof EnvironmentKind)[keyof typeof EnvironmentKind];

export const EnvironmentKindSchema = z.enum([
  EnvironmentKind.PRODUCTION,
  EnvironmentKind.STAGING,
  EnvironmentKind.DEVELOPMENT,
  EnvironmentKind.PREVIEW,
  EnvironmentKind.CANARY
]);

export const EnvironmentSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: EnvironmentKindSchema,
  url: z.string().url().optional().nullable()
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export const DeploymentSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string(),
  environment: EnvironmentSchema,
  version: z.string(),
  status: DeploymentStatusSchema,
  actor: z.string().optional().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().optional().nullable(),
  durationMs: z.number().int().nonnegative().optional().nullable()
});

export type Deployment = z.infer<typeof DeploymentSchema>;

export const ProjectStatus = {
  ACTIVE: "active",
  ARCHIVED: "archived"
} as const;

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ProjectStatusSchema = z.enum([ProjectStatus.ACTIVE, ProjectStatus.ARCHIVED]);

/** Row contract for project lists (Projects page / dashboard overview). */
export const ProjectSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: ProjectStatusSchema,
  namespaceId: z.string().optional().nullable(),
  teamId: z.string().optional().nullable(),
  repositoryCount: z.number().int().nonnegative().default(0),
  pipelineCount: z.number().int().nonnegative().default(0),
  deploymentCount: z.number().int().nonnegative().default(0),
  owner: z.string().optional().nullable(),
  lastActivityAt: z.string().optional().nullable()
});

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

/** Detail contract for the Project Details foundation. */
export const ProjectDetailSchema = ProjectSummarySchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
  defaultBranch: z.string().default("main"),
  repositoryUrl: z.string().url().optional().nullable(),
  environments: z.array(EnvironmentSchema).default([])
});

export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;
