import { z } from "zod";
import { PageSchema, type Page } from "./api";

export const ControlPlaneOrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  displayName: z.string().min(1),
  status: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ControlPlaneOrganization = z.infer<typeof ControlPlaneOrganizationSchema>;
export const OrganizationListSchema = z.object({ items: z.array(ControlPlaneOrganizationSchema) });

export const RepositoryReferenceSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  provider: z.string().min(1),
  externalId: z.string().min(1),
  name: z.string().min(1),
  defaultBranch: z.string().min(1),
  selectedBranch: z.string().min(1).optional(),
  visibility: z.enum(["public", "private", "internal"]),
  status: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type RepositoryReference = z.infer<typeof RepositoryReferenceSchema>;
export const RepositoryReferencePageSchema = PageSchema(RepositoryReferenceSchema);
export type RepositoryReferencePage = Page<RepositoryReference>;

export const GitInstallationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  provider: z.literal("github"),
  providerInstallationId: z.string(),
  accountLogin: z.string().optional(),
  repositorySelection: z.string().optional(),
  connectionState: z.enum(["active", "suspended", "revoked", "disconnected"]),
  version: z.number()
});
export type GitInstallation = z.infer<typeof GitInstallationSchema>;
export const GitRepositorySchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  visibility: z.string(),
  archived: z.boolean(),
  disabled: z.boolean()
});
export type GitRepository = z.infer<typeof GitRepositorySchema>;
export const GitBranchSchema = z.object({
  name: z.string(),
  commitSha: z.string(),
  protected: z.boolean()
});
export type GitBranch = z.infer<typeof GitBranchSchema>;

export const PlatformDeploymentStateSchema = z.enum([
  "queued",
  "validating",
  "testing",
  "scanning",
  "building",
  "build_complete",
  "pushing",
  "deploying",
  "verifying",
  "ready",
  "failed",
  "cancel_requested",
  "cancelled",
  "rollback_queued",
  "rolling_back",
  "rolled_back"
]);
export const PlatformDeploymentSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string(),
  serviceId: z.string(),
  repositoryId: z.string(),
  branch: z.string(),
  commitSha: z.string(),
  triggerSource: z.string(),
  environment: z.string(),
  provider: z.string(),
  currentState: PlatformDeploymentStateSchema,
  stateVersion: z.coerce.number(),
  imageTag: z.string().nullable().optional(),
  imageDigest: z.string().nullable().optional(),
  endpoint: z.string().url().nullable().optional(),
  rollbackTargetId: z.string().nullable().optional(),
  previousSuccessfulDeploymentId: z.string().nullable().optional(),
  configurationSnapshot: z.record(z.unknown()).optional(),
  rollbackReason: z.string().nullable().optional(),
  rollbackApprovalId: z.string().nullable().optional(),
  rollbackMetadata: z.record(z.unknown()).optional(),
  attemptCount: z.number(),
  failureCode: z.string().nullable().optional(),
  failureMessage: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type PlatformDeployment = z.infer<typeof PlatformDeploymentSchema>;
export const RollbackComparisonSchema = z.object({
  current: PlatformDeploymentSchema,
  target: PlatformDeploymentSchema,
  configurationChanges: z.array(
    z.object({ path: z.string(), current: z.unknown(), target: z.unknown(), redacted: z.boolean() })
  ),
  resourceChanges: z.array(
    z.object({ path: z.string(), current: z.unknown(), target: z.unknown(), redacted: z.boolean() })
  ),
  environmentVariableNames: z.object({ current: z.array(z.string()), target: z.array(z.string()) }),
  compatibility: z.object({
    currentMigrations: z.array(z.string()),
    targetMigrations: z.array(z.string()),
    removedByRollback: z.array(z.string()),
    proven: z.boolean(),
    mode: z.string(),
    blocked: z.boolean(),
    warning: z.string().nullable()
  }),
  approvalRequired: z.boolean(),
  policy: z.record(z.unknown())
});
export type RollbackComparison = z.infer<typeof RollbackComparisonSchema>;
export const DeploymentEventSchema = z.object({
  id: z.string(),
  schemaVersion: z.literal("deployment-event.v1"),
  deploymentId: z.string(),
  organizationId: z.string(),
  sequence: z.coerce.number(),
  eventType: z.string(),
  stage: z.string().nullable(),
  stateVersion: z.coerce.number().nullable(),
  timestamp: z.string(),
  level: z.enum(["debug", "info", "warn", "error"]),
  source: z.string(),
  attempt: z.coerce.number(),
  state: PlatformDeploymentStateSchema.nullable().optional(),
  safeMessage: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string()
});
export type DeploymentEvent = z.infer<typeof DeploymentEventSchema>;
export const DeploymentStageSchema = z.object({
  id: z.string(),
  deploymentId: z.string(),
  name: z.string(),
  state: z.enum(["pending", "running", "passed", "failed", "skipped", "cancelled"]),
  attempt: z.coerce.number(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  durationMs: z.coerce.number().nullable(),
  safeMessage: z.string().nullable().optional()
});
export type DeploymentStage = z.infer<typeof DeploymentStageSchema>;

export const PreviewRevisionSchema = z.object({
  id: z.string(),
  previewId: z.string(),
  deploymentId: z.string().nullable(),
  commitSha: z.string(),
  trustLevel: z.string(),
  protectedSecretsAllowed: z.boolean(),
  status: z.string(),
  createdAt: z.string()
});
export const PreviewRouteSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  status: z.string(),
  certificateStatus: z.string(),
  certificateExpiresAt: z.string().nullable().optional(),
  verificationScope: z.enum(["local", "public"]).nullable().optional()
});
export const PreviewSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string(),
  serviceId: z.string(),
  repositoryId: z.string(),
  pullRequestNumber: z.number().nullable(),
  isolationKey: z.string(),
  generatedHostname: z.string(),
  lifecycleStatus: z.string(),
  cleanupStatus: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  revision: PreviewRevisionSchema.nullable().optional(),
  route: PreviewRouteSchema.nullable().optional()
});
export type Preview = z.infer<typeof PreviewSchema>;
export const CustomDomainSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string(),
  serviceId: z.string(),
  hostnameAscii: z.string(),
  hostnameDisplay: z.string(),
  status: z.string(),
  routeId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CustomDomain = z.infer<typeof CustomDomainSchema>;
export const ProviderCapabilitySchema = z.object({
  id: z.string(),
  supportLevel: z.enum(["production", "beta", "experimental", "planned", "unsupported"]),
  enabled: z.boolean(),
  evidence: z.string()
});
export const ProviderCatalogItemSchema = z.object({
  type: z.string(),
  resourceType: z.enum(["cloud_connection", "deployment_target"]),
  supportLevel: z.enum(["production", "beta", "experimental", "planned", "unsupported"]),
  connectable: z.boolean(),
  capabilities: z.array(ProviderCapabilitySchema)
});
export const ProviderConnectionSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  displayName: z.string(),
  providerType: z.literal("aws"),
  roleArn: z.string(),
  expectedAccountId: z.string(),
  permittedRegions: z.array(z.string()),
  enabledCapabilities: z.array(z.string()),
  status: z.enum(["draft", "validating", "active", "degraded", "invalid", "disabled", "revoked"]),
  lastValidationAt: z.string().nullable(),
  lastSuccessfulValidationAt: z.string().nullable(),
  validationErrorCategory: z.string().nullable(),
  configurationVersion: z.number(),
  version: z.number(),
  disabledAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export const DeploymentTargetSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  providerType: z.literal("kubernetes"),
  clusterFingerprint: z.string().nullable(),
  apiServerOrigin: z.string(),
  allowedNamespaces: z.array(z.string()),
  allowedEnvironments: z.array(z.string()),
  authenticationMethod: z.enum(["oidc", "workload_identity", "service_account_token"]),
  credentialVersion: z.number(),
  version: z.number(),
  status: z.enum(["draft", "validating", "active", "degraded", "invalid", "disabled", "revoked"]),
  kubernetesVersion: z.string().nullable(),
  capabilityResults: z.record(z.unknown()),
  permissionValidation: z.string(),
  connectionHealth: z.string(),
  lastValidationAt: z.string().nullable(),
  disabledAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ProviderCatalogItem = z.infer<typeof ProviderCatalogItemSchema>;
export type ProviderConnection = z.infer<typeof ProviderConnectionSchema>;
export type DeploymentTarget = z.infer<typeof DeploymentTargetSchema>;
export const OrganizationRoleSchema = z.enum([
  "owner",
  "admin",
  "security_admin",
  "platform_engineer",
  "developer",
  "operator",
  "approver",
  "auditor",
  "viewer"
]);
export const OrganizationMembershipSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
  status: z.string(),
  role: OrganizationRoleSchema,
  authorizationVersion: z.number().optional(),
  version: z.number()
});
export const EffectivePermissionsSchema = z.object({
  authorizationVersion: z.number(),
  policyVersion: z.number(),
  assignments: z.array(
    z.object({ role: OrganizationRoleSchema, scopeType: z.string(), scopeId: z.string() })
  ),
  permissions: z.array(z.string())
});
export const SecretReferenceSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  providerConnectionId: z.string().nullable(),
  deploymentTargetId: z.string().nullable(),
  displayName: z.string(),
  providerType: z.enum(["aws_secrets_manager", "kubernetes_external_secret"]),
  externalIdentifier: z.string(),
  versionSelector: z.string().nullable(),
  injectionKey: z.string(),
  destination: z.enum(["environment", "file"]),
  protected: z.boolean(),
  status: z.enum(["draft", "active", "invalid", "disabled", "revoked"]),
  validationCategory: z.string().nullable(),
  referenceVersion: z.number(),
  version: z.number(),
  disabledAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type OrganizationRole = z.infer<typeof OrganizationRoleSchema>;
export type OrganizationMembership = z.infer<typeof OrganizationMembershipSchema>;
export type EffectivePermissions = z.infer<typeof EffectivePermissionsSchema>;
export type SecretReference = z.infer<typeof SecretReferenceSchema>;
export const ApprovalRequestSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string().nullable(),
  environment: z.string().nullable(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  action: z.string(),
  riskLevel: z.string(),
  requesterId: z.string(),
  policyVersion: z.number(),
  snapshot: z.record(z.string(), z.unknown()),
  snapshotDigest: z.string(),
  state: z.enum([
    "not_required",
    "pending",
    "approved",
    "rejected",
    "expired",
    "cancelled",
    "invalidated",
    "overridden",
    "executing",
    "consumed",
    "failed"
  ]),
  requiredCount: z.number(),
  approvals: z.array(z.object({ actorId: z.string(), role: z.string(), at: z.string() })),
  expiresAt: z.string(),
  version: z.number()
});
export const SecurityPolicySchema = z.object({
  id: z.string(),
  kind: z.string(),
  version: z.number(),
  status: z.object({
    state: z.enum(["enforce", "audit", "disabled", "unsupported", "unknown", "error"]),
    targetCapability: z.string(),
    enforcementSource: z.string(),
    violations: z.array(
      z.object({ code: z.string(), resource: z.string().nullable(), message: z.string() })
    )
  })
});
export const PolicyExceptionSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string(),
  environment: z.string(),
  targetId: z.string(),
  policyId: z.string(),
  serviceId: z.string(),
  workloadId: z.string().nullable(),
  justification: z.string(),
  compensatingControl: z.string(),
  status: z.string(),
  startsAt: z.string(),
  expiresAt: z.string(),
  version: z.number()
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;
export type PolicyException = z.infer<typeof PolicyExceptionSchema>;

export const DetectionFieldSchema = z.object({
  value: z.unknown().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string())
});
export const ServiceCandidateSchema = z.object({
  id: z.string(),
  serviceRoot: DetectionFieldSchema,
  serviceName: DetectionFieldSchema,
  runtime: DetectionFieldSchema,
  framework: DetectionFieldSchema,
  dockerfilePath: DetectionFieldSchema,
  buildContext: DetectionFieldSchema,
  packageManager: DetectionFieldSchema,
  proposedBuildCommand: DetectionFieldSchema,
  proposedTestCommand: DetectionFieldSchema,
  proposedStartCommand: DetectionFieldSchema,
  containerPort: DetectionFieldSchema,
  healthPath: DetectionFieldSchema,
  readinessPath: DetectionFieldSchema,
  environmentVariableNames: DetectionFieldSchema,
  conflicts: z.array(z.unknown()),
  requiresConfirmation: z.boolean(),
  evidence: z.array(z.string()),
  warnings: z.array(z.unknown())
});
export const DetectionResultSchema = z.object({
  schemaVersion: z.string(),
  detectionEngineVersion: z.string(),
  repositoryId: z.string(),
  commitSha: z.string(),
  candidates: z.array(ServiceCandidateSchema),
  warnings: z.array(z.unknown())
});
export const DetectionRunSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string(),
  repositoryId: z.string(),
  commitSha: z.string(),
  status: z.string(),
  result: DetectionResultSchema,
  createdAt: z.string()
});
export type DetectionRun = z.infer<typeof DetectionRunSchema>;
export type ServiceCandidate = z.infer<typeof ServiceCandidateSchema>;
export type ServiceConfiguration = {
  serviceName: string;
  serviceRoot: string;
  dockerfilePath: string;
  buildContext: string;
  buildCommand: string;
  testCommand: string;
  startCommand: string;
  packageManager: string;
  containerPort: number;
  cpuRequest: string;
  cpuLimit: string;
  memoryRequest: string;
  memoryLimit: string;
  minReplicas: number;
  maxReplicas: number;
  startupPath: string;
  readinessPath: string;
  healthPath: string;
  timeoutSeconds: number;
  retryCount: number;
  targetEnvironment: "development" | "staging" | "production";
  kubernetesTarget: string;
  variables: Record<string, string>;
  secretReferences: string[];
  deploymentPolicy: string;
};
export const ConfigurationValidationSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.object({ field: z.string(), message: z.string() })),
  warnings: z.array(z.object({ field: z.string(), message: z.string() }))
});
export const ConfigurationDraftSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string(),
  repositoryId: z.string(),
  commitSha: z.string(),
  candidateId: z.string(),
  configuration: z.record(z.string(), z.unknown()),
  validation: ConfigurationValidationSchema.nullable(),
  version: z.number(),
  updatedAt: z.string()
});
export type ConfigurationDraft = z.infer<typeof ConfigurationDraftSchema>;
export type ConfigurationValidation = z.infer<typeof ConfigurationValidationSchema>;

export const EnvironmentReferenceSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["development", "staging", "production", "custom"]),
  status: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type EnvironmentReference = z.infer<typeof EnvironmentReferenceSchema>;
export const EnvironmentReferencePageSchema = PageSchema(EnvironmentReferenceSchema);
export type EnvironmentReferencePage = Page<EnvironmentReference>;
