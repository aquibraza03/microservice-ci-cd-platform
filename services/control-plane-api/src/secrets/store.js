const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const { PERMISSIONS } = require("../auth/rbac");
const now = () => new Date().toISOString();
class MemorySecretReferenceStore {
  constructor(repository, { providers, byocStore }) {
    this.repository = repository;
    this.providers = providers;
    this.byocStore = byocStore;
    this.references = new Map();
    this.attachments = new Map();
  }
  _access(userId, org, permission) {
    return this.repository.requireAccess(userId, org, permission);
  }
  _safe(item) {
    const out = structuredClone(item);
    out.externalIdentifier = `***${item.externalIdentifier.slice(-6)}`;
    return out;
  }
  create(userId, org, input) {
    this._access(userId, org, PERMISSIONS.SECRET_MANAGE);
    this.repository.getProject(userId, org, input.projectId);
    const env = [...this.repository.environments.values()].find(
      (x) =>
        x.id === input.environmentId &&
        x.organizationId === org &&
        x.projectId === input.projectId,
    );
    if (!env)
      throw new ControlPlaneError(
        404,
        "ENVIRONMENT_NOT_FOUND",
        "Environment not found",
      );
    if (!this.providers[input.providerType])
      throw new ControlPlaneError(
        400,
        "SECRET_PROVIDER_UNSUPPORTED",
        "Secret provider is unsupported",
      );
    const timestamp = now(),
      item = {
        id: `sec_${crypto.randomUUID()}`,
        organizationId: org,
        projectId: input.projectId,
        environmentId: input.environmentId,
        providerConnectionId: input.providerConnectionId || null,
        deploymentTargetId: input.deploymentTargetId || null,
        displayName: input.displayName,
        providerType: input.providerType,
        externalIdentifier: input.externalIdentifier,
        versionSelector: input.versionSelector || null,
        injectionKey: input.injectionKey,
        destination: input.destination || "environment",
        protected: Boolean(input.protected),
        status: "draft",
        validationCategory: null,
        referenceVersion: 1,
        version: 1,
        disabledAt: null,
        revokedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    this.references.set(item.id, item);
    return this._safe(item);
  }
  get(userId, org, id, permission = PERMISSIONS.SECRET_READ_METADATA) {
    this._access(userId, org, permission);
    const item = this.references.get(id);
    if (!item || item.organizationId !== org)
      throw new ControlPlaneError(
        404,
        "SECRET_REFERENCE_NOT_FOUND",
        "Secret reference not found",
      );
    return item;
  }
  list(userId, org) {
    this._access(userId, org, PERMISSIONS.SECRET_READ_METADATA);
    return [...this.references.values()]
      .filter((x) => x.organizationId === org)
      .map((x) => this._safe(x));
  }
  async validate(userId, org, id, expectedVersion) {
    const item = this.get(userId, org, id, PERMISSIONS.SECRET_MANAGE);
    if (item.status === "revoked")
      throw new ControlPlaneError(
        409,
        "SECRET_REFERENCE_REVOKED",
        "Secret reference is revoked",
      );
    if (item.version !== expectedVersion)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Secret reference changed concurrently",
      );
    const provider = this.providers[item.providerType];
    let connection = null,
      target = null;
    if (item.providerConnectionId)
      connection = this.byocStore.connection(
        userId,
        org,
        item.providerConnectionId,
      );
    if (item.deploymentTargetId)
      target = this.byocStore.target(userId, org, item.deploymentTargetId);
    try {
      const result = await provider.validateReference(item, {
        connection,
        target,
      });
      item.status = result.status;
      item.validationCategory = result.category;
      item.lastValidationAt = result.checkedAt;
      item.version++;
      item.updatedAt = now();
      return this._safe(item);
    } catch (error) {
      item.status = "invalid";
      item.validationCategory = error.code || "SECRET_VALIDATION_FAILED";
      item.lastValidationAt = now();
      item.version++;
      item.updatedAt = now();
      throw error;
    }
  }
  rotate(userId, org, id, input, expectedVersion) {
    const item = this.get(userId, org, id, PERMISSIONS.SECRET_MANAGE);
    if (item.status === "revoked")
      throw new ControlPlaneError(
        409,
        "SECRET_REFERENCE_REVOKED",
        "Secret reference is revoked",
      );
    if (item.version !== expectedVersion)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Secret reference changed concurrently",
      );
    if (input.externalIdentifier)
      item.externalIdentifier = input.externalIdentifier;
    if (Object.hasOwn(input, "versionSelector"))
      item.versionSelector = input.versionSelector || null;
    item.referenceVersion++;
    item.version++;
    item.status = "draft";
    item.lastValidationAt = null;
    item.updatedAt = now();
    return this._safe(item);
  }
  lifecycle(userId, org, id, action, expectedVersion) {
    const item = this.get(userId, org, id, PERMISSIONS.SECRET_MANAGE);
    if (item.status === "revoked")
      throw new ControlPlaneError(
        409,
        "SECRET_REFERENCE_REVOKED",
        "Secret reference is revoked",
      );
    if (item.version !== expectedVersion)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Secret reference changed concurrently",
      );
    item.status = action === "disable" ? "disabled" : "revoked";
    item.version++;
    item.updatedAt = now();
    if (action === "disable") item.disabledAt = now();
    else {
      item.revokedAt = now();
      item.externalIdentifier = "revoked";
    }
    return this._safe(item);
  }
  attach(userId, org, serviceId, ids, expectedVersion = 0) {
    this._access(userId, org, PERMISSIONS.SECRET_ATTACH);
    const service = this.repository.getService(userId, org, serviceId),
      current = this.attachments.get(serviceId) || {
        version: 0,
        references: [],
      };
    if (current.version !== expectedVersion)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Secret attachment changed concurrently",
      );
    const refs = ids.map((id) => this.get(userId, org, id));
    if (refs.some((x) => x.projectId !== service.projectId))
      throw new ControlPlaneError(
        403,
        "SECRET_PROJECT_SCOPE_MISMATCH",
        "Secret reference is outside the service project",
      );
    const value = {
      serviceId,
      organizationId: org,
      version: current.version + 1,
      references: [...new Set(ids)],
      updatedAt: now(),
    };
    this.attachments.set(serviceId, value);
    return structuredClone(value);
  }
  deploymentReferences(
    userId,
    org,
    { projectId, serviceId, environmentId, isPreview, forked },
  ) {
    this._access(userId, org, PERMISSIONS.SECRET_USE);
    const attached = this.attachments.get(serviceId)?.references || [];
    return attached
      .map((id) => this.get(userId, org, id))
      .map((x) => {
        if (x.status !== "active")
          throw new ControlPlaneError(
            409,
            "SECRET_REFERENCE_NOT_USABLE",
            "Secret reference is not active",
          );
        if (x.projectId !== projectId || x.environmentId !== environmentId)
          throw new ControlPlaneError(
            403,
            "SECRET_SCOPE_MISMATCH",
            "Secret reference scope does not match deployment",
          );
        if ((isPreview || forked) && x.protected)
          throw new ControlPlaneError(
            403,
            "PROTECTED_SECRET_PREVIEW_DENIED",
            "Protected secrets are unavailable to previews",
          );
        return {
          id: x.id,
          referenceVersion: x.referenceVersion,
          injectionKey: x.injectionKey,
          destination: x.destination,
          providerType: x.providerType,
        };
      });
  }
}
module.exports = { MemorySecretReferenceStore };
