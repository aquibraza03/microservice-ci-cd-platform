const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const { PERMISSIONS } = require("../auth/rbac");

class MemoryPolicyExceptionStore {
  constructor(
    repository,
    { clock = () => new Date(), eventSink = () => {} } = {},
  ) {
    this.repository = repository;
    this.clock = clock;
    this.eventSink = eventSink;
    this.items = new Map();
  }
  _emit(action, x, actor, metadata = {}) {
    return this.eventSink({
      action,
      organizationId: x.organizationId,
      actorUserId: actor,
      resourceType: "policy_exception",
      resourceId: x.id,
      metadata,
    });
  }
  _refresh(x) {
    if (
      x.status === "active" &&
      this.clock().getTime() >= new Date(x.expiresAt).getTime()
    ) {
      x.status = "expired";
      x.version++;
      this._emit("policy_exception.expired", x, null, {
        workloadAction: "report_noncompliant_no_automatic_delete",
      });
    }
    return x;
  }
  request(actorId, organizationId, input) {
    this.repository.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.POLICY_EXCEPTION_REQUEST,
    );
    if (
      !input.projectId ||
      !input.environment ||
      !input.targetId ||
      !input.policyId ||
      !input.serviceId ||
      !input.justification ||
      !input.compensatingControl
    )
      throw new ControlPlaneError(
        400,
        "POLICY_EXCEPTION_SCOPE_REQUIRED",
        "A narrow scope, justification and compensating control are required",
      );
    const start = new Date(input.startsAt || this.clock()),
      end = new Date(input.expiresAt);
    if (
      !Number.isFinite(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > 30 * 86400000
    )
      throw new ControlPlaneError(
        400,
        "POLICY_EXCEPTION_EXPIRY_INVALID",
        "Exception must expire within 30 days",
      );
    const x = {
      id: crypto.randomUUID(),
      organizationId,
      projectId: input.projectId,
      environment: input.environment,
      targetId: input.targetId,
      policyId: input.policyId,
      serviceId: input.serviceId,
      workloadId: input.workloadId || null,
      justification: input.justification,
      compensatingControl: input.compensatingControl,
      requesterId: actorId,
      approverId: null,
      startsAt: start.toISOString(),
      expiresAt: end.toISOString(),
      status: "pending",
      policyVersion: input.policyVersion,
      resourceVersion: input.resourceVersion,
      approvalId: input.approvalId || null,
      version: 1,
    };
    this.items.set(x.id, x);
    this._emit("policy_exception.requested", x, actorId);
    return x;
  }
  get(actorId, organizationId, id, permission = PERMISSIONS.POLICY_READ) {
    this.repository.requireAccess(actorId, organizationId, permission);
    const x = this.items.get(id);
    if (!x || x.organizationId !== organizationId)
      throw new ControlPlaneError(
        404,
        "POLICY_EXCEPTION_NOT_FOUND",
        "Policy exception not found",
      );
    return this._refresh(x);
  }
  list(actorId, organizationId) {
    this.repository.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.POLICY_READ,
    );
    return [...this.items.values()]
      .filter((x) => x.organizationId === organizationId)
      .map((x) => this._refresh(x));
  }
  approve(
    actorId,
    organizationId,
    id,
    { approvalId, policyVersion, resourceVersion },
  ) {
    this.repository.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.POLICY_EXCEPTION_APPROVE,
    );
    const x = this.get(
      actorId,
      organizationId,
      id,
      PERMISSIONS.POLICY_EXCEPTION_APPROVE,
    );
    if (x.status !== "pending")
      throw new ControlPlaneError(
        409,
        "POLICY_EXCEPTION_NOT_PENDING",
        "Exception is not pending",
      );
    if (actorId === x.requesterId)
      throw new ControlPlaneError(
        403,
        "SELF_APPROVAL_DENIED",
        "Requester cannot approve an exception",
      );
    if (
      !approvalId ||
      approvalId !== x.approvalId ||
      policyVersion !== x.policyVersion ||
      resourceVersion !== x.resourceVersion
    )
      throw new ControlPlaneError(
        409,
        "POLICY_EXCEPTION_INVALIDATED",
        "Exception approval or resource version changed",
      );
    x.status = this.clock() < new Date(x.startsAt) ? "approved" : "active";
    x.approverId = actorId;
    x.version++;
    this._emit("policy_exception.approved", x, actorId);
    return x;
  }
  applies(organizationId, scope) {
    return [...this.items.values()]
      .map((x) => this._refresh(x))
      .some(
        (x) =>
          x.organizationId === organizationId &&
          x.status === "active" &&
          x.projectId === scope.projectId &&
          x.environment === scope.environment &&
          x.targetId === scope.targetId &&
          x.policyId === scope.policyId &&
          x.serviceId === scope.serviceId &&
          (!x.workloadId || x.workloadId === scope.workloadId),
      );
  }
  revoke(actorId, organizationId, id) {
    this.repository.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.SECURITY_POLICY_MANAGE,
    );
    const x = this.get(actorId, organizationId, id);
    if (!["pending", "approved", "active"].includes(x.status))
      throw new ControlPlaneError(
        409,
        "POLICY_EXCEPTION_TERMINAL",
        "Exception is already terminal",
      );
    x.status = "revoked";
    x.version++;
    this._emit("policy_exception.revoked", x, actorId);
    return x;
  }
}
module.exports = { MemoryPolicyExceptionStore };
