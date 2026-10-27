const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const { PERMISSIONS } = require("../auth/rbac");
const { encryptCredential, decryptCredential } = require("./security");
const STATES = [
  "draft",
  "validating",
  "active",
  "degraded",
  "invalid",
  "disabled",
  "revoked",
];
const TRANSITIONS = {
  draft: ["validating", "disabled", "revoked"],
  validating: ["active", "invalid", "degraded", "disabled", "revoked"],
  active: ["validating", "degraded", "disabled", "revoked"],
  degraded: ["validating", "disabled", "revoked"],
  invalid: ["validating", "disabled", "revoked"],
  disabled: ["validating", "revoked"],
  revoked: [],
};
const now = () => new Date().toISOString();
class MemoryByocStore {
  constructor(repository, { awsProvider, kubernetesProvider, encryptionKey }) {
    Object.assign(this, {
      repository,
      awsProvider,
      kubernetesProvider,
      encryptionKey,
    });
    this.connections = new Map();
    this.targets = new Map();
    this.capabilityRecords = new Map();
    this.validationAttempts = [];
    this.credentials = new Map();
    this.idempotency = new Map();
    this.externalIds = new Set();
  }
  _authorize(userId, org, permission = PERMISSIONS.CLOUD_CONNECTION_MANAGE) {
    return this.repository.requireAccess(userId, org, permission);
  }
  _transition(item, to, expectedVersion) {
    if (Number(expectedVersion) !== item.version)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Connection changed concurrently",
      );
    if (!TRANSITIONS[item.status]?.includes(to))
      throw new ControlPlaneError(
        409,
        "CONNECTION_TRANSITION_INVALID",
        `Cannot transition ${item.status} to ${to}`,
      );
    item.status = to;
    item.version++;
    item.updatedAt = now();
    if (to === "disabled") item.disabledAt = now();
    if (to === "revoked") item.revokedAt = now();
    return item;
  }
  _safe(item) {
    const safe = structuredClone(item);
    delete safe.externalId;
    delete safe.encryptedCredential;
    return safe;
  }
  providers() {
    return [
      {
        type: "aws",
        resourceType: "cloud_connection",
        supportLevel: this.awsProvider.supportLevel,
        connectable: true,
        capabilities: this.awsProvider.capabilities(),
      },
      {
        type: "kubernetes",
        resourceType: "deployment_target",
        supportLevel: this.kubernetesProvider.supportLevel,
        connectable: true,
        capabilities: this.kubernetesProvider.capabilities(),
      },
      {
        type: "azure",
        resourceType: "cloud_connection",
        supportLevel: "planned",
        connectable: false,
        capabilities: [],
      },
      {
        type: "gcp",
        resourceType: "cloud_connection",
        supportLevel: "planned",
        connectable: false,
        capabilities: [],
      },
    ];
  }
  createAws(userId, org, input, key) {
    this._authorize(userId, org);
    const idem = `${org}:${key}`,
      previous = this.idempotency.get(idem);
    if (previous)
      return {
        connection: this._safe(this.connections.get(previous)),
        created: false,
      };
    const checked = this.awsProvider.validateConfiguration(input);
    let externalId;
    do externalId = crypto.randomBytes(32).toString("base64url");
    while (this.externalIds.has(externalId));
    this.externalIds.add(externalId);
    const timestamp = now(),
      item = {
        id: crypto.randomUUID(),
        organizationId: org,
        displayName: input.displayName,
        providerType: "aws",
        roleArn: checked.roleArn,
        expectedAccountId: checked.expectedAccountId,
        externalId,
        permittedRegions: checked.permittedRegions,
        enabledCapabilities: input.enabledCapabilities || ["identity"],
        status: "draft",
        lastValidationAt: null,
        lastSuccessfulValidationAt: null,
        validationErrorCategory: null,
        configurationVersion: 1,
        version: 1,
        disabledAt: null,
        revokedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    this.connections.set(item.id, item);
    this.idempotency.set(idem, item.id);
    return {
      connection: this._safe(item),
      trustPolicy: this.awsProvider.trustPolicy(item),
      created: true,
    };
  }
  listConnections(userId, org) {
    this._authorize(userId, org, PERMISSIONS.CLOUD_CONNECTION_READ);
    return [...this.connections.values()]
      .filter((x) => x.organizationId === org)
      .map((x) => this._safe(x));
  }
  connection(userId, org, id, permission = PERMISSIONS.CLOUD_CONNECTION_READ) {
    this._authorize(userId, org, permission);
    const x = this.connections.get(id);
    if (!x || x.organizationId !== org)
      throw new ControlPlaneError(
        404,
        "PROVIDER_CONNECTION_NOT_FOUND",
        "Provider connection not found",
      );
    return x;
  }
  async validateAws(userId, org, id, expectedVersion) {
    const item = this.connection(
      userId,
      org,
      id,
      PERMISSIONS.CLOUD_CONNECTION_MANAGE,
    );
    if (["disabled", "revoked"].includes(item.status))
      throw new ControlPlaneError(
        409,
        "CONNECTION_NOT_USABLE",
        "Connection is disabled or revoked",
      );
    if (item.status === "validating")
      throw new ControlPlaneError(
        409,
        "VALIDATION_ALREADY_RUNNING",
        "Connection validation is already running",
      );
    this._transition(item, "validating", expectedVersion);
    const attempt = {
      id: crypto.randomUUID(),
      organizationId: org,
      resourceType: "provider_connection",
      resourceId: id,
      startedAt: now(),
      status: "running",
    };
    this.validationAttempts.push(attempt);
    item.lastValidationAt = now();
    try {
      const identity = await this.awsProvider.validateIdentity(item);
      this._transition(item, "active", item.version);
      item.lastSuccessfulValidationAt = now();
      item.validationErrorCategory = null;
      item.actualAccountId = identity.accountId;
      this.capabilityRecords.set(id, this.awsProvider.capabilities());
      attempt.status = "passed";
      attempt.completedAt = now();
      return this._safe(item);
    } catch (error) {
      this._transition(item, "invalid", item.version);
      item.validationErrorCategory = error.code || "AWS_CONNECTION_FAILED";
      attempt.status = "failed";
      attempt.errorCategory = item.validationErrorCategory;
      attempt.retryable = Boolean(error.retryable);
      attempt.completedAt = now();
      throw error;
    }
  }
  updateAws(userId, org, id, input, expectedVersion) {
    const item = this.connection(
      userId,
      org,
      id,
      PERMISSIONS.CLOUD_CONNECTION_MANAGE,
    );
    if (item.status === "revoked")
      throw new ControlPlaneError(
        409,
        "CONNECTION_REVOKED",
        "Revoked connections cannot be changed",
      );
    const checked = this.awsProvider.validateConfiguration({
      roleArn: input.roleArn || item.roleArn,
      expectedAccountId: input.expectedAccountId || item.expectedAccountId,
      permittedRegions: input.permittedRegions || item.permittedRegions,
    });
    if (item.version !== expectedVersion)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Connection changed concurrently",
      );
    Object.assign(item, checked, {
      status: "draft",
      configurationVersion: item.configurationVersion + 1,
      version: item.version + 1,
      updatedAt: now(),
      lastValidationAt: null,
      validationErrorCategory: null,
    });
    return this._safe(item);
  }
  lifecycle(userId, org, id, action, expectedVersion) {
    const item = this.connection(
      userId,
      org,
      id,
      PERMISSIONS.CLOUD_CONNECTION_MANAGE,
    );
    return this._safe(
      this._transition(
        item,
        action === "disable" ? "disabled" : "revoked",
        expectedVersion,
      ),
    );
  }
  createKubernetesTarget(userId, org, input, key) {
    this._authorize(userId, org, PERMISSIONS.DEPLOYMENT_TARGET_MANAGE);
    const idem = `${org}:target:${key}`,
      prior = this.idempotency.get(idem);
    if (prior)
      return { target: this._safe(this.targets.get(prior)), created: false };
    if (
      !input.serviceAccountToken &&
      input.authenticationMethod === "service_account_token"
    )
      throw new ControlPlaneError(
        400,
        "KUBERNETES_CREDENTIAL_REQUIRED",
        "Kubernetes credential is required",
      );
    const encryptedCredential = input.serviceAccountToken
        ? encryptCredential(input.serviceAccountToken, this.encryptionKey)
        : null,
      timestamp = now(),
      target = {
        id: crypto.randomUUID(),
        organizationId: org,
        name: input.name,
        providerType: "kubernetes",
        clusterFingerprint: input.clusterFingerprint || null,
        apiServerOrigin: input.apiServerOrigin,
        allowedNamespaces: [...new Set(input.allowedNamespaces || [])],
        allowedEnvironments: [...new Set(input.allowedEnvironments || [])],
        authenticationMethod: input.authenticationMethod,
        encryptedCredential,
        credentialVersion: 1,
        version: 1,
        status: "draft",
        kubernetesVersion: null,
        capabilityResults: {},
        permissionValidation: "pending",
        connectionHealth: "unknown",
        lastValidationAt: null,
        disabledAt: null,
        revokedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    this.targets.set(target.id, target);
    this.idempotency.set(idem, target.id);
    this.credentials.set(`${target.id}:1`, {
      version: 1,
      createdAt: timestamp,
      revokedAt: null,
    });
    return { target: this._safe(target), created: true };
  }
  listTargets(userId, org, { usable = false } = {}) {
    this._authorize(userId, org, PERMISSIONS.DEPLOYMENT_TARGET_READ);
    return [...this.targets.values()]
      .filter(
        (x) => x.organizationId === org && (!usable || x.status === "active"),
      )
      .map((x) => this._safe(x));
  }
  target(userId, org, id, permission = PERMISSIONS.DEPLOYMENT_TARGET_READ) {
    this._authorize(userId, org, permission);
    const x = this.targets.get(id);
    if (!x || x.organizationId !== org)
      throw new ControlPlaneError(
        404,
        "DEPLOYMENT_TARGET_NOT_FOUND",
        "Deployment target not found",
      );
    return x;
  }
  async validateTarget(userId, org, id, expectedVersion) {
    const target = this.target(
      userId,
      org,
      id,
      PERMISSIONS.DEPLOYMENT_TARGET_MANAGE,
    );
    if (["disabled", "revoked"].includes(target.status))
      throw new ControlPlaneError(
        409,
        "TARGET_NOT_USABLE",
        "Deployment target is disabled or revoked",
      );
    this._transition(target, "validating", expectedVersion);
    target.lastValidationAt = now();
    const attempt = {
      id: crypto.randomUUID(),
      organizationId: org,
      resourceType: "deployment_target",
      resourceId: id,
      startedAt: now(),
      status: "running",
    };
    this.validationAttempts.push(attempt);
    try {
      const credential = target.encryptedCredential
          ? decryptCredential(target.encryptedCredential, this.encryptionKey)
          : null,
        result = await this.kubernetesProvider.validateTarget(
          target,
          credential,
        );
      Object.assign(target, result);
      this._transition(target, "active", target.version);
      target.lastSuccessfulValidationAt = now();
      target.validationErrorCategory = null;
      this.capabilityRecords.set(id, result.capabilityResults || {});
      attempt.status = "passed";
      attempt.completedAt = now();
      return this._safe(target);
    } catch (error) {
      target.connectionHealth = "unhealthy";
      target.validationErrorCategory =
        error.code || "KUBERNETES_CONNECTION_FAILED";
      this._transition(target, "invalid", target.version);
      attempt.status = "failed";
      attempt.errorCategory = target.validationErrorCategory;
      attempt.retryable = Boolean(error.retryable);
      attempt.completedAt = now();
      throw error;
    }
  }
  assertTargetUsable(
    userId,
    org,
    id,
    { environment, namespace, maxValidationAgeMs = 15 * 60 * 1000 },
  ) {
    const target = this.target(userId, org, id, PERMISSIONS.DEPLOYMENT_CREATE);
    const validatedAt = Date.parse(target.lastSuccessfulValidationAt || "");
    if (
      target.status !== "active" ||
      !Number.isFinite(validatedAt) ||
      Date.now() - validatedAt > maxValidationAgeMs
    )
      throw new ControlPlaneError(
        409,
        "TARGET_NOT_USABLE",
        "Deployment target is not active with a fresh validation",
      );
    if (!target.allowedEnvironments.includes(environment))
      throw new ControlPlaneError(
        403,
        "TARGET_ENVIRONMENT_NOT_ALLOWED",
        "Environment is outside the deployment target scope",
      );
    if (!target.allowedNamespaces.includes(namespace))
      throw new ControlPlaneError(
        403,
        "TARGET_NAMESPACE_NOT_ALLOWED",
        "Namespace is outside the deployment target scope",
      );
    return target;
  }
  rotateTargetCredential(userId, org, id, token, expectedVersion) {
    const target = this.target(
      userId,
      org,
      id,
      PERMISSIONS.DEPLOYMENT_TARGET_MANAGE,
    );
    if (target.status === "revoked")
      throw new ControlPlaneError(
        409,
        "TARGET_REVOKED",
        "Revoked targets cannot rotate credentials",
      );
    if (target.version !== expectedVersion)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Deployment target changed concurrently",
      );
    const old = this.credentials.get(`${id}:${target.credentialVersion}`);
    if (old) old.revokedAt = now();
    target.credentialVersion++;
    target.encryptedCredential = encryptCredential(token, this.encryptionKey);
    target.status = "draft";
    target.version++;
    target.updatedAt = now();
    this.credentials.set(`${id}:${target.credentialVersion}`, {
      version: target.credentialVersion,
      createdAt: now(),
      revokedAt: null,
    });
    return this._safe(target);
  }
  targetLifecycle(userId, org, id, action, expectedVersion) {
    const target = this.target(
      userId,
      org,
      id,
      PERMISSIONS.DEPLOYMENT_TARGET_MANAGE,
    );
    const result = this._transition(
      target,
      action === "disable" ? "disabled" : "revoked",
      expectedVersion,
    );
    if (result.status === "revoked") {
      result.encryptedCredential = null;
      const c = this.credentials.get(`${id}:${result.credentialVersion}`);
      if (c) c.revokedAt = now();
    }
    return this._safe(result);
  }
}
module.exports = { MemoryByocStore, STATES, TRANSITIONS };
