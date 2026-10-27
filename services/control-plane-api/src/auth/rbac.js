const { ControlPlaneError } = require("../errors");

const ROLES = Object.freeze([
  "owner",
  "admin",
  "security_admin",
  "platform_engineer",
  "developer",
  "operator",
  "approver",
  "auditor",
  "viewer",
]);
const PERMISSIONS = Object.freeze({
  ORGANIZATION_READ: "organization:read",
  ORGANIZATION_ADMIN: "organization:admin",
  ORGANIZATION_OWNERSHIP: "organization:ownership",
  MEMBERSHIP_READ: "membership:read",
  MEMBERSHIP_INVITE: "membership:invite",
  MEMBERSHIP_ASSIGN: "membership:assign",
  MEMBERSHIP_REMOVE: "membership:remove",
  POLICY_READ: "policy:read",
  SECURITY_POLICY_MANAGE: "policy:security:manage",
  REPOSITORY_MANAGE: "repository:manage",
  PROJECT_READ: "project:read",
  PROJECT_MANAGE: "project:manage",
  ENVIRONMENT_MANAGE: "environment:manage",
  CLOUD_CONNECTION_READ: "cloud_connection:read",
  CLOUD_CONNECTION_MANAGE: "cloud_connection:manage",
  DEPLOYMENT_TARGET_READ: "deployment_target:read",
  DEPLOYMENT_TARGET_MANAGE: "deployment_target:manage",
  DEPLOYMENT_READ: "deployment:read",
  DEPLOYMENT_CREATE: "deployment:create",
  DEPLOYMENT_PRODUCTION: "deployment:production",
  ROLLBACK: "deployment:rollback",
  EMERGENCY_ROLLBACK: "deployment:rollback:emergency",
  APPROVAL_DECIDE: "approval:decide",
  APPROVAL_REQUEST: "approval:request",
  APPROVAL_POLICY_MANAGE: "approval_policy:manage",
  APPROVAL_OVERRIDE: "approval:override",
  POLICY_EXCEPTION_REQUEST: "policy_exception:request",
  POLICY_EXCEPTION_APPROVE: "policy_exception:approve",
  DRIFT_READ: "drift:read",
  DRIFT_RUN: "drift:run",
  SECRET_READ_METADATA: "secret:metadata:read",
  SECRET_MANAGE: "secret:manage",
  SECRET_ATTACH: "secret:attach",
  SECRET_USE: "secret:use",
  DOMAIN_READ: "domain:read",
  DOMAIN_MANAGE: "domain:manage",
  AUDIT_READ: "audit:read",
  AUDIT_EXPORT: "audit:export",
  AUDIT_VERIFY: "audit:verify",
  AUDIT_RETENTION_MANAGE: "audit:retention:manage",
  PLATFORM_OPERATOR_ACCESS: "audit:platform_operator_access",
  OBSERVE: "observe",
  BILLING_READ: "billing:read",
  BILLING_MANAGE: "billing:manage",
});
const P = PERMISSIONS;
const ROLE_PERMISSIONS = Object.freeze({
  owner: new Set(Object.values(P)),
  admin: new Set([
    P.ORGANIZATION_READ,
    P.ORGANIZATION_ADMIN,
    P.MEMBERSHIP_READ,
    P.MEMBERSHIP_INVITE,
    P.MEMBERSHIP_ASSIGN,
    P.MEMBERSHIP_REMOVE,
    P.POLICY_READ,
    P.REPOSITORY_MANAGE,
    P.PROJECT_READ,
    P.PROJECT_MANAGE,
    P.ENVIRONMENT_MANAGE,
    P.CLOUD_CONNECTION_READ,
    P.DEPLOYMENT_TARGET_READ,
    P.DEPLOYMENT_READ,
    P.DEPLOYMENT_CREATE,
    P.DEPLOYMENT_PRODUCTION,
    P.ROLLBACK,
    P.APPROVAL_REQUEST,
    P.SECRET_READ_METADATA,
    P.SECRET_ATTACH,
    P.DOMAIN_READ,
    P.DOMAIN_MANAGE,
    P.AUDIT_READ,
    P.AUDIT_EXPORT,
    P.OBSERVE,
    P.BILLING_READ,
  ]),
  security_admin: new Set([
    P.ORGANIZATION_READ,
    P.MEMBERSHIP_READ,
    P.POLICY_READ,
    P.SECURITY_POLICY_MANAGE,
    P.APPROVAL_POLICY_MANAGE,
    P.POLICY_EXCEPTION_REQUEST,
    P.POLICY_EXCEPTION_APPROVE,
    P.DRIFT_READ,
    P.DRIFT_RUN,
    P.CLOUD_CONNECTION_READ,
    P.CLOUD_CONNECTION_MANAGE,
    P.DEPLOYMENT_TARGET_READ,
    P.SECRET_READ_METADATA,
    P.SECRET_MANAGE,
    P.SECRET_ATTACH,
    P.SECRET_USE,
    P.DOMAIN_READ,
    P.AUDIT_READ,
    P.AUDIT_EXPORT,
    P.AUDIT_VERIFY,
    P.OBSERVE,
    P.BILLING_READ,
    P.BILLING_MANAGE,
  ]),
  platform_engineer: new Set([
    P.ORGANIZATION_READ,
    P.REPOSITORY_MANAGE,
    P.PROJECT_READ,
    P.PROJECT_MANAGE,
    P.ENVIRONMENT_MANAGE,
    P.CLOUD_CONNECTION_READ,
    P.DEPLOYMENT_TARGET_READ,
    P.DEPLOYMENT_TARGET_MANAGE,
    P.DEPLOYMENT_READ,
    P.DEPLOYMENT_CREATE,
    P.DEPLOYMENT_PRODUCTION,
    P.ROLLBACK,
    P.APPROVAL_REQUEST,
    P.POLICY_EXCEPTION_REQUEST,
    P.DRIFT_READ,
    P.DRIFT_RUN,
    P.SECRET_READ_METADATA,
    P.SECRET_ATTACH,
    P.SECRET_USE,
    P.DOMAIN_READ,
    P.DOMAIN_MANAGE,
    P.OBSERVE,
    P.BILLING_READ,
  ]),
  developer: new Set([
    P.ORGANIZATION_READ,
    P.REPOSITORY_MANAGE,
    P.PROJECT_READ,
    P.PROJECT_MANAGE,
    P.ENVIRONMENT_MANAGE,
    P.DEPLOYMENT_READ,
    P.DEPLOYMENT_CREATE,
    P.APPROVAL_REQUEST,
    P.SECRET_READ_METADATA,
    P.SECRET_ATTACH,
    P.DOMAIN_READ,
    P.OBSERVE,
    P.BILLING_READ,
  ]),
  operator: new Set([
    P.ORGANIZATION_READ,
    P.PROJECT_READ,
    P.DEPLOYMENT_TARGET_READ,
    P.DEPLOYMENT_READ,
    P.DEPLOYMENT_CREATE,
    P.DEPLOYMENT_PRODUCTION,
    P.ROLLBACK,
    P.APPROVAL_REQUEST,
    P.DRIFT_READ,
    P.DRIFT_RUN,
    P.SECRET_READ_METADATA,
    P.SECRET_USE,
    P.DOMAIN_READ,
    P.OBSERVE,
    P.BILLING_READ,
  ]),
  approver: new Set([
    P.ORGANIZATION_READ,
    P.PROJECT_READ,
    P.POLICY_READ,
    P.DEPLOYMENT_READ,
    P.APPROVAL_DECIDE,
    P.POLICY_EXCEPTION_APPROVE,
    P.DRIFT_READ,
    P.SECRET_READ_METADATA,
    P.OBSERVE,
    P.BILLING_READ,
  ]),
  auditor: new Set([
    P.ORGANIZATION_READ,
    P.MEMBERSHIP_READ,
    P.POLICY_READ,
    P.PROJECT_READ,
    P.CLOUD_CONNECTION_READ,
    P.DEPLOYMENT_TARGET_READ,
    P.DEPLOYMENT_READ,
    P.SECRET_READ_METADATA,
    P.DOMAIN_READ,
    P.AUDIT_READ,
    P.AUDIT_EXPORT,
    P.AUDIT_VERIFY,
    P.DRIFT_READ,
    P.OBSERVE,
    P.BILLING_READ,
  ]),
  viewer: new Set([
    P.ORGANIZATION_READ,
    P.PROJECT_READ,
    P.DEPLOYMENT_READ,
    P.DOMAIN_READ,
    P.OBSERVE,
  ]),
});
const RESERVED_OWNERSHIP_ACTIONS = new Set([P.ORGANIZATION_OWNERSHIP]);
const SCOPE_TYPES = Object.freeze([
  "organization",
  "project",
  "environment",
  "cloud_connection",
  "deployment_target",
  "deployment",
  "secret_reference",
  "domain",
  "policy",
]);
function hasPermission(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role]?.has(permission));
}
class PolicyDecisionPoint {
  constructor({ version = 1 } = {}) {
    this.version = version;
  }
  evaluate({ actor, action, resource, scope, context = {} }) {
    const deny = (reasonCode) =>
      Object.freeze({
        decision: "deny",
        allowed: false,
        reasonCode,
        matchedRole: null,
        authorizationVersion: this.version,
      });
    if (
      !actor?.id ||
      !action ||
      !scope?.type ||
      !SCOPE_TYPES.includes(scope.type)
    )
      return deny("AUTHORIZATION_INPUT_INVALID");
    const membership = actor.membership;
    if (!membership || membership.status !== "active")
      return deny("MEMBERSHIP_INACTIVE");
    if (membership.organizationId !== scope.organizationId)
      return deny("ORGANIZATION_SCOPE_MISMATCH");
    if (
      context.requiredMembershipVersion != null &&
      membership.authorizationVersion !== context.requiredMembershipVersion
    )
      return deny("AUTHORIZATION_VERSION_STALE");
    if (
      resource?.organizationId &&
      resource.organizationId !== scope.organizationId
    )
      return deny("RESOURCE_SCOPE_MISMATCH");
    const assignments = membership.assignments?.length
      ? membership.assignments
      : [
          {
            role: membership.role,
            scopeType: "organization",
            scopeId: scope.organizationId,
          },
        ];
    for (const a of assignments) {
      if (!hasPermission(a.role, action)) continue;
      const exact = a.scopeType === scope.type && a.scopeId === scope.id;
      const orgInherited =
        a.scopeType === "organization" &&
        a.scopeId === scope.organizationId &&
        context.allowOrganizationInheritance !== false;
      const projectInherited =
        a.scopeType === "project" &&
        a.scopeId === scope.projectId &&
        ["environment", "deployment", "secret_reference", "domain"].includes(
          scope.type,
        );
      if (exact || orgInherited || projectInherited)
        return Object.freeze({
          decision: "allow",
          allowed: true,
          reasonCode: "ROLE_PERMISSION_MATCH",
          matchedRole: a.role,
          authorizationVersion: this.version,
        });
    }
    return deny("NO_MATCHING_POLICY");
  }
  require(input) {
    const d = this.evaluate(input);
    if (!d.allowed)
      throw new ControlPlaneError(403, d.reasonCode, "Permission denied");
    return d;
  }
}
function requirePermission(membership, permission) {
  new PolicyDecisionPoint().require({
    actor: { id: membership?.userId, membership },
    action: permission,
    scope: {
      type: "organization",
      id: membership?.organizationId,
      organizationId: membership?.organizationId,
    },
  });
  return membership;
}
function assertRole(role) {
  if (!ROLES.includes(role))
    throw new ControlPlaneError(400, "INVALID_ROLE", "Role is invalid");
  return role;
}
module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  RESERVED_OWNERSHIP_ACTIONS,
  SCOPE_TYPES,
  PolicyDecisionPoint,
  hasPermission,
  requirePermission,
  assertRole,
};
