const crypto = require('crypto');
const { ControlPlaneError } = require('../errors');
const { PERMISSIONS } = require('../auth/rbac');
const { withTransaction } = require('../database/transaction');
const { row } = require('../database/rows');
const { encryptCredential, decryptCredential } = require('./security');
const { MemoryByocStore } = require('./store');
const hash = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const now = () => new Date().toISOString();
const fail = (code, message, status = 409) => { throw new ControlPlaneError(status, code, message); };

class PostgresByocStore {
  constructor(repository, { pool = repository.pool, awsProvider, kubernetesProvider, encryptionKey }) {
    Object.assign(this, { repository, pool, awsProvider, kubernetesProvider, encryptionKey });
  }
  _safe(x) {
    const safe = MemoryByocStore.prototype._safe(x);
    delete safe.externalIdCiphertext; delete safe.externalIdHash; delete safe.idempotencyKeyHash;
    return safe;
  }
  _transition(...args) { return MemoryByocStore.prototype._transition.apply(this, args); }
  providers() { return MemoryByocStore.prototype.providers.call(this); }
  async createAws(actor, org, input, key) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.CLOUD_CONNECTION_MANAGE);
    const prior = await this.pool.query('SELECT * FROM provider_connections WHERE organization_id=$1 AND idempotency_key_hash=$2', [org, hash(key)]);
    if (prior.rowCount) return { connection: this._safe(row(prior.rows[0])), created: false };
    const checked = this.awsProvider.validateConfiguration(input), externalId = crypto.randomBytes(32).toString('base64url');
    const encrypted = encryptCredential(externalId, this.encryptionKey);
    const r = await this.pool.query(`INSERT INTO provider_connections(id,organization_id,display_name,provider_type,role_arn,expected_account_id,
      external_id_ciphertext,external_id_hash,permitted_regions,enabled_capabilities,idempotency_key_hash)
      VALUES($1,$2,$3,'aws',$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(organization_id,idempotency_key_hash) DO NOTHING RETURNING *`,
    [crypto.randomUUID(), org, input.displayName, checked.roleArn, checked.expectedAccountId, Buffer.from(JSON.stringify(encrypted)), hash(externalId), JSON.stringify(checked.permittedRegions), JSON.stringify(input.enabledCapabilities || ['identity']), hash(key)]);
    if (!r.rowCount) return { connection: this._safe(row((await this.pool.query('SELECT * FROM provider_connections WHERE organization_id=$1 AND idempotency_key_hash=$2', [org, hash(key)])).rows[0])), created: false };
    const item = row(r.rows[0]);
    return { connection: this._safe(item), trustPolicy: this.awsProvider.trustPolicy({ ...item, externalId }), created: true };
  }
  async listConnections(actor, org) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.CLOUD_CONNECTION_READ);
    return (await this.pool.query('SELECT * FROM provider_connections WHERE organization_id=$1 ORDER BY created_at,id', [org])).rows.map(x => this._safe(row(x)));
  }
  async connection(actor, org, id, permission = PERMISSIONS.CLOUD_CONNECTION_READ) {
    await this.repository.requireAccess(actor, org, permission);
    const r = await this.pool.query('SELECT * FROM provider_connections WHERE id=$1 AND organization_id=$2', [id, org]);
    if (!r.rowCount) fail('PROVIDER_CONNECTION_NOT_FOUND', 'Provider connection not found', 404);
    // Decryption is confined to validation, never to metadata/API reads.
    return this._safe(row(r.rows[0]));
  }
  async _saveConnection(client, x, version) {
    const r = await client.query(`UPDATE provider_connections SET role_arn=$3,expected_account_id=$4,permitted_regions=$5,status=$6,
      last_validation_at=$7,last_successful_validation_at=$8,validation_error_category=$9,configuration_version=$10,version=$11,
      disabled_at=$12,revoked_at=$13,actual_account_id=$14,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND version=$15 RETURNING id`,
    [x.id, x.organizationId, x.roleArn, x.expectedAccountId, JSON.stringify(x.permittedRegions), x.status, x.lastValidationAt, x.lastSuccessfulValidationAt, x.validationErrorCategory, x.configurationVersion, x.version, x.disabledAt, x.revokedAt, x.actualAccountId || null, version]);
    if (!r.rowCount) fail('VERSION_CONFLICT', 'Connection changed concurrently');
  }
  async updateAws(actor, org, id, input, version) {
    const x = await this.connection(actor, org, id, PERMISSIONS.CLOUD_CONNECTION_MANAGE);
    if (x.status === 'revoked') fail('CONNECTION_REVOKED', 'Revoked connections cannot be changed');
    const checked = this.awsProvider.validateConfiguration({ roleArn: input.roleArn || x.roleArn, expectedAccountId: input.expectedAccountId || x.expectedAccountId, permittedRegions: input.permittedRegions || x.permittedRegions });
    if (x.version !== version) fail('VERSION_CONFLICT', 'Connection changed concurrently');
    Object.assign(x, checked, { status: 'draft', configurationVersion: x.configurationVersion + 1, version: version + 1, updatedAt: now(), lastValidationAt: null, validationErrorCategory: null });
    await this._saveConnection(this.pool, x, version); return this._safe(x);
  }
  async lifecycle(actor, org, id, action, version) {
    const x = await this.connection(actor, org, id, PERMISSIONS.CLOUD_CONNECTION_MANAGE);
    this._transition(x, action === 'disable' ? 'disabled' : 'revoked', version);
    await this._saveConnection(this.pool, x, version); return this._safe(x);
  }
  async _credential(client, org, id, version, encrypted) {
    if (!encrypted) return;
    await client.query(`INSERT INTO credential_versions(id,organization_id,deployment_target_id,version,encryption_algorithm,encrypted_payload,nonce,authentication_tag)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [crypto.randomUUID(), org, id, version, encrypted.algorithm, Buffer.from(encrypted.ciphertext, 'base64'), Buffer.from(encrypted.iv, 'base64'), Buffer.from(encrypted.tag, 'base64')]);
  }
  async createKubernetesTarget(actor, org, input, key) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.DEPLOYMENT_TARGET_MANAGE);
    const prior = await this.pool.query('SELECT * FROM deployment_targets WHERE organization_id=$1 AND idempotency_key_hash=$2', [org, hash(key)]);
    if (prior.rowCount) return { target: this._targetRow(prior.rows[0]), created: false };
    if (!input.serviceAccountToken && input.authenticationMethod === 'service_account_token') fail('KUBERNETES_CREDENTIAL_REQUIRED', 'Kubernetes credential is required', 400);
    const encrypted = input.serviceAccountToken ? encryptCredential(input.serviceAccountToken, this.encryptionKey) : null;
    if (input.providerConnectionId) await this.connection(actor, org, input.providerConnectionId);
    return withTransaction(this.pool, async client => {
      const r = await client.query(`INSERT INTO deployment_targets(id,organization_id,provider_connection_id,name,target_type,cluster_fingerprint,api_server_origin,allowed_namespaces,allowed_environments,authentication_method,idempotency_key_hash)
        VALUES($1,$2,$3,$4,'kubernetes',$5,$6,$7,$8,$9,$10) ON CONFLICT(organization_id,idempotency_key_hash) DO NOTHING RETURNING *`,
      [crypto.randomUUID(), org, input.providerConnectionId || null, input.name, input.clusterFingerprint || null, input.apiServerOrigin, JSON.stringify([...new Set(input.allowedNamespaces || [])]), JSON.stringify([...new Set(input.allowedEnvironments || [])]), input.authenticationMethod, hash(key)]);
      if (!r.rowCount) return { target: this._targetRow((await client.query('SELECT * FROM deployment_targets WHERE organization_id=$1 AND idempotency_key_hash=$2', [org, hash(key)])).rows[0]), created: false };
      await this._credential(client, org, r.rows[0].id, 1, encrypted);
      return { target: this._targetRow(r.rows[0]), created: true };
    });
  }
  _targetRow(raw) { const x = this._safe(row(raw)); x.providerType = x.targetType; delete x.targetType; return x; }
  async listTargets(actor, org, { usable = false } = {}) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.DEPLOYMENT_TARGET_READ);
    return (await this.pool.query(`SELECT * FROM deployment_targets WHERE organization_id=$1 AND (NOT $2 OR status='active') ORDER BY created_at,id`, [org, usable])).rows.map(x => this._targetRow(x));
  }
  async target(actor, org, id, permission = PERMISSIONS.DEPLOYMENT_TARGET_READ) {
    await this.repository.requireAccess(actor, org, permission);
    const r = await this.pool.query('SELECT * FROM deployment_targets WHERE id=$1 AND organization_id=$2', [id, org]);
    if (!r.rowCount) fail('DEPLOYMENT_TARGET_NOT_FOUND', 'Deployment target not found', 404);
    return this._targetRow(r.rows[0]);
  }
  async _saveTarget(client, x, version) {
    const r = await client.query(`UPDATE deployment_targets SET status=$3,credential_version=$4,version=$5,kubernetes_version=$6,
      capability_results=$7,permission_validation=$8,connection_health=$9,last_validation_at=$10,last_successful_validation_at=$11,
      validation_error_category=$12,disabled_at=$13,revoked_at=$14,cluster_fingerprint=$15,updated_at=NOW()
      WHERE id=$1 AND organization_id=$2 AND version=$16 RETURNING id`,
    [x.id, x.organizationId, x.status, x.credentialVersion, x.version, x.kubernetesVersion, x.capabilityResults, x.permissionValidation, x.connectionHealth, x.lastValidationAt, x.lastSuccessfulValidationAt, x.validationErrorCategory || null, x.disabledAt, x.revokedAt, x.clusterFingerprint, version]);
    if (!r.rowCount) fail('VERSION_CONFLICT', 'Deployment target changed concurrently');
  }
  async rotateTargetCredential(actor, org, id, token, version) {
    const x = await this.target(actor, org, id, PERMISSIONS.DEPLOYMENT_TARGET_MANAGE);
    if (x.status === 'revoked') fail('TARGET_REVOKED', 'Revoked targets cannot rotate credentials');
    if (x.version !== version) fail('VERSION_CONFLICT', 'Deployment target changed concurrently');
    const encrypted = encryptCredential(token, this.encryptionKey);
    x.credentialVersion++; x.version++; x.status = 'draft'; x.updatedAt = now();
    await withTransaction(this.pool, async client => {
      await this._saveTarget(client, x, version);
      await client.query('UPDATE credential_versions SET revoked_at=NOW(),rotated_at=NOW() WHERE deployment_target_id=$1 AND organization_id=$2 AND revoked_at IS NULL', [id, org]);
      await this._credential(client, org, id, x.credentialVersion, encrypted);
    });
    return this._safe(x);
  }
  async targetLifecycle(actor, org, id, action, version) {
    const x = await this.target(actor, org, id, PERMISSIONS.DEPLOYMENT_TARGET_MANAGE);
    this._transition(x, action === 'disable' ? 'disabled' : 'revoked', version);
    await withTransaction(this.pool, async client => {
      await this._saveTarget(client, x, version);
      if (x.status === 'revoked') await client.query('UPDATE credential_versions SET revoked_at=NOW() WHERE deployment_target_id=$1 AND organization_id=$2 AND revoked_at IS NULL', [id, org]);
    });
    return this._safe(x);
  }
  async assertTargetUsable(actor, org, id, options) {
    const target = await this.target(actor, org, id, PERMISSIONS.DEPLOYMENT_CREATE);
    return MemoryByocStore.prototype.assertTargetUsable.call({ target: () => target }, actor, org, id, options);
  }
  async validateAws(actor, org, id, version) { return this._validate(actor, org, id, version, false); }
  async validateTarget(actor, org, id, version) { return this._validate(actor, org, id, version, true); }
  async recoverInterruptedValidations(staleSeconds = 60) {
    if (!Number.isSafeInteger(staleSeconds) || staleSeconds < 60) throw new Error('Validation recovery grace must be at least 60 seconds');
    return withTransaction(this.pool, async c => {
      const attempts = await c.query("SELECT * FROM connection_validation_attempts WHERE status='running' AND started_at<NOW()-$1*INTERVAL '1 second' FOR UPDATE SKIP LOCKED", [staleSeconds]);
      for (const a of attempts.rows) {
        const target = Boolean(a.deployment_target_id);
        // Identifiers are selected from these two fixed internal table names only.
        const table = target ? 'deployment_targets' : 'provider_connections';
        await c.query(`UPDATE ${table} SET status='invalid',validation_error_category='VALIDATION_INTERRUPTED',version=version+1,updated_at=NOW()
          WHERE id=$1 AND organization_id=$2 AND status='validating' AND last_validation_at< NOW()-$3*INTERVAL '1 second'`, [a.deployment_target_id || a.provider_connection_id, a.organization_id, staleSeconds]);
        await c.query("UPDATE connection_validation_attempts SET status='failed',error_category='VALIDATION_INTERRUPTED',retryable=true,completed_at=NOW() WHERE id=$1 AND organization_id=$2", [a.id, a.organization_id]);
      }
      return attempts.rowCount;
    });
  }
  async _validate(actor, org, id, version, target) {
    version = Number(version);
    const x = target ? await this.target(actor, org, id, PERMISSIONS.DEPLOYMENT_TARGET_MANAGE) : await this.connection(actor, org, id, PERMISSIONS.CLOUD_CONNECTION_MANAGE);
    if (['disabled', 'revoked'].includes(x.status)) fail(target ? 'TARGET_NOT_USABLE' : 'CONNECTION_NOT_USABLE', 'Connection is disabled or revoked');
    if (x.status === 'validating') fail('VALIDATION_ALREADY_RUNNING', 'Connection validation is already running');
    this._transition(x, 'validating', version); x.lastValidationAt = now();
    const attemptId = crypto.randomUUID();
    const save = (client, expected) => target ? this._saveTarget(client, x, expected) : this._saveConnection(client, x, expected);
    await withTransaction(this.pool, async client => {
      await save(client, version);
      await client.query(`INSERT INTO connection_validation_attempts(id,organization_id,provider_connection_id,deployment_target_id,status)
        VALUES($1,$2,$3,$4,'running')`, [attemptId, org, target ? null : id, target ? id : null]);
    });
    let failure, capabilities;
    try {
      if (target) {
        const r = await this.pool.query('SELECT * FROM credential_versions WHERE deployment_target_id=$1 AND organization_id=$2 AND version=$3 AND revoked_at IS NULL', [id, org, x.credentialVersion]);
        const c = r.rows[0];
        const credential = c ? decryptCredential({ iv: c.nonce.toString('base64'), ciphertext: c.encrypted_payload.toString('base64'), tag: c.authentication_tag.toString('base64') }, this.encryptionKey) : null;
        const result = await this.kubernetesProvider.validateTarget(x, credential);
        Object.assign(x, result); capabilities = this.kubernetesProvider.capabilities();
      } else {
        const r = await this.pool.query('SELECT external_id_ciphertext FROM provider_connections WHERE id=$1 AND organization_id=$2', [id, org]);
        const externalId = decryptCredential(JSON.parse(r.rows[0].external_id_ciphertext.toString()), this.encryptionKey);
        const identity = await this.awsProvider.validateIdentity({ ...x, externalId });
        x.actualAccountId = identity.accountId; capabilities = this.awsProvider.capabilities();
      }
      this._transition(x, 'active', x.version); x.lastSuccessfulValidationAt = now(); x.validationErrorCategory = null;
    } catch (error) {
      failure = error; this._transition(x, 'invalid', x.version);
      x.validationErrorCategory = error.code || (target ? 'KUBERNETES_CONNECTION_FAILED' : 'AWS_CONNECTION_FAILED');
      if (target) x.connectionHealth = 'unhealthy';
    }
    await withTransaction(this.pool, async client => {
      await save(client, version + 1);
      await client.query(`UPDATE connection_validation_attempts SET status=$3,error_category=$4,retryable=$5,completed_at=NOW()
        WHERE id=$1 AND organization_id=$2`, [attemptId, org, failure ? 'failed' : 'passed', x.validationErrorCategory, failure ? Boolean(failure.retryable) : null]);
      if (!failure) {
        await client.query('DELETE FROM connection_capabilities WHERE organization_id=$1 AND (provider_connection_id=$2 OR deployment_target_id=$3)', [org, target ? null : id, target ? id : null]);
        for (const c of capabilities || []) await client.query(`INSERT INTO connection_capabilities(id,organization_id,provider_connection_id,deployment_target_id,capability,support_level,enabled,evidence,metadata)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [crypto.randomUUID(), org, target ? null : id, target ? id : null, c.id, c.supportLevel, c.enabled !== false, c.evidence || 'validated', c.metadata || {}]);
      }
    });
    if (failure) throw failure;
    return this._safe(x);
  }
}
module.exports = { PostgresByocStore };
