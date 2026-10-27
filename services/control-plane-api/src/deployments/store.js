const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const { PERMISSIONS } = require("../auth/rbac");
const { transition } = require("./state-machine");
const { redact } = require("./redaction");
const { eventContract } = require("./event-contract");
const {
  DEFAULT_POLICY,
  compatibility,
  assertDigest,
  diffObjects,
} = require("./rollback-policy");
const now = () => new Date().toISOString();
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
class MemoryDeploymentStore {
  constructor(
    repository,
    { retentionMs = 604800000, maxLogBytes = 5242880 } = {},
  ) {
    this.repository = repository;
    this.deployments = new Map();
    this.events = new Map();
    this.stages = new Map();
    this.logs = new Map();
    this.images = new Map();
    this.artifacts = new Map();
    this.attempts = new Map();
    this.idempotency = new Map();
    this.rollbackPolicies = new Map();
    this.rollbackApprovals = new Map();
    this.operationLocks = new Map();
    this.rollbackAudit = [];
    this.retentionMs = retentionMs;
    this.maxLogBytes = maxLogBytes;
  }
  async create(userId, organizationId, input, key) {
    this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.DEPLOYMENT_CREATE,
    );
    if (input.environment === "production")
      this.repository.requireAccess(
        userId,
        organizationId,
        PERMISSIONS.DEPLOYMENT_PRODUCTION,
      );
    this.repository.getProject(userId, organizationId, input.projectId);
    const service = this.repository.getService(
        userId,
        organizationId,
        input.serviceId,
      ),
      repo = this.repository.getProviderRepository(
        userId,
        organizationId,
        input.repositoryId,
      );
    if (
      repo.projectId !== input.projectId ||
      service.projectId !== input.projectId ||
      service.repositoryId !== repo.id
    )
      throw new ControlPlaneError(
        404,
        "DEPLOYMENT_RESOURCE_NOT_FOUND",
        "Deployment resources not found",
      );
    if (
      !/^[a-f0-9]{40,64}$/i.test(input.commitSha) ||
      !/^[-A-Za-z0-9._/]{1,255}$/.test(input.branch)
    )
      throw new ControlPlaneError(
        400,
        "DEPLOYMENT_INPUT_INVALID",
        "Branch or commit is invalid",
      );
    const idem = hash(`${organizationId}:${key}`),
      existing = this.idempotency.get(idem);
    if (existing)
      return { deployment: this.deployments.get(existing), created: false };
    const timestamp = now(),
      id = crypto.randomUUID();
    const entity = {
      id,
      organizationId,
      projectId: input.projectId,
      serviceId: input.serviceId,
      repositoryId: input.repositoryId,
      branch: input.branch,
      commitSha: input.commitSha,
      triggerSource: input.triggerSource || "manual",
      triggeringUserId: userId,
      environment: input.environment,
      provider: repo.provider,
      currentState: input.initialState || "queued",
      stateVersion: 1,
      configurationSnapshot: structuredClone(input.configurationSnapshot || {}),
      imageTag: input.imageTag || null,
      imageDigest: null,
      attemptCount: 0,
      failureCode: null,
      failureMessage: null,
      startedAt: null,
      completedAt: null,
      previousSuccessfulDeploymentId: null,
      rollbackTargetId: input.rollbackTargetId || null,
      createdAt: timestamp,
      updatedAt: timestamp,
      processedCommands: new Set(),
    };
    this.deployments.set(id, entity);
    this.idempotency.set(idem, id);
    this.appendEvent(entity, {
      eventType: "deployment.created",
      state: entity.currentState,
      safeMessage: entity.currentState === "waiting_for_approval" ? "Deployment is waiting for approval" : "Deployment queued",
      metadata: { triggerSource: entity.triggerSource },
    });
    return { deployment: entity, created: true };
  }
  assertOperationAvailable(organizationId, serviceId, environment, key) {
    const existingId = this.idempotency.get(hash(`${organizationId}:${key}`));
    if (existingId) return;
    const conflict = [...this.deployments.values()].find(
      (d) =>
        d.organizationId === organizationId &&
        d.serviceId === serviceId &&
        d.environment === environment &&
        [
          "queued",
          "validating",
          "testing",
          "scanning",
          "building",
          "pushing",
          "deploying",
          "rollback_queued",
          "rolling_back",
          "verifying",
        ].includes(d.currentState),
    );
    if (conflict)
      throw new ControlPlaneError(
        409,
        "DEPLOYMENT_OPERATION_CONFLICT",
        "Another deployment operation is active",
      );
  }
  access(userId, organizationId, id, permission = PERMISSIONS.OBSERVE) {
    this.repository.requireAccess(userId, organizationId, permission);
    const d = this.deployments.get(id);
    if (!d || d.organizationId !== organizationId)
      throw new ControlPlaneError(
        404,
        "DEPLOYMENT_NOT_FOUND",
        "Deployment not found",
      );
    return d;
  }
  list(userId, organizationId, filters = {}) {
    this.repository.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    return [...this.deployments.values()].filter(
      (d) =>
        d.organizationId === organizationId &&
        (!filters.state || d.currentState === filters.state) &&
        (!filters.projectId || d.projectId === filters.projectId),
    );
  }
  transition(id, to, options) {
    const current = this.deployments.get(id);
    if (!current)
      throw new ControlPlaneError(
        404,
        "DEPLOYMENT_NOT_FOUND",
        "Deployment not found",
      );
    const result = transition(current, to, options);
    if (!result.idempotent) {
      this.deployments.set(id, result.deployment);
      this.appendEvent(result.deployment, result.event);
    }
    return result.deployment;
  }
  appendEvent(deployment, event) {
    const items = this.events.get(deployment.id) || [];
    const value = eventContract(
      deployment,
      {
        id: crypto.randomUUID(),
        stateVersion: event.stateVersion ?? deployment.stateVersion,
        ...event,
        createdAt: now(),
      },
      items.length + 1,
    );
    items.push(value);
    this.events.set(deployment.id, items);
    return value;
  }
  recordEvent(id, eventType, state, safeMessage, metadata = {}, details = {}) {
    const deployment = this.deployments.get(id);
    if (!deployment)
      throw new ControlPlaneError(
        404,
        "DEPLOYMENT_NOT_FOUND",
        "Deployment not found",
      );
    return this.appendEvent(deployment, {
      eventType,
      state,
      safeMessage,
      metadata,
      ...details,
    });
  }
  history(userId, organizationId, id, query = 0) {
    this.access(userId, organizationId, id);
    const q = typeof query === "number" ? { after: query } : query;
    let rows = (this.events.get(id) || []).filter(
      (e) => e.sequence > Number(q.after || 0),
    );
    if (q.stage) rows = rows.filter((e) => e.stage === q.stage);
    if (q.level) rows = rows.filter((e) => e.level === q.level);
    if (q.from) rows = rows.filter((e) => e.timestamp >= q.from);
    if (q.to) rows = rows.filter((e) => e.timestamp <= q.to);
    if (q.search)
      rows = rows.filter((e) =>
        e.safeMessage.toLowerCase().includes(String(q.search).toLowerCase()),
      );
    const limit = Math.min(Number(q.limit || 100), 500);
    return rows.slice(0, limit);
  }
  listStages(userId, organizationId, id) {
    this.access(userId, organizationId, id);
    return this.stages.get(id) || [];
  }
  stage(id, name, state, attempt, message) {
    const list = this.stages.get(id) || [];
    let item = list.find((s) => s.name === name && s.attempt === attempt);
    if (!item) {
      item = {
        id: crypto.randomUUID(),
        deploymentId: id,
        name,
        state,
        attempt,
        startedAt: now(),
        completedAt: null,
        durationMs: null,
      };
      list.push(item);
      this.stages.set(id, list);
    }
    item.state = state;
    item.safeMessage = redact(message || "");
    if (["passed", "failed", "skipped", "cancelled"].includes(state)) {
      item.completedAt = now();
      item.durationMs = new Date(item.completedAt) - new Date(item.startedAt);
    }
    return item;
  }
  appendLog(id, organizationId, stage, content, secrets = [], details = {}) {
    const deployment = this.deployments.get(id);
    if (!deployment || deployment.organizationId !== organizationId)
      throw new ControlPlaneError(
        404,
        "DEPLOYMENT_NOT_FOUND",
        "Deployment not found",
      );
    const list = this.logs.get(id) || [],
      used = list.reduce((n, x) => n + x.byteSize, 0),
      clean = redact(String(content).slice(0, 65536), secrets),
      bytes = Buffer.byteLength(clean);
    if (used + bytes > this.maxLogBytes) {
      if (!list.some((x) => x.truncated)) {
        const event = this.appendEvent(deployment, {
          eventType: "log.truncated",
          stage,
          level: "warn",
          source: "worker",
          attempt: details.attempt,
          safeMessage: "Deployment log storage limit reached",
          metadata: { maxBytes: this.maxLogBytes },
        });
        list.push({
          ...event,
          content: event.safeMessage,
          byteSize: Buffer.byteLength(event.safeMessage),
          expiresAt: new Date(Date.now() + this.retentionMs).toISOString(),
          truncated: true,
        });
        this.logs.set(id, list);
      }
      return null;
    }
    const event = this.appendEvent(deployment, {
      eventType: "log",
      stage,
      level: details.level || "info",
      source: details.source || "worker",
      attempt: details.attempt,
      safeMessage: clean,
      secrets,
      metadata: details.metadata || {},
    });
    const item = {
      ...event,
      content: event.safeMessage,
      byteSize: bytes,
      expiresAt: new Date(Date.now() + this.retentionMs).toISOString(),
    };
    list.push(item);
    this.logs.set(id, list);
    return item;
  }
  listLogs(userId, organizationId, id) {
    this.access(userId, organizationId, id);
    return (this.logs.get(id) || []).filter(
      (item) => new Date(item.expiresAt).getTime() > Date.now(),
    );
  }
  retention(userId, organizationId, id) {
    this.access(userId, organizationId, id);
    const items = this.logs.get(id) || [];
    return {
      retentionDays: Math.ceil(this.retentionMs / 86400000),
      maxDeploymentBytes: this.maxLogBytes,
      usedBytes: items.reduce((n, x) => n + x.byteSize, 0),
      truncated: items.some((x) => x.truncated),
      expiresAt: items[0]?.expiresAt || null,
    };
  }
  saveImage(id, image) {
    const value = {
      id: crypto.randomUUID(),
      deploymentId: id,
      localReference: "ephemeral://discarded-after-metadata-capture",
      imageTag: image.imageTag,
      digest: image.digest || null,
      published: false,
      createdAt: now(),
    };
    this.images.set(id, value);
    return value;
  }
  savePublishedImage(id, image, verification) {
    const existing = this.images.get(id) || {
      id: crypto.randomUUID(),
      deploymentId: id,
      createdAt: now(),
    };
    Object.assign(existing, {
      registry: image.registry,
      repository: image.repository,
      tags: image.tags,
      digest: image.digest,
      published: true,
      scanStatus: verification.scan.status,
      scanSummary: verification.scan,
      sbomReference: verification.sbomPath,
      provenanceReference: verification.provenancePath,
      signatureStatus: verification.signature.status,
      verifiedAt: now(),
    });
    this.images.set(id, existing);
    const d = this.deployments.get(id);
    d.imageDigest = image.digest;
    d.imageTag = image.tags[0];
    return existing;
  }
  setEndpoint(id, endpoint) {
    const d = this.deployments.get(id);
    d.endpoint = endpoint;
    d.updatedAt = now();
    return d;
  }
  setDeliverySnapshot(id, value) {
    const d = this.deployments.get(id);
    d.configurationSnapshot = {
      ...d.configurationSnapshot,
      ...structuredClone(value),
    };
    d.updatedAt = now();
    return d;
  }
  setRollbackPolicy(userId, organizationId, environment, input) {
    this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.ENVIRONMENT_MANAGE,
    );
    const value = {
      ...DEFAULT_POLICY,
      ...structuredClone(input || {}),
      enabledEnvironments:
        input?.enabled === false
          ? DEFAULT_POLICY.enabledEnvironments.filter((x) => x !== environment)
          : [...new Set([...DEFAULT_POLICY.enabledEnvironments, environment])],
      approvalRequiredEnvironments:
        input?.approvalRequired === true
          ? [
              ...new Set([
                ...DEFAULT_POLICY.approvalRequiredEnvironments,
                environment,
              ]),
            ]
          : input?.approvalRequired === false
            ? DEFAULT_POLICY.approvalRequiredEnvironments.filter(
                (x) => x !== environment,
              )
            : DEFAULT_POLICY.approvalRequiredEnvironments,
      organizationId,
      environment,
      updatedBy: userId,
      updatedAt: now(),
    };
    this.rollbackPolicies.set(`${organizationId}:${environment}`, value);
    return value;
  }
  rollbackPolicy(organizationId, environment) {
    return (
      this.rollbackPolicies.get(`${organizationId}:${environment}`) || {
        ...DEFAULT_POLICY,
        organizationId,
        environment,
      }
    );
  }
  approveRollback(
    userId,
    organizationId,
    currentDeploymentId,
    targetDeploymentId,
    justification,
  ) {
    this.repository.requireAccess(userId, organizationId, PERMISSIONS.ROLLBACK);
    const current = this.access(userId, organizationId, currentDeploymentId),
      target = this.access(userId, organizationId, targetDeploymentId);
    if (
      current.serviceId !== target.serviceId ||
      current.environment !== target.environment
    )
      throw new ControlPlaneError(
        409,
        "ROLLBACK_TARGET_MISMATCH",
        "Rollback target does not match the service and environment",
      );
    if (!justification || justification.trim().length < 8)
      throw new ControlPlaneError(
        400,
        "ROLLBACK_APPROVAL_JUSTIFICATION_REQUIRED",
        "Approval justification is required",
      );
    const approval = {
      id: crypto.randomUUID(),
      organizationId,
      currentDeploymentId,
      targetDeploymentId,
      approvedBy: userId,
      justification: redact(justification),
      status: "approved",
      createdAt: now(),
    };
    this.rollbackApprovals.set(approval.id, approval);
    this.rollbackAudit.push({
      action: "rollback.approved",
      actorUserId: userId,
      ...approval,
    });
    return approval;
  }
  rollbackComparison(userId, organizationId, currentId, targetId) {
    const current = this.access(
        userId,
        organizationId,
        currentId,
        PERMISSIONS.ROLLBACK,
      ),
      target = this.access(userId, organizationId, targetId),
      policy = this.rollbackPolicy(organizationId, current.environment);
    if (
      current.serviceId !== target.serviceId ||
      current.environment !== target.environment
    )
      throw new ControlPlaneError(
        409,
        "ROLLBACK_TARGET_MISMATCH",
        "Rollback target does not match the service and environment",
      );
    return {
      current,
      target,
      configurationChanges: diffObjects(
        current.configurationSnapshot,
        target.configurationSnapshot,
      ),
      resourceChanges: diffObjects(
        current.configurationSnapshot?.resources,
        target.configurationSnapshot?.resources,
      ),
      environmentVariableNames: {
        current: Object.keys(
          current.configurationSnapshot?.environmentVariables || {},
        ).sort(),
        target: Object.keys(
          target.configurationSnapshot?.environmentVariables || {},
        ).sort(),
      },
      compatibility: compatibility(current, target, policy),
      approvalRequired: policy.approvalRequiredEnvironments.includes(
        current.environment,
      ),
      policy,
    };
  }
  listRollbackTargets(userId, organizationId, currentId) {
    const current = this.access(
      userId,
      organizationId,
      currentId,
      PERMISSIONS.ROLLBACK,
    );
    return [...this.deployments.values()]
      .filter(
        (d) =>
          d.organizationId === organizationId &&
          d.serviceId === current.serviceId &&
          d.environment === current.environment &&
          d.id !== current.id &&
          d.currentState === "ready" &&
          d.imageDigest &&
          d.configurationSnapshot,
      )
      .sort(
        (a, b) =>
          new Date(b.completedAt || b.createdAt) -
          new Date(a.completedAt || a.createdAt),
      );
  }
  _acquireOperationLock(deployment, key, timeoutSeconds) {
    const lockKey = `${deployment.organizationId}:${deployment.serviceId}:${deployment.environment}`,
      current = this.operationLocks.get(lockKey),
      active = current && new Date(current.expiresAt).getTime() > Date.now();
    if (active && current.key !== key)
      throw new ControlPlaneError(
        409,
        "DEPLOYMENT_OPERATION_CONFLICT",
        "Another deployment operation is active",
      );
    const conflicting = [...this.deployments.values()].find(
      (d) =>
        d.organizationId === deployment.organizationId &&
        d.serviceId === deployment.serviceId &&
        d.environment === deployment.environment &&
        d.id !== deployment.id &&
        [
          "queued",
          "validating",
          "testing",
          "scanning",
          "building",
          "pushing",
          "deploying",
          "rollback_queued",
          "rolling_back",
          "verifying",
        ].includes(d.currentState),
    );
    if (conflicting)
      throw new ControlPlaneError(
        409,
        "DEPLOYMENT_OPERATION_CONFLICT",
        "Another deployment operation is active",
      );
    this.operationLocks.set(lockKey, {
      key,
      deploymentId: deployment.id,
      expiresAt: new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
    });
    return lockKey;
  }
  releaseOperationLock(id) {
    for (const [key, value] of this.operationLocks)
      if (value.deploymentId === id) this.operationLocks.delete(key);
  }
  recoverStaleOperationLocks() {
    let recovered = 0;
    for (const [key, value] of this.operationLocks)
      if (new Date(value.expiresAt).getTime() <= Date.now()) {
        this.operationLocks.delete(key);
        recovered++;
      }
    return recovered;
  }
  async createRollback(userId, organizationId, targetId, reasonOrInput, key) {
    const input =
        typeof reasonOrInput === "string"
          ? { reason: reasonOrInput }
          : reasonOrInput || {},
      reason = input.reason;
    const existingId = this.idempotency.get(hash(`${organizationId}:${key}`));
    if (existingId) {
      const existing = this.access(
        userId,
        organizationId,
        existingId,
        PERMISSIONS.ROLLBACK,
      );
      if (existing.triggerSource === "rollback")
        return { deployment: existing, created: false };
    }
    if (!reason || reason.trim().length < 8)
      throw new ControlPlaneError(
        400,
        "ROLLBACK_REASON_REQUIRED",
        "A rollback reason of at least 8 characters is required",
      );
    const target = this.access(
      userId,
      organizationId,
      targetId,
      PERMISSIONS.ROLLBACK,
    );
    if (target.currentState !== "ready" || !target.imageDigest)
      throw new ControlPlaneError(
        409,
        "ROLLBACK_TARGET_INVALID",
        "Rollback target must be a healthy verified deployment",
      );
    const candidates = [...this.deployments.values()]
      .filter(
        (d) =>
          d.organizationId === organizationId &&
          d.serviceId === target.serviceId &&
          d.currentState === "ready" &&
          d.id !== target.id,
      )
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const previous = input.targetDeploymentId
      ? this.access(userId, organizationId, input.targetDeploymentId)
      : candidates[0];
    if (
      !previous ||
      previous.serviceId !== target.serviceId ||
      previous.environment !== target.environment
    )
      throw new ControlPlaneError(
        409,
        "ROLLBACK_TARGET_MISSING",
        "No previous healthy deployment is available",
      );
    if (previous.currentState !== "ready")
      throw new ControlPlaneError(
        409,
        "ROLLBACK_TARGET_UNHEALTHY",
        "Rollback target was not verified healthy",
      );
    assertDigest(previous.imageDigest);
    if (
      !previous.configurationSnapshot ||
      !Object.keys(previous.configurationSnapshot).length
    )
      throw new ControlPlaneError(
        409,
        "ROLLBACK_CONFIGURATION_MISSING",
        "Rollback target configuration snapshot is missing",
      );
    const image = this.images.get(previous.id);
    if (
      !image ||
      image.published !== true ||
      !["verified", "signed"].includes(image.signatureStatus) ||
      !["passed", "verified"].includes(image.scanStatus)
    )
      throw new ControlPlaneError(
        409,
        "ROLLBACK_SUPPLY_CHAIN_INVALID",
        "Rollback target no longer passes signature and policy validation",
      );
    const policy = this.rollbackPolicy(organizationId, target.environment);
    if (!policy.enabledEnvironments.includes(target.environment))
      throw new ControlPlaneError(
        409,
        "ROLLBACK_ENVIRONMENT_BLOCKED",
        "Rollback is disabled for this environment",
      );
    if (
      input.expectedStateVersion != null &&
      input.expectedStateVersion !== target.stateVersion
    )
      throw new ControlPlaneError(
        409,
        "DEPLOYMENT_VERSION_CONFLICT",
        "Deployment state changed concurrently",
      );
    const comparison = compatibility(target, previous, policy);
    if (comparison.blocked && !input.emergencyOverride)
      throw new ControlPlaneError(
        409,
        "ROLLBACK_DATABASE_INCOMPATIBLE",
        comparison.warning,
      );
    if (input.emergencyOverride) {
      this.repository.requireAccess(
        userId,
        organizationId,
        PERMISSIONS.EMERGENCY_ROLLBACK,
      );
      if (
        !input.overrideJustification ||
        input.overrideJustification.trim().length < 12
      )
        throw new ControlPlaneError(
          400,
          "EMERGENCY_JUSTIFICATION_REQUIRED",
          "Emergency override justification is required",
        );
    }
    const approvalRequired = policy.approvalRequiredEnvironments.includes(
        target.environment,
      ),
      approval =
        input.approvalId && this.rollbackApprovals.get(input.approvalId);
    if (
      approvalRequired &&
      (!approval ||
        approval.status !== "approved" ||
        approval.organizationId !== organizationId ||
        approval.currentDeploymentId !== target.id ||
        approval.targetDeploymentId !== previous.id)
    )
      throw new ControlPlaneError(
        409,
        "ROLLBACK_APPROVAL_REQUIRED",
        "An approval for this exact rollback is required",
      );
    this._acquireOperationLock(target, key, policy.lockTimeoutSeconds);
    const result = await this.create(
      userId,
      organizationId,
      {
        ...target,
        triggerSource: "rollback",
        configurationSnapshot: structuredClone(previous.configurationSnapshot),
        rollbackTargetId: previous.id,
        imageTag: previous.imageTag,
      },
      key,
    );
    for (const lock of this.operationLocks.values())
      if (lock.key === key) lock.deploymentId = result.deployment.id;
    result.deployment.imageDigest = previous.imageDigest;
    result.deployment.previousSuccessfulDeploymentId = target.id;
    result.deployment.rollback = {
      sourceDeploymentId: target.id,
      targetDeploymentId: previous.id,
      actorUserId: userId,
      reason: redact(reason),
      approvalId: approval?.id || null,
      emergencyOverride: Boolean(input.emergencyOverride),
      overrideJustification: input.emergencyOverride
        ? redact(input.overrideJustification)
        : null,
      databaseCompatibility: comparison,
      requestedAt: now(),
    };
    result.deployment = this.transition(
      result.deployment.id,
      "rollback_queued",
      {
        expectedVersion: result.deployment.stateVersion,
        commandId: `rollback-queue:${key}`,
        safeMessage: "Rollback queued",
      },
    );
    this.appendEvent(result.deployment, {
      eventType: "rollback.queued",
      state: "rollback_queued",
      safeMessage: "Rollback queued; database compatibility must be reviewed",
      metadata: {
        targetDeploymentId: previous.id,
        sourceDeploymentId: target.id,
        reason: redact(reason),
        approvalId: approval?.id || null,
        emergencyOverride: Boolean(input.emergencyOverride),
        databaseCompatibility: comparison,
      },
    });
    this.rollbackAudit.push({
      action: "rollback.queued",
      deploymentId: result.deployment.id,
      actorUserId: userId,
      organizationId,
      targetDeploymentId: previous.id,
      sourceDeploymentId: target.id,
      reason: redact(reason),
      approvalId: approval?.id || null,
      createdAt: now(),
    });
    return result;
  }
  requestCancellation(userId, organizationId, id, reason) {
    const d = this.access(
      userId,
      organizationId,
      id,
      PERMISSIONS.DEPLOYMENT_CREATE,
    );
    if (
      [
        "cancelled",
        "failed",
        "build_complete",
        "ready",
        "rolled_back",
      ].includes(d.currentState)
    )
      throw new ControlPlaneError(
        409,
        "DEPLOYMENT_TERMINAL",
        "Deployment is terminal",
      );
    return this.transition(id, "cancel_requested", {
      expectedVersion: d.stateVersion,
      commandId: `cancel:${id}`,
      safeMessage: redact(reason || "Cancellation requested"),
    });
  }
  isCancellationRequested(id) {
    return this.deployments.get(id)?.currentState === "cancel_requested";
  }
  addAttempt(id, workerId) {
    const d = this.deployments.get(id);
    d.attemptCount += 1;
    const attempt = {
      deploymentId: id,
      attempt: d.attemptCount,
      workerId,
      status: "active",
      heartbeatAt: now(),
      startedAt: now(),
    };
    this.attempts.set(`${id}:${attempt.attempt}`, attempt);
    return attempt;
  }
  heartbeat(id, attempt) {
    const a = this.attempts.get(`${id}:${attempt}`);
    if (a) a.heartbeatAt = now();
  }
  finishAttempt(id, attempt, status, failureCode = null) {
    const a = this.attempts.get(`${id}:${attempt}`);
    if (a) Object.assign(a, { status, failureCode, completedAt: now() });
  }
}
module.exports = { MemoryDeploymentStore, hash };
