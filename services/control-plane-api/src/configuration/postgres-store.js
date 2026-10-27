const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const { PERMISSIONS } = require("../auth/rbac");
const { publicDraft } = require("./store");
const id = () => crypto.randomUUID();
class PostgresConfigurationStore {
  constructor(repository, pool) {
    this.repository = repository;
    this.pool = pool;
  }
  async createDetection(userId, org, project, repo, result, key) {
    await this.repository.requireAccess(
      userId,
      org,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    await this.repository.getProject(userId, org, project);
    await this.repository.getProviderRepository(userId, org, repo);
    const r = await this.pool.query(
      `INSERT INTO repository_detection_runs(id,organization_id,project_id,repository_id,commit_sha,engine_version,status,result,created_by,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,'completed',$7,$8,$9) ON CONFLICT(organization_id,repository_id,commit_sha,idempotency_key) DO UPDATE SET id=repository_detection_runs.id RETURNING id,organization_id AS "organizationId",project_id AS "projectId",repository_id AS "repositoryId",commit_sha AS "commitSha",status,result,created_by AS "createdBy",created_at AS "createdAt"`,
      [
        id("det"),
        org,
        project,
        repo,
        result.commitSha,
        result.detectionEngineVersion,
        result,
        userId,
        key || "",
      ],
    );
    return r.rows[0];
  }
  async getDetection(userId, org, detectionId) {
    await this.repository.requireAccess(userId, org, PERMISSIONS.OBSERVE);
    const r = await this.pool.query(
      `SELECT id,organization_id AS "organizationId",project_id AS "projectId",repository_id AS "repositoryId",commit_sha AS "commitSha",status,result,created_by AS "createdBy",created_at AS "createdAt" FROM repository_detection_runs WHERE id=$1 AND organization_id=$2`,
      [detectionId, org],
    );
    if (!r.rowCount)
      throw new ControlPlaneError(
        404,
        "DETECTION_NOT_FOUND",
        "Detection not found",
      );
    return r.rows[0];
  }
  async saveDraft(userId, org, project, input, version) {
    await this.repository.requireAccess(
      userId,
      org,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    await this.repository.getProject(userId, org, project);
    const r = await this.pool.query(
      `INSERT INTO service_configuration_drafts(id,organization_id,project_id,user_id,repository_id,commit_sha,candidate_id,configuration,validation,version) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,1 WHERE $10=0 ON CONFLICT(organization_id,project_id,user_id) DO UPDATE SET repository_id=EXCLUDED.repository_id,commit_sha=EXCLUDED.commit_sha,candidate_id=EXCLUDED.candidate_id,configuration=EXCLUDED.configuration,validation=EXCLUDED.validation,version=service_configuration_drafts.version+1,updated_at=NOW() WHERE service_configuration_drafts.version=$10 RETURNING id,organization_id AS "organizationId",project_id AS "projectId",repository_id AS "repositoryId",commit_sha AS "commitSha",candidate_id AS "candidateId",configuration,validation,version,created_at AS "createdAt",updated_at AS "updatedAt"`,
      [
        id("draft"),
        org,
        project,
        userId,
        input.repositoryId,
        input.commitSha,
        input.candidateId,
        input.configuration,
        input.validation || null,
        version,
      ],
    );
    if (!r.rowCount)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Configuration draft was modified",
      );
    return publicDraft(r.rows[0]);
  }
  async getDraft(userId, org, project) {
    await this.repository.requireAccess(userId, org, PERMISSIONS.OBSERVE);
    const r = await this.pool.query(
      `SELECT id,organization_id AS "organizationId",project_id AS "projectId",repository_id AS "repositoryId",commit_sha AS "commitSha",candidate_id AS "candidateId",configuration,validation,version,created_at AS "createdAt",updated_at AS "updatedAt" FROM service_configuration_drafts WHERE organization_id=$1 AND project_id=$2 AND user_id=$3`,
      [org, project, userId],
    );
    return r.rowCount ? publicDraft(r.rows[0]) : null;
  }
  async saveConfiguration(userId, org, project, input, validation, yaml) {
    await this.repository.requireAccess(
      userId,
      org,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    if (!validation.valid)
      throw new ControlPlaneError(
        400,
        "CONFIGURATION_INVALID",
        "Invalid configuration cannot be saved",
      );
    const d = await this.getDetection(userId, org, input.detectionId);
    if (d.projectId !== project || d.repositoryId !== input.repositoryId)
      throw new ControlPlaneError(
        404,
        "DETECTION_NOT_FOUND",
        "Detection not found",
      );
    if (d.commitSha !== input.commitSha)
      throw new ControlPlaneError(
        409,
        "COMMIT_DRIFT",
        "Repository commit changed; run detection again",
      );
    const c = d.result.candidates.find((x) => x.id === input.candidateId);
    if (!c)
      throw new ControlPlaneError(
        400,
        "CANDIDATE_INVALID",
        "Candidate does not belong to this detection",
      );
    if (c.requiresConfirmation && !input.confirmConflicts)
      throw new ControlPlaneError(
        409,
        "DETECTION_CONFIRMATION_REQUIRED",
        "Detection conflicts require confirmation",
      );
    const r = await this.pool.query(
      `INSERT INTO service_configurations(id,organization_id,project_id,repository_id,commit_sha,candidate_id,configuration,generated_service_yaml,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,organization_id AS "organizationId",project_id AS "projectId",repository_id AS "repositoryId",commit_sha AS "commitSha",candidate_id AS "candidateId",configuration,generated_service_yaml AS "generatedServiceYaml",version,created_by AS "createdBy",created_at AS "createdAt",updated_at AS "updatedAt"`,
      [
        id("cfg"),
        org,
        project,
        input.repositoryId,
        input.commitSha,
        input.candidateId,
        input.configuration,
        yaml,
        userId,
      ],
    );
    return publicDraft(r.rows[0]);
  }
}
module.exports = { PostgresConfigurationStore };
