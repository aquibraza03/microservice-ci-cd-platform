const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const { PERMISSIONS } = require("../auth/rbac");
const id = (p) => `${p}_${crypto.randomUUID()}`,
  now = () => new Date().toISOString();
function publicDraft(d) {
  const copy = structuredClone(d);
  delete copy.configuration?.secretValues;
  delete copy.configuration?.secrets;
  return copy;
}
class MemoryConfigurationStore {
  constructor(repository) {
    this.repository = repository;
    this.detections = new Map();
    this.drafts = new Map();
    this.configurations = new Map();
  }
  async createDetection(
    userId,
    organizationId,
    projectId,
    repositoryId,
    result,
    idempotencyKey,
  ) {
    await this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    await this.repository.getProject(userId, organizationId, projectId);
    await this.repository.getProviderRepository(
      userId,
      organizationId,
      repositoryId,
    );
    const key = `${organizationId}:${repositoryId}:${result.commitSha}:${idempotencyKey || ""}`;
    for (const d of this.detections.values()) if (d.key === key) return d;
    const entity = {
      id: id("det"),
      key,
      organizationId,
      projectId,
      repositoryId,
      commitSha: result.commitSha,
      status: "completed",
      result,
      createdBy: userId,
      createdAt: now(),
    };
    this.detections.set(entity.id, entity);
    return entity;
  }
  async getDetection(userId, organizationId, idValue) {
    await this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.OBSERVE,
    );
    const d = this.detections.get(idValue);
    if (!d || d.organizationId !== organizationId)
      throw new ControlPlaneError(
        404,
        "DETECTION_NOT_FOUND",
        "Detection not found",
      );
    return d;
  }
  async saveDraft(userId, organizationId, projectId, input, expectedVersion) {
    await this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    await this.repository.getProject(userId, organizationId, projectId);
    const key = `${organizationId}:${projectId}:${userId}`;
    const current = this.drafts.get(key);
    if (current && expectedVersion !== current.version)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Configuration draft was modified",
      );
    if (!current && expectedVersion !== 0)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Configuration draft was modified",
      );
    const entity = {
      id: current?.id || id("draft"),
      organizationId,
      projectId,
      repositoryId: input.repositoryId,
      commitSha: input.commitSha,
      candidateId: input.candidateId,
      configuration: input.configuration,
      validation: input.validation || null,
      version: (current?.version || 0) + 1,
      createdBy: userId,
      createdAt: current?.createdAt || now(),
      updatedAt: now(),
    };
    this.drafts.set(key, entity);
    return publicDraft(entity);
  }
  async getDraft(userId, organizationId, projectId) {
    await this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.OBSERVE,
    );
    const d = this.drafts.get(`${organizationId}:${projectId}:${userId}`);
    return d ? publicDraft(d) : null;
  }
  async saveConfiguration(
    userId,
    organizationId,
    projectId,
    input,
    validation,
    yamlText,
  ) {
    await this.repository.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    if (!validation.valid)
      throw new ControlPlaneError(
        400,
        "CONFIGURATION_INVALID",
        "Invalid configuration cannot be saved",
      );
    const detection = await this.getDetection(
      userId,
      organizationId,
      input.detectionId,
    );
    if (
      detection.projectId !== projectId ||
      detection.repositoryId !== input.repositoryId
    )
      throw new ControlPlaneError(
        404,
        "DETECTION_NOT_FOUND",
        "Detection not found",
      );
    if (detection.commitSha !== input.commitSha)
      throw new ControlPlaneError(
        409,
        "COMMIT_DRIFT",
        "Repository commit changed; run detection again",
      );
    const candidate = detection.result.candidates.find(
      (c) => c.id === input.candidateId,
    );
    if (!candidate)
      throw new ControlPlaneError(
        400,
        "CANDIDATE_INVALID",
        "Candidate does not belong to this detection",
      );
    if (candidate.requiresConfirmation && !input.confirmConflicts)
      throw new ControlPlaneError(
        409,
        "DETECTION_CONFIRMATION_REQUIRED",
        "Detection conflicts require confirmation",
      );
    const entity = {
      id: id("cfg"),
      organizationId,
      projectId,
      repositoryId: input.repositoryId,
      commitSha: input.commitSha,
      candidateId: input.candidateId,
      configuration: input.configuration,
      generatedServiceYaml: yamlText,
      version: 1,
      createdBy: userId,
      createdAt: now(),
      updatedAt: now(),
    };
    this.configurations.set(entity.id, entity);
    return publicDraft(entity);
  }
}
module.exports = { MemoryConfigurationStore, publicDraft };
