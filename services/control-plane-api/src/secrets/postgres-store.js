const { randomUUID } = require('crypto');
const { ControlPlaneError } = require('../errors');
const { PERMISSIONS } = require('../auth/rbac');
const { withTransaction } = require('../database/transaction');
const { row } = require('../database/rows');
const { MemorySecretReferenceStore } = require('./store');

class PostgresSecretReferenceStore {
  constructor(repository, { pool = repository.pool, providers, byocStore }) {
    Object.assign(this, { repository, pool, providers, byocStore });
  }
  _safe(item) { return MemorySecretReferenceStore.prototype._safe(item); }
  async create(userId, org, input) {
    await this.repository.requireAccess(userId, org, PERMISSIONS.SECRET_MANAGE);
    await this.repository.getProject(userId, org, input.projectId);
    const env = await this.pool.query('SELECT id FROM environment_references WHERE id=$1 AND organization_id=$2 AND project_id=$3', [input.environmentId, org, input.projectId]);
    if (!env.rowCount) throw new ControlPlaneError(404, 'ENVIRONMENT_NOT_FOUND', 'Environment not found');
    if (!this.providers[input.providerType]) throw new ControlPlaneError(400, 'SECRET_PROVIDER_UNSUPPORTED', 'Secret provider is unsupported');
    if (input.providerConnectionId) await this.byocStore.connection(userId, org, input.providerConnectionId);
    if (input.deploymentTargetId) await this.byocStore.target(userId, org, input.deploymentTargetId);
    const result = await this.pool.query(`INSERT INTO secret_references
      (id,organization_id,project_id,environment_id,provider_connection_id,deployment_target_id,display_name,provider_type,external_identifier,version_selector,injection_key,destination,protected)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [randomUUID(), org, input.projectId, input.environmentId, input.providerConnectionId || null, input.deploymentTargetId || null, input.displayName, input.providerType, input.externalIdentifier, input.versionSelector || null, input.injectionKey, input.destination || 'environment', Boolean(input.protected)]);
    return this._safe(row(result.rows[0]));
  }
  async get(userId, org, id, permission = PERMISSIONS.SECRET_READ_METADATA) {
    await this.repository.requireAccess(userId, org, permission);
    const result = await this.pool.query('SELECT * FROM secret_references WHERE id=$1 AND organization_id=$2', [id, org]);
    if (!result.rowCount) throw new ControlPlaneError(404, 'SECRET_REFERENCE_NOT_FOUND', 'Secret reference not found');
    return row(result.rows[0]);
  }
  async list(userId, org) {
    await this.repository.requireAccess(userId, org, PERMISSIONS.SECRET_READ_METADATA);
    const result = await this.pool.query('SELECT * FROM secret_references WHERE organization_id=$1 ORDER BY created_at,id', [org]);
    return result.rows.map(x => this._safe(row(x)));
  }
  _check(item, version) {
    if (item.status === 'revoked') throw new ControlPlaneError(409, 'SECRET_REFERENCE_REVOKED', 'Secret reference is revoked');
    if (item.version !== version) throw new ControlPlaneError(409, 'VERSION_CONFLICT', 'Secret reference changed concurrently');
  }
  async _save(item, version) {
    const result = await this.pool.query(`UPDATE secret_references SET external_identifier=$3,version_selector=$4,
      status=$5,validation_category=$6,last_validation_at=$7,reference_version=$8,version=version+1,
      disabled_at=$9,revoked_at=$10,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND version=$11 RETURNING *`,
    [item.id, item.organizationId, item.externalIdentifier, item.versionSelector, item.status, item.validationCategory, item.lastValidationAt || null, item.referenceVersion, item.disabledAt, item.revokedAt, version]);
    if (!result.rowCount) throw new ControlPlaneError(409, 'VERSION_CONFLICT', 'Secret reference changed concurrently');
    return this._safe(row(result.rows[0]));
  }
  async validate(userId, org, id, expectedVersion) {
    const item = await this.get(userId, org, id, PERMISSIONS.SECRET_MANAGE);
    this._check(item, expectedVersion);
    const connection = item.providerConnectionId ? await this.byocStore.connection(userId, org, item.providerConnectionId) : null;
    const target = item.deploymentTargetId ? await this.byocStore.target(userId, org, item.deploymentTargetId) : null;
    let failure;
    try {
      const result = await this.providers[item.providerType].validateReference(item, { connection, target });
      item.status = result.status;
      item.validationCategory = result.category;
      item.lastValidationAt = result.checkedAt;
    } catch (error) {
      item.status = 'invalid'; item.validationCategory = error.code || 'SECRET_VALIDATION_FAILED';
      item.lastValidationAt = new Date().toISOString(); failure = error;
    }
    const saved = await this._save(item, expectedVersion);
    if (failure) throw failure;
    return saved;
  }
  async rotate(userId, org, id, input, version) {
    const item = await this.get(userId, org, id, PERMISSIONS.SECRET_MANAGE);
    this._check(item, version);
    if (input.externalIdentifier) item.externalIdentifier = input.externalIdentifier;
    if (Object.hasOwn(input, 'versionSelector')) item.versionSelector = input.versionSelector || null;
    item.referenceVersion++; item.status = 'draft'; item.lastValidationAt = null;
    return this._save(item, version);
  }
  async lifecycle(userId, org, id, action, version) {
    const item = await this.get(userId, org, id, PERMISSIONS.SECRET_MANAGE);
    this._check(item, version);
    item.status = action === 'disable' ? 'disabled' : 'revoked';
    if (action === 'disable') item.disabledAt = new Date().toISOString();
    else { item.revokedAt = new Date().toISOString(); item.externalIdentifier = 'revoked'; }
    return this._save(item, version);
  }
  async attach(userId, org, serviceId, ids, expectedVersion = 0) {
    await this.repository.requireAccess(userId, org, PERMISSIONS.SECRET_ATTACH);
    const service = await this.repository.getService(userId, org, serviceId);
    const refs = [];
    for (const id of new Set(ids)) {
      const ref = await this.get(userId, org, id);
      if (ref.projectId !== service.projectId) throw new ControlPlaneError(403, 'SECRET_PROJECT_SCOPE_MISMATCH', 'Secret reference is outside the service project');
      refs.push(ref);
    }
    return withTransaction(this.pool, async client => {
      const updated = await client.query(`UPDATE services SET secret_attachment_version=secret_attachment_version+1
        WHERE id=$1 AND organization_id=$2 AND secret_attachment_version=$3 RETURNING secret_attachment_version`, [serviceId, org, expectedVersion]);
      if (!updated.rowCount) throw new ControlPlaneError(409, 'VERSION_CONFLICT', 'Secret attachment changed concurrently');
      const version = Number(updated.rows[0].secret_attachment_version);
      await client.query('DELETE FROM service_secret_references WHERE service_id=$1 AND organization_id=$2', [serviceId, org]);
        for (const ref of refs) await client.query(`INSERT INTO service_secret_references(organization_id,service_id,secret_reference_id,reference_version,attachment_version)
          VALUES($1,$2,$3,$4,$5)`, [org, serviceId, ref.id, ref.referenceVersion, version]);
        if (this.repository.auditService?.appendInTransaction) await this.repository.auditService.appendInTransaction(client, {
          organizationId: org, actorId: userId, action: 'secret.attachments.changed', resourceType: 'service', resourceId: serviceId,
          result: 'success', sourceCategory: 'secrets', idempotencyKey: `secret-attachments:${serviceId}:${version}`, metadata: { version, referenceCount: refs.length },
        });
        return { serviceId, organizationId: org, version, references: refs.map(x => x.id), updatedAt: new Date().toISOString() };
    });
  }
  async deploymentReferences(userId, org, { projectId, serviceId, environmentId, isPreview, forked }) {
    await this.repository.requireAccess(userId, org, PERMISSIONS.SECRET_USE);
    const service = await this.repository.getService(userId, org, serviceId);
    if (service.projectId !== projectId) throw new ControlPlaneError(403, 'SECRET_SCOPE_MISMATCH', 'Secret reference scope does not match deployment');
    const result = await this.pool.query(`SELECT r.* FROM service_secret_references a JOIN secret_references r
      ON r.id=a.secret_reference_id AND r.organization_id=a.organization_id WHERE a.organization_id=$1 AND a.service_id=$2`, [org, serviceId]);
    return result.rows.map(row).map(x => {
      if (x.status !== 'active') throw new ControlPlaneError(409, 'SECRET_REFERENCE_NOT_USABLE', 'Secret reference is not active');
      if (x.projectId !== projectId || x.environmentId !== environmentId) throw new ControlPlaneError(403, 'SECRET_SCOPE_MISMATCH', 'Secret reference scope does not match deployment');
      if ((isPreview || forked) && x.protected) throw new ControlPlaneError(403, 'PROTECTED_SECRET_PREVIEW_DENIED', 'Protected secrets are unavailable to previews');
      return { id: x.id, referenceVersion: x.referenceVersion, injectionKey: x.injectionKey, destination: x.destination, providerType: x.providerType };
    });
  }
}
module.exports = { PostgresSecretReferenceStore };
