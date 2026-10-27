import type { AppConfig } from "@saas/lib";
import { z } from "zod";
import type { HttpClient } from "../http";
import { resolveUrl } from "../url";
import {
  EnvironmentReferencePageSchema,
  OrganizationListSchema,
  ControlPlaneOrganizationSchema,
  PageSchema,
  ProjectDetailSchema,
  ProjectSummarySchema,
  RepositoryReferencePageSchema,
  RepositoryReferenceSchema,
  type EnvironmentReferencePage,
  type ControlPlaneOrganization,
  type Page,
  type ProjectDetail,
  type ProjectSummary,
  type RepositoryReferencePage,
  type RepositoryReference,
  GitInstallationSchema,
  GitRepositorySchema,
  GitBranchSchema,
  PlatformDeploymentSchema,
  DeploymentEventSchema,
  DeploymentStageSchema,
  DetectionRunSchema,
  ConfigurationDraftSchema,
  ConfigurationValidationSchema,
  PreviewSchema,
  CustomDomainSchema,
  ProviderCatalogItemSchema,
  ProviderConnectionSchema,
  DeploymentTargetSchema,
  RollbackComparisonSchema,
  type GitInstallation,
  type GitRepository,
  type GitBranch,
  type PlatformDeployment,
  type DeploymentEvent,
  type DeploymentStage,
  type DetectionRun,
  type ConfigurationDraft,
  type ConfigurationValidation,
  type ServiceConfiguration,
  type Preview,
  type CustomDomain,
  type ProviderCatalogItem,
  type ProviderConnection,
  type DeploymentTarget,
  type RollbackComparison,
  OrganizationMembershipSchema,
  EffectivePermissionsSchema,
  SecretReferenceSchema,
  type OrganizationMembership,
  type EffectivePermissions,
  type SecretReference,
  type OrganizationRole,
  ApprovalRequestSchema,
  SecurityPolicySchema,
  PolicyExceptionSchema,
  type ApprovalRequest,
  type SecurityPolicy,
  type PolicyException
} from "@saas/types";
import type { ProjectListParams } from "./projects.service";

export interface ControlPlaneService {
  listApprovals(organizationId: string): Promise<{ items: ApprovalRequest[] }>;
  decideApproval(
    organizationId: string,
    id: string,
    decision: "approve" | "reject",
    reason?: string
  ): Promise<ApprovalRequest>;
  listSecurityPolicies(
    organizationId: string,
    targetId?: string
  ): Promise<{ items: SecurityPolicy[] }>;
  listPolicyExceptions(organizationId: string): Promise<{ items: PolicyException[] }>;
  requestPolicyException(
    organizationId: string,
    input: Record<string, unknown>
  ): Promise<PolicyException>;
  listMemberships(organizationId: string): Promise<{ items: OrganizationMembership[] }>;
  inviteMember(
    organizationId: string,
    email: string,
    role: OrganizationRole
  ): Promise<{
    invitation: { id: string; email: string; role: OrganizationRole; expiresAt: string };
    token: string;
  }>;
  updateMembershipRole(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
    version: number
  ): Promise<OrganizationMembership>;
  removeMembership(
    organizationId: string,
    userId: string,
    expectedVersion: number
  ): Promise<OrganizationMembership>;
  getEffectivePermissions(organizationId: string): Promise<EffectivePermissions>;
  listSecretReferences(organizationId: string): Promise<{ items: SecretReference[] }>;
  createSecretReference(
    organizationId: string,
    input: Record<string, unknown>
  ): Promise<SecretReference>;
  secretReferenceAction(
    organizationId: string,
    id: string,
    action: "validate" | "rotate" | "disable" | "revoke",
    input: Record<string, unknown>
  ): Promise<SecretReference>;
  listProviderCatalog(organizationId: string): Promise<{ items: ProviderCatalogItem[] }>;
  listProviderConnections(organizationId: string): Promise<{ items: ProviderConnection[] }>;
  createAwsConnection(
    organizationId: string,
    input: {
      displayName: string;
      providerType: "aws";
      roleArn: string;
      expectedAccountId: string;
      permittedRegions: string[];
    },
    idempotencyKey: string
  ): Promise<{
    connection: ProviderConnection;
    trustPolicy?: Record<string, unknown>;
    created: boolean;
  }>;
  validateProviderConnection(
    organizationId: string,
    connectionId: string,
    expectedVersion: number
  ): Promise<ProviderConnection>;
  providerConnectionLifecycle(
    organizationId: string,
    connectionId: string,
    action: "disable" | "revoke",
    expectedVersion: number
  ): Promise<ProviderConnection>;
  listDeploymentTargets(
    organizationId: string,
    usable?: boolean
  ): Promise<{ items: DeploymentTarget[] }>;
  createKubernetesTarget(
    organizationId: string,
    input: {
      name: string;
      apiServerOrigin: string;
      allowedNamespaces: string[];
      allowedEnvironments: string[];
      authenticationMethod: "oidc" | "workload_identity" | "service_account_token";
      serviceAccountToken?: string;
    },
    idempotencyKey: string
  ): Promise<{ target: DeploymentTarget; created: boolean }>;
  validateDeploymentTarget(
    organizationId: string,
    targetId: string,
    expectedVersion: number
  ): Promise<DeploymentTarget>;
  rotateDeploymentTargetCredential(
    organizationId: string,
    targetId: string,
    serviceAccountToken: string,
    expectedVersion: number
  ): Promise<DeploymentTarget>;
  deploymentTargetLifecycle(
    organizationId: string,
    targetId: string,
    action: "disable" | "revoke",
    expectedVersion: number
  ): Promise<DeploymentTarget>;
  listOrganizations(): Promise<{ items: ControlPlaneOrganization[] }>;
  getOrganization(id: string): Promise<ControlPlaneOrganization>;
  listProjects(organizationId: string, params?: ProjectListParams): Promise<Page<ProjectSummary>>;
  createProject(
    organizationId: string,
    input: { name: string; slug: string; description?: string }
  ): Promise<ProjectSummary>;
  getProject(organizationId: string, id: string): Promise<ProjectDetail>;
  listRepositoryReferences(
    organizationId: string,
    params?: { page?: number; pageSize?: number }
  ): Promise<RepositoryReferencePage>;
  listEnvironmentReferences(
    organizationId: string,
    params?: { page?: number; pageSize?: number }
  ): Promise<EnvironmentReferencePage>;
  beginGitHubInstallation(
    organizationId: string
  ): Promise<{ authorizationUrl: string; expiresInSeconds: number }>;
  completeGitHubInstallation(
    organizationId: string,
    input: { state: string; installationId: string; setupAction?: string }
  ): Promise<GitInstallation>;
  listGitInstallations(organizationId: string): Promise<{ items: GitInstallation[] }>;
  listGitRepositories(
    organizationId: string,
    installationId: string,
    params?: { page?: number; pageSize?: number; search?: string }
  ): Promise<Page<GitRepository>>;
  listGitBranches(
    organizationId: string,
    installationId: string,
    repositoryId: string
  ): Promise<{ items: GitBranch[] }>;
  connectGitRepository(
    organizationId: string,
    projectId: string,
    input: { installationId: string; repositoryId: string; selectedBranch: string }
  ): Promise<RepositoryReference>;
  disconnectGitInstallation(organizationId: string, installationId: string): Promise<void>;
  listPlatformDeployments(
    organizationId: string,
    params?: { page?: number; pageSize?: number; state?: string; projectId?: string }
  ): Promise<Page<PlatformDeployment>>;
  getPlatformDeployment(organizationId: string, deploymentId: string): Promise<PlatformDeployment>;
  listDeploymentEvents(
    organizationId: string,
    deploymentId: string,
    after?: number
  ): Promise<{ items: DeploymentEvent[] }>;
  listDeploymentStages(
    organizationId: string,
    deploymentId: string
  ): Promise<{ items: DeploymentStage[] }>;
  cancelPlatformDeployment(
    organizationId: string,
    deploymentId: string,
    reason?: string
  ): Promise<PlatformDeployment>;
  retryPlatformDeployment(
    organizationId: string,
    deploymentId: string,
    idempotencyKey: string
  ): Promise<PlatformDeployment>;
  listRollbackTargets(
    organizationId: string,
    deploymentId: string
  ): Promise<{ items: PlatformDeployment[] }>;
  getRollbackComparison(
    organizationId: string,
    deploymentId: string,
    targetDeploymentId: string
  ): Promise<RollbackComparison>;
  approveRollback(
    organizationId: string,
    deploymentId: string,
    targetDeploymentId: string,
    justification: string
  ): Promise<{ id: string; status: string }>;
  rollbackDeployment(
    organizationId: string,
    deploymentId: string,
    input: {
      targetDeploymentId: string;
      reason: string;
      approvalId?: string;
      emergencyOverride?: boolean;
      overrideJustification?: string;
      expectedStateVersion: number;
    },
    idempotencyKey: string
  ): Promise<PlatformDeployment>;
  listPreviews(organizationId: string): Promise<{ items: Preview[] }>;
  getPreview(organizationId: string, previewId: string): Promise<Preview>;
  createPreviewRoute(
    organizationId: string,
    previewId: string,
    backendPort: number
  ): Promise<Preview>;
  verifyPreview(organizationId: string, previewId: string): Promise<Preview>;
  removePreview(organizationId: string, previewId: string): Promise<unknown>;
  listCustomDomains(organizationId: string): Promise<{ items: CustomDomain[] }>;
  getBillingOverview(organizationId: string): Promise<{
    plan: null | {
      planId: string;
      planVersion: number;
      effectiveAt: string;
      entitlements: Record<string, number>;
    };
    meters: Array<{
      id: string;
      version: number;
      unit: string;
      inclusion: string;
      exclusion: string;
    }>;
    currentUsage: Record<string, number>;
    dataState: string;
    paymentCollection: string;
  }>;
  requestCustomDomain(
    organizationId: string,
    input: { projectId: string; serviceId: string; hostname: string }
  ): Promise<{
    domain: CustomDomain;
    instructions: { type: string; name: string; value: string; expiresAt: string };
  }>;
  verifyCustomDomain(
    organizationId: string,
    domainId: string,
    token: string
  ): Promise<CustomDomain>;
  removeCustomDomain(organizationId: string, domainId: string): Promise<CustomDomain>;
  detectServices(
    organizationId: string,
    projectId: string,
    repositoryId: string,
    commitSha: string,
    idempotencyKey: string
  ): Promise<DetectionRun>;
  getConfigurationDraft(
    organizationId: string,
    projectId: string
  ): Promise<{ draft: ConfigurationDraft | null }>;
  saveConfigurationDraft(
    organizationId: string,
    projectId: string,
    input: {
      repositoryId: string;
      commitSha: string;
      candidateId: string;
      configuration: ServiceConfiguration;
      version: number;
    }
  ): Promise<ConfigurationDraft>;
  validateServiceConfiguration(
    organizationId: string,
    projectId: string,
    configuration: ServiceConfiguration
  ): Promise<ConfigurationValidation>;
  saveServiceConfiguration(
    organizationId: string,
    projectId: string,
    input: {
      detectionId: string;
      repositoryId: string;
      commitSha: string;
      candidateId: string;
      configuration: ServiceConfiguration;
      confirmConflicts: boolean;
    }
  ): Promise<{ id: string; generatedServiceYaml: string }>;
}

const projectPageSchema = PageSchema(ProjectSummarySchema);

export function createControlPlaneService(
  http: HttpClient,
  config: AppConfig
): ControlPlaneService {
  const endpoints = config.controlPlane;
  const withOrganization = (template: string, organizationId: string) =>
    resolveUrl(
      config.api.baseUrl,
      template.replace("{organizationId}", encodeURIComponent(organizationId))
    );

  return {
    listApprovals: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/approvals"
        ),
        { schema: z.object({ items: z.array(ApprovalRequestSchema) }) }
      ),
    decideApproval: (organizationId, approvalId, decision, reason) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/approvals/${encodeURIComponent(approvalId)}/${decision}`
        ),
        { reason },
        { schema: ApprovalRequestSchema }
      ),
    listSecurityPolicies: (organizationId, targetId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/security-policies"
        ),
        { params: { targetId }, schema: z.object({ items: z.array(SecurityPolicySchema) }) }
      ),
    listPolicyExceptions: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/policy-exceptions"
        ),
        { schema: z.object({ items: z.array(PolicyExceptionSchema) }) }
      ),
    requestPolicyException: (organizationId, input) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/policy-exceptions"
        ),
        input,
        { schema: PolicyExceptionSchema }
      ),
    listMemberships: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/memberships"
        ),
        { schema: z.object({ items: z.array(OrganizationMembershipSchema) }) }
      ),
    inviteMember: (organizationId, email, role) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/invitations"
        ),
        { email, role },
        {
          schema: z.object({
            invitation: z.object({
              id: z.string(),
              email: z.string(),
              role: z.enum([
                "owner",
                "admin",
                "security_admin",
                "platform_engineer",
                "developer",
                "operator",
                "approver",
                "auditor",
                "viewer"
              ]),
              expiresAt: z.string()
            }),
            token: z.string()
          })
        }
      ),
    updateMembershipRole: (organizationId, userId, role, version) =>
      http.patch(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/memberships/${encodeURIComponent(userId)}`
        ),
        { role, version },
        { schema: OrganizationMembershipSchema }
      ),
    removeMembership: (organizationId, userId, expectedVersion) =>
      http.delete(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/memberships/${encodeURIComponent(userId)}`
        ),
        { data: { expectedVersion }, schema: OrganizationMembershipSchema }
      ),
    getEffectivePermissions: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/effective-permissions"
        ),
        { schema: EffectivePermissionsSchema }
      ),
    listSecretReferences: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/secret-references"
        ),
        { schema: z.object({ items: z.array(SecretReferenceSchema) }) }
      ),
    createSecretReference: (organizationId, input) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/secret-references"
        ),
        input,
        { schema: SecretReferenceSchema }
      ),
    secretReferenceAction: (organizationId, id, action, input) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/secret-references/${encodeURIComponent(id)}/${action}`
        ),
        input,
        { schema: SecretReferenceSchema }
      ),
    listProviderCatalog: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/providers"
        ),
        { schema: z.object({ items: z.array(ProviderCatalogItemSchema) }) }
      ),
    listProviderConnections: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/provider-connections"
        ),
        { schema: z.object({ items: z.array(ProviderConnectionSchema) }) }
      ),
    createAwsConnection: (organizationId, input, idempotencyKey) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/provider-connections"
        ),
        input,
        {
          schema: z.object({
            connection: ProviderConnectionSchema,
            trustPolicy: z.record(z.unknown()).optional(),
            created: z.boolean()
          }),
          headers: { "Idempotency-Key": idempotencyKey }
        }
      ),
    validateProviderConnection: (organizationId, connectionId, expectedVersion) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/provider-connections/${encodeURIComponent(connectionId)}/validate`
        ),
        { expectedVersion },
        { schema: ProviderConnectionSchema }
      ),
    providerConnectionLifecycle: (organizationId, connectionId, action, expectedVersion) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/provider-connections/${encodeURIComponent(connectionId)}/${action}`
        ),
        { expectedVersion },
        { schema: ProviderConnectionSchema }
      ),
    listDeploymentTargets: (organizationId, usable = false) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/deployment-targets"
        ),
        { params: { usable }, schema: z.object({ items: z.array(DeploymentTargetSchema) }) }
      ),
    createKubernetesTarget: (organizationId, input, idempotencyKey) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/deployment-targets"
        ),
        input,
        {
          schema: z.object({ target: DeploymentTargetSchema, created: z.boolean() }),
          headers: { "Idempotency-Key": idempotencyKey }
        }
      ),
    validateDeploymentTarget: (organizationId, targetId, expectedVersion) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployment-targets/${encodeURIComponent(targetId)}/validate`
        ),
        { expectedVersion },
        { schema: DeploymentTargetSchema }
      ),
    rotateDeploymentTargetCredential: (
      organizationId,
      targetId,
      serviceAccountToken,
      expectedVersion
    ) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployment-targets/${encodeURIComponent(targetId)}/rotate-credential`
        ),
        { serviceAccountToken, expectedVersion },
        { schema: DeploymentTargetSchema }
      ),
    deploymentTargetLifecycle: (organizationId, targetId, action, expectedVersion) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployment-targets/${encodeURIComponent(targetId)}/${action}`
        ),
        { expectedVersion },
        { schema: DeploymentTargetSchema }
      ),
    listOrganizations: () =>
      http.get<{ items: ControlPlaneOrganization[] }>(
        resolveUrl(config.api.baseUrl, endpoints.organizations),
        {
          schema: OrganizationListSchema
        }
      ),
    getOrganization: (id) =>
      http.get<ControlPlaneOrganization>(
        resolveUrl(config.api.baseUrl, `${endpoints.organizations}/${encodeURIComponent(id)}`),
        {
          schema: ControlPlaneOrganizationSchema
        }
      ),
    listProjects: (organizationId, params) =>
      http.get<Page<ProjectSummary>>(withOrganization(endpoints.projects, organizationId), {
        params,
        schema: projectPageSchema
      }),
    createProject: (organizationId, input) =>
      http.post<ProjectSummary>(withOrganization(endpoints.projects, organizationId), input, {
        schema: ProjectSummarySchema
      }),
    getProject: (organizationId, id) =>
      http.get<ProjectDetail>(
        withOrganization(endpoints.project.replace("{id}", encodeURIComponent(id)), organizationId),
        { schema: ProjectDetailSchema }
      ),
    listRepositoryReferences: (organizationId, params) =>
      http.get<RepositoryReferencePage>(withOrganization(endpoints.repositories, organizationId), {
        params,
        schema: RepositoryReferencePageSchema
      }),
    listEnvironmentReferences: (organizationId, params) =>
      http.get<EnvironmentReferencePage>(withOrganization(endpoints.environments, organizationId), {
        params,
        schema: EnvironmentReferencePageSchema
      }),
    beginGitHubInstallation: (organizationId) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/git/installations/authorize"
        )
      ),
    completeGitHubInstallation: (organizationId, input) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/git/installations/callback"
        ),
        {
          params: {
            state: input.state,
            installation_id: input.installationId,
            setup_action: input.setupAction
          },
          schema: GitInstallationSchema
        }
      ),
    listGitInstallations: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/git/installations"
        ),
        { schema: z.object({ items: z.array(GitInstallationSchema) }) }
      ),
    listGitRepositories: (organizationId, installationId, params) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/git/installations/${encodeURIComponent(installationId)}/repositories`
        ),
        { params, schema: PageSchema(GitRepositorySchema) }
      ),
    listGitBranches: (organizationId, installationId, repositoryId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/git/installations/${encodeURIComponent(installationId)}/repositories/${encodeURIComponent(repositoryId)}/branches`
        ),
        { schema: z.object({ items: z.array(GitBranchSchema) }) }
      ),
    connectGitRepository: (organizationId, projectId, input) =>
      http.post(
        withOrganization(endpoints.projects, organizationId) +
          `/${encodeURIComponent(projectId)}/repository`,
        input,
        { schema: RepositoryReferenceSchema }
      ),
    disconnectGitInstallation: (organizationId, installationId) =>
      http.delete(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/git/installations/${encodeURIComponent(installationId)}`
        )
      ),
    listPlatformDeployments: (organizationId, params) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/deployments"
        ),
        { params, schema: PageSchema(PlatformDeploymentSchema) }
      ),
    getPlatformDeployment: (organizationId, deploymentId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployments/${encodeURIComponent(deploymentId)}`
        ),
        { schema: PlatformDeploymentSchema }
      ),
    listDeploymentEvents: (organizationId, deploymentId, after = 0) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployments/${encodeURIComponent(deploymentId)}/events`
        ),
        { params: { after }, schema: z.object({ items: z.array(DeploymentEventSchema) }) }
      ),
    listDeploymentStages: (organizationId, deploymentId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployments/${encodeURIComponent(deploymentId)}/stages`
        ),
        { schema: z.object({ items: z.array(DeploymentStageSchema) }) }
      ),
    cancelPlatformDeployment: (organizationId, deploymentId, reason) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployments/${encodeURIComponent(deploymentId)}/cancel`
        ),
        { reason },
        { schema: PlatformDeploymentSchema }
      ),
    retryPlatformDeployment: (organizationId, deploymentId, idempotencyKey) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployments/${encodeURIComponent(deploymentId)}/retry`
        ),
        {},
        { schema: PlatformDeploymentSchema, headers: { "Idempotency-Key": idempotencyKey } }
      ),
    listRollbackTargets: (organizationId, deploymentId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployments/${encodeURIComponent(deploymentId)}/rollback-targets`
        ),
        { schema: z.object({ items: z.array(PlatformDeploymentSchema) }) }
      ),
    getRollbackComparison: (organizationId, deploymentId, targetDeploymentId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployments/${encodeURIComponent(deploymentId)}/rollback-comparison`
        ),
        { params: { targetDeploymentId }, schema: RollbackComparisonSchema }
      ),
    approveRollback: (organizationId, deploymentId, targetDeploymentId, justification) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployments/${encodeURIComponent(deploymentId)}/rollback-approvals`
        ),
        { targetDeploymentId, justification },
        { schema: z.object({ id: z.string(), status: z.string() }) }
      ),
    rollbackDeployment: (organizationId, deploymentId, input, idempotencyKey) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/deployments/${encodeURIComponent(deploymentId)}/rollback`
        ),
        input,
        { schema: PlatformDeploymentSchema, headers: { "Idempotency-Key": idempotencyKey } }
      ),
    listPreviews: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/previews"
        ),
        { schema: z.object({ items: z.array(PreviewSchema) }) }
      ),
    getPreview: (organizationId, previewId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/previews/${encodeURIComponent(previewId)}`
        ),
        { schema: PreviewSchema }
      ),
    createPreviewRoute: (organizationId, previewId, backendPort) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/previews/${encodeURIComponent(previewId)}/route`
        ),
        { backendPort },
        { schema: PreviewSchema }
      ),
    verifyPreview: (organizationId, previewId) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/previews/${encodeURIComponent(previewId)}/verify`
        ),
        {},
        { schema: PreviewSchema }
      ),
    removePreview: (organizationId, previewId) =>
      http.delete(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/previews/${encodeURIComponent(previewId)}`
        )
      ),
    listCustomDomains: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/domains"
        ),
        { schema: z.object({ items: z.array(CustomDomainSchema) }) }
      ),
    getBillingOverview: (organizationId) =>
      http.get(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/billing/overview"
        ),
        {
          schema: z.object({
            plan: z
              .object({
                planId: z.string(),
                planVersion: z.number(),
                effectiveAt: z.string(),
                entitlements: z.record(z.number())
              })
              .nullable(),
            meters: z.array(
              z
                .object({
                  id: z.string(),
                  version: z.number(),
                  unit: z.string(),
                  inclusion: z.string(),
                  exclusion: z.string()
                })
                .passthrough()
            ),
            currentUsage: z.record(z.number()),
            dataState: z.string(),
            paymentCollection: z.string()
          })
        }
      ),
    requestCustomDomain: (organizationId, input) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          "/domains"
        ),
        input,
        {
          schema: z.object({
            domain: CustomDomainSchema,
            instructions: z.object({
              type: z.string(),
              name: z.string(),
              value: z.string(),
              expiresAt: z.string()
            })
          })
        }
      ),
    verifyCustomDomain: (organizationId, domainId, token) =>
      http.post(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/domains/${encodeURIComponent(domainId)}/verify`
        ),
        { token },
        { schema: CustomDomainSchema }
      ),
    removeCustomDomain: (organizationId, domainId) =>
      http.delete(
        withOrganization(endpoints.repositories, organizationId).replace(
          /\/repositories$/,
          `/domains/${encodeURIComponent(domainId)}`
        ),
        { schema: CustomDomainSchema }
      ),
    detectServices: (organizationId, projectId, repositoryId, commitSha, idempotencyKey) =>
      http.post(
        withOrganization(endpoints.projects, organizationId) +
          `/${encodeURIComponent(projectId)}/repositories/${encodeURIComponent(repositoryId)}/detections`,
        { commitSha },
        { schema: DetectionRunSchema, headers: { "Idempotency-Key": idempotencyKey } }
      ),
    getConfigurationDraft: (organizationId, projectId) =>
      http.get(
        withOrganization(endpoints.projects, organizationId) +
          `/${encodeURIComponent(projectId)}/service-configuration/draft`,
        { schema: z.object({ draft: ConfigurationDraftSchema.nullable() }) }
      ),
    saveConfigurationDraft: (organizationId, projectId, input) =>
      http.put(
        withOrganization(endpoints.projects, organizationId) +
          `/${encodeURIComponent(projectId)}/service-configuration/draft`,
        input,
        { schema: ConfigurationDraftSchema }
      ),
    validateServiceConfiguration: (organizationId, projectId, configuration) =>
      http.post(
        withOrganization(endpoints.projects, organizationId) +
          `/${encodeURIComponent(projectId)}/service-configuration/validate`,
        { configuration },
        { schema: ConfigurationValidationSchema }
      ),
    saveServiceConfiguration: (organizationId, projectId, input) =>
      http.post(
        withOrganization(endpoints.projects, organizationId) +
          `/${encodeURIComponent(projectId)}/service-configurations`,
        input,
        { schema: z.object({ id: z.string(), generatedServiceYaml: z.string() }) }
      )
  };
}
