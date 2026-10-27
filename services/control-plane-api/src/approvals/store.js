const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const { PERMISSIONS } = require("../auth/rbac");
const { canonicalize, snapshotDigest } = require("./canonical");

const STATES = Object.freeze([
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
  "failed",
]);
const TRANSITIONS = Object.freeze({
  pending: [
    "approved",
    "rejected",
    "expired",
    "cancelled",
    "invalidated",
    "overridden",
  ],
  approved: ["executing", "invalidated", "expired"],
  overridden: ["executing", "invalidated", "expired"],
  executing: ["consumed", "failed"],
  not_required: ["executing"],
  rejected: [],
  expired: [],
  cancelled: [],
  invalidated: [],
  consumed: [],
  failed: [],
});
const PROTECTED_ACTIONS = new Set([
  "deployment.production",
  "rollback.production",
  "cloud_connection.material_change",
  "deployment_target.material_change",
  "credential.rotate",
  "credential.revoke",
  "secret_reference.production_change",
  "rbac.privileged_change",
  "approval_policy.change",
  "kubernetes_policy.change",
  "policy_exception.create",
  "emergency.override",
]);
const iso = (date = new Date()) => date.toISOString();

class MemoryApprovalStore {
  listPolicies(actor, org) {
    this.repository.requireAccess(actor, org, PERMISSIONS.POLICY_READ);
    return [...this.policies.values()].filter(x => x.organizationId === org);
  }
  constructor(
    repository,
    { clock = () => new Date(), eventSink = () => {} } = {},
  ) {
    this.repository = repository;
    this.clock = clock;
    this.eventSink = eventSink;
    this.policies = new Map();
    this.requests = new Map();
    this.idempotency = new Map();
    this.executionKeys = new Set();
  }
  _membership(userId, organizationId) {
    const m = this.repository.memberships?.get(`${userId}:${organizationId}`);
    if (!m || m.status !== "active")
      throw new ControlPlaneError(
        403,
        "MEMBERSHIP_INACTIVE",
        "Active membership is required",
      );
    return m;
  }
  _emit(action, item, actorId, metadata = {}) {
    return this.eventSink({
      action,
      organizationId: item.organizationId,
      actorUserId: actorId,
      resourceType: "approval",
      resourceId: item.id,
      idempotencyKey: `${action}:${item.id}:${item.version}:${actorId || 'system'}`,
      metadata,
    });
  }
  _eligibleMembers(organizationId, policy) {
    return [...(this.repository.memberships?.values() || [])].filter(
      (m) =>
        m.organizationId === organizationId &&
        m.status === "active" &&
        (policy.eligibleRoles.includes(m.role) ||
          policy.eligibleUserIds.includes(m.userId)),
    );
  }
  assertApproverChangeSafe(organizationId, userId, replacementRole = null) {
    const pending = [...this.requests.values()].filter(
      (x) => x.organizationId === organizationId && x.state === "pending",
    );
    for (const request of pending) {
      const policy = [...this.policies.values()].find(
        (x) => x.id === request.policyId && x.version === request.policyVersion,
      );
      if (!policy) continue;
      const eligible = this._eligibleMembers(organizationId, policy).filter(
        (m) =>
          m.userId !== userId ||
          (replacementRole && policy.eligibleRoles.includes(replacementRole)),
      );
      if (eligible.length < policy.requiredCount)
        throw new ControlPlaneError(
          409,
          "FINAL_ELIGIBLE_APPROVER_REQUIRED",
          "Membership change would make a pending approval unsatisfiable",
        );
    }
  }
  validatePolicy(organizationId, input) {
    if (!PROTECTED_ACTIONS.has(input.action))
      throw new ControlPlaneError(
        400,
        "APPROVAL_ACTION_INVALID",
        "Approval action is invalid",
      );
    const requiredCount = Number(input.requiredCount || 1),
      eligibleRoles = [...new Set(input.eligibleRoles || ["approver"])],
      eligibleUserIds = [...new Set(input.eligibleUserIds || [])];
    if (
      !Number.isInteger(requiredCount) ||
      requiredCount < 1 ||
      requiredCount > 10
    )
      throw new ControlPlaneError(
        400,
        "APPROVAL_COUNT_INVALID",
        "Required approval count is invalid",
      );
    if (
      input.action === "approval_policy.change" &&
      !eligibleRoles.length &&
      !eligibleUserIds.length
    )
      throw new ControlPlaneError(
        409,
        "APPROVAL_POLICY_RECURSIVE",
        "Policy cannot require an impossible approval of itself",
      );
    const candidate = {
      ...input,
      requiredCount,
      eligibleRoles,
      eligibleUserIds,
    };
    if (this._eligibleMembers(organizationId, candidate).length < requiredCount)
      throw new ControlPlaneError(
        409,
        "APPROVAL_POLICY_UNSATISFIABLE",
        "Policy has too few currently eligible approvers",
      );
    return candidate;
  }
  setPolicy(actorId, organizationId, input, expectedVersion = null) {
    this.repository.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.APPROVAL_POLICY_MANAGE,
    );
    const c = this.validatePolicy(organizationId, input),
      key = `${organizationId}:${input.scopeType || "organization"}:${input.scopeId || organizationId}:${input.action}`,
      old = this.policies.get(key);
    if (old && expectedVersion !== old.version)
      throw new ControlPlaneError(
        409,
        "POLICY_VERSION_CONFLICT",
        "Approval policy changed concurrently",
      );
    const item = {
      id: old?.id || crypto.randomUUID(),
      organizationId,
      scopeType: input.scopeType || "organization",
      scopeId: input.scopeId || organizationId,
      projectId: input.projectId || null,
      environment: input.environment || null,
      resourceType: input.resourceType || null,
      riskLevel: input.riskLevel || "high",
      action: input.action,
      requiredCount: c.requiredCount,
      eligibleRoles: c.eligibleRoles,
      eligibleUserIds: c.eligibleUserIds,
      separationOfDuties: input.separationOfDuties !== false,
      expiresInSeconds: Math.min(
        Math.max(input.expiresInSeconds || 3600, 60),
        86400,
      ),
      enabled: input.enabled !== false,
      version: (old?.version || 0) + 1,
      updatedAt: iso(this.clock()),
    };
    this.policies.set(key, item);
    return item;
  }
  matchingPolicy(organizationId, c) {
    return (
      [...this.policies.values()]
        .filter(
          (p) =>
            p.organizationId === organizationId &&
            p.enabled &&
            p.action === c.action &&
            (!p.projectId || p.projectId === c.projectId) &&
            (!p.environment || p.environment === c.environment) &&
            (!p.resourceType || p.resourceType === c.resourceType),
        )
        .sort(
          (a, b) =>
            Number(Boolean(b.environment)) +
            Number(Boolean(b.projectId)) -
            (Number(Boolean(a.environment)) + Number(Boolean(a.projectId))),
        )[0] || null
    );
  }
  request(actorId, organizationId, context, snapshot, idempotencyKey) {
    this.repository.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.APPROVAL_REQUEST,
    );
    const policy = this.matchingPolicy(organizationId, context);
    if (!policy) return { state: "not_required", approval: null };
    const idem = `${organizationId}:${idempotencyKey}`;
    if (this.idempotency.has(idem)) {
      const a = this.requests.get(this.idempotency.get(idem));
      return { state: a.state, approval: a };
    }
    const safe = canonicalize(snapshot),
      created = this.clock(),
      item = {
        id: crypto.randomUUID(),
        organizationId,
        projectId: context.projectId || null,
        environment: context.environment || null,
        resourceType: context.resourceType,
        resourceId: context.resourceId || null,
        action: context.action,
        riskLevel: context.riskLevel || policy.riskLevel,
        requesterId: actorId,
        policyId: policy.id,
        policyVersion: policy.version,
        resourceVersion: context.resourceVersion || null,
        snapshot: safe,
        snapshotDigest: snapshotDigest(safe),
        state: "pending",
        requiredCount: policy.requiredCount,
        eligibleRoles: policy.eligibleRoles,
        eligibleUserIds: policy.eligibleUserIds,
        separationOfDuties: policy.separationOfDuties,
        approvals: [],
        rejectionReason: null,
        createdAt: iso(created),
        expiresAt: iso(
          new Date(created.getTime() + policy.expiresInSeconds * 1000),
        ),
        version: 1,
      };
    this.requests.set(item.id, item);
    this.idempotency.set(idem, item.id);
    this._emit("approval.requested", item, actorId, {
      action: item.action,
      snapshotDigest: item.snapshotDigest,
    });
    return { state: "pending", approval: item };
  }
  get(actorId, organizationId, id, permission = PERMISSIONS.POLICY_READ) {
    this.repository.requireAccess(actorId, organizationId, permission);
    const x = this.requests.get(id);
    if (!x || x.organizationId !== organizationId)
      throw new ControlPlaneError(
        404,
        "APPROVAL_NOT_FOUND",
        "Approval not found",
      );
    this._expire(x);
    return x;
  }
  list(actorId, organizationId) {
    this.repository.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.POLICY_READ,
    );
    return [...this.requests.values()]
      .filter((x) => x.organizationId === organizationId)
      .map((x) => (this._expire(x), x));
  }
  _expire(x) {
    if (
      ["pending", "approved", "overridden"].includes(x.state) &&
      this.clock().getTime() >= new Date(x.expiresAt).getTime()
    ) {
      x.state = "expired";
      x.version++;
      this._emit("approval.expired", x, null);
    }
  }
  transition(item, to) {
    if (!(TRANSITIONS[item.state] || []).includes(to))
      throw new ControlPlaneError(
        409,
        "APPROVAL_TRANSITION_INVALID",
        `Cannot transition approval from ${item.state} to ${to}`,
      );
    item.state = to;
    item.version++;
    return item;
  }
  decide(actorId, organizationId, id, { decision, reason }) {
    const item = this.get(
      actorId,
      organizationId,
      id,
      PERMISSIONS.APPROVAL_DECIDE,
    );
    this.repository.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.APPROVAL_DECIDE,
    );
    if (item.state !== "pending")
      throw new ControlPlaneError(
        409,
        "APPROVAL_NOT_PENDING",
        "Approval is not pending",
      );
    const m = this._membership(actorId, organizationId);
    if (item.separationOfDuties && actorId === item.requesterId)
      throw new ControlPlaneError(
        403,
        "SELF_APPROVAL_DENIED",
        "Requester cannot approve this action",
      );
    if (
      !item.eligibleRoles.includes(m.role) &&
      !item.eligibleUserIds.includes(actorId)
    )
      throw new ControlPlaneError(
        403,
        "APPROVER_NOT_ELIGIBLE",
        "Actor is not eligible to approve this action",
      );
    if (decision === "reject") {
      if (!reason || reason.trim().length < 4)
        throw new ControlPlaneError(
          400,
          "REJECTION_REASON_REQUIRED",
          "A rejection reason is required",
        );
      item.rejectionReason = reason.trim();
      this.transition(item, "rejected");
      this._emit("approval.rejected", item, actorId, {
        reason: item.rejectionReason,
      });
      return item;
    }
    if (decision !== "approve")
      throw new ControlPlaneError(
        400,
        "APPROVAL_DECISION_INVALID",
        "Decision must be approve or reject",
      );
    if (item.approvals.some((a) => a.actorId === actorId))
      throw new ControlPlaneError(
        409,
        "DUPLICATE_APPROVER",
        "Approver already voted",
      );
    item.approvals.push({
      actorId,
      authorizationVersion: m.authorizationVersion,
      role: m.role,
      at: iso(this.clock()),
    });
    item.version++;
    if (item.approvals.length >= item.requiredCount)
      this.transition(item, "approved");
    this._emit("approval.approved", item, actorId, {
      approvalCount: item.approvals.length,
    });
    return item;
  }
  override(actorId, organizationId, id, justification) {
    const item = this.get(actorId, organizationId, id);
    this.repository.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.APPROVAL_OVERRIDE,
    );
    if (!justification || justification.trim().length < 12)
      throw new ControlPlaneError(
        400,
        "OVERRIDE_JUSTIFICATION_REQUIRED",
        "Emergency override justification is required",
      );
    this.transition(item, "overridden");
    item.override = {
      actorId,
      justification: justification.trim(),
      at: iso(this.clock()),
    };
    this._emit("approval.overridden", item, actorId, {
      justification: item.override.justification,
    });
    return item;
  }
  cancel(actorId, organizationId, id) {
    const item = this.get(actorId, organizationId, id);
    if (actorId !== item.requesterId)
      this.repository.requireAccess(
        actorId,
        organizationId,
        PERMISSIONS.APPROVAL_POLICY_MANAGE,
      );
    this.transition(item, "cancelled");
    this._emit("approval.cancelled", item, actorId);
    return item;
  }
  invalidate(
    actorId,
    organizationId,
    id,
    reason = "Material action data changed",
  ) {
    const item = this.get(actorId, organizationId, id);
    this.transition(item, "invalidated");
    this._emit("approval.invalidated", item, actorId, { reason });
    return item;
  }
  beginExecution(actorId, organizationId, id, currentSnapshot, executionKey) {
    const item = this.get(actorId, organizationId, id);
    this._expire(item);
    if (!["approved", "overridden", "not_required"].includes(item.state))
      throw new ControlPlaneError(
        409,
        "APPROVAL_NOT_EXECUTABLE",
        "Approval is not executable",
      );
    if (snapshotDigest(currentSnapshot) !== item.snapshotDigest) {
      this.transition(item, "invalidated");
      this._emit("approval.invalidated", item, actorId, {
        reason: "snapshot_mismatch",
      });
      throw new ControlPlaneError(
        409,
        "APPROVAL_SNAPSHOT_CHANGED",
        "Approved action changed materially",
      );
    }
    const policy = this.matchingPolicy(organizationId, {
      action: item.action,
      projectId: item.projectId,
      environment: item.environment,
      resourceType: item.resourceType,
    });
    if (
      !policy ||
      policy.id !== item.policyId ||
      policy.version !== item.policyVersion
    ) {
      this.transition(item, "invalidated");
      throw new ControlPlaneError(
        409,
        "APPROVAL_POLICY_CHANGED",
        "Approval policy changed",
      );
    }
    for (const a of item.approvals) {
      const m = this._membership(a.actorId, organizationId);
      if (
        m.authorizationVersion !== a.authorizationVersion ||
        (!item.eligibleRoles.includes(m.role) &&
          !item.eligibleUserIds.includes(a.actorId))
      ) {
        this.transition(item, "invalidated");
        throw new ControlPlaneError(
          409,
          "APPROVER_AUTHORIZATION_CHANGED",
          "Approver authorization changed",
        );
      }
    }
    if (this.executionKeys.has(executionKey))
      throw new ControlPlaneError(
        409,
        "APPROVAL_ALREADY_CONSUMED",
        "Protected action already executed",
      );
    this.executionKeys.add(executionKey);
    this.transition(item, "executing");
    this._emit("approval.executing", item, actorId);
    return item;
  }
  finishExecution(id, succeeded = true) {
    const item = this.requests.get(id);
    this.transition(item, succeeded ? "consumed" : "failed");
    this._emit(succeeded ? "approval.consumed" : "approval.failed", item, null);
    return item;
  }
}

module.exports = {
  STATES,
  TRANSITIONS,
  PROTECTED_ACTIONS,
  MemoryApprovalStore,
};
