const crypto = require('crypto');
const { ControlPlaneError } = require('../errors');
const { PERMISSIONS } = require('../auth/rbac');
const { withTransaction } = require('../database/transaction');
const { row } = require('../database/rows');
const { normalizeHostname, previewHostname, isolationKey } = require('./hostname');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const fail = (code, message, status = 409) => { throw new ControlPlaneError(status, code, message); };

class PostgresPreviewStore {
  constructor(repository, { pool = repository.pool, baseDomain = 'preview.local', challengeTtlMs = 900000, previewTtlMs = 86400000 } = {}) {
    Object.assign(this, { repository, pool, baseDomain, challengeTtlMs, previewTtlMs });
  }
  async _resources(actor, org, input) {
    await this.repository.getProject(actor, org, input.projectId);
    const service = await this.repository.getService(actor, org, input.serviceId);
    if (service.projectId !== input.projectId) fail('PREVIEW_RESOURCE_NOT_FOUND', 'Preview resources not found', 404);
    if (input.repositoryId) {
      const repo = await this.repository.getProviderRepository(actor, org, input.repositoryId);
      if (service.repositoryId !== repo.id || repo.projectId !== input.projectId) fail('PREVIEW_RESOURCE_NOT_FOUND', 'Preview resources not found', 404);
    }
  }
  async policy(actor, org, input) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    await this._resources(actor, org, input);
    const r = await this.pool.query(`INSERT INTO preview_policies(id,organization_id,project_id,service_id,repository_id,enabled,ttl_seconds,max_cpu_millicores,max_memory_mebibytes,max_storage_mebibytes,allow_fork_previews,created_by,branch,configuration_snapshot)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT(organization_id,project_id,service_id) DO UPDATE SET repository_id=EXCLUDED.repository_id,enabled=EXCLUDED.enabled,ttl_seconds=EXCLUDED.ttl_seconds,
      max_cpu_millicores=EXCLUDED.max_cpu_millicores,max_memory_mebibytes=EXCLUDED.max_memory_mebibytes,max_storage_mebibytes=EXCLUDED.max_storage_mebibytes,
      allow_fork_previews=EXCLUDED.allow_fork_previews,created_by=EXCLUDED.created_by,branch=EXCLUDED.branch,configuration_snapshot=EXCLUDED.configuration_snapshot,updated_at=NOW() RETURNING *`,
    [crypto.randomUUID(), org, input.projectId, input.serviceId, input.repositoryId, input.enabled !== false, Math.min(Math.max(input.ttlSeconds || 86400, 300), 604800), Math.min(input.maxCpuMillicores || 500, 1000), Math.min(input.maxMemoryMebibytes || 512, 1024), Math.min(input.maxStorageMebibytes || 1024, 2048), input.allowForkPreviews !== false, actor, input.branch || 'main', input.configurationSnapshot || {}]);
    return row(r.rows[0]);
  }
  async getPolicy(org, serviceId) { return row((await this.pool.query('SELECT * FROM preview_policies WHERE organization_id=$1 AND service_id=$2', [org, serviceId])).rows[0]); }
  async eventPolicy(org, repositoryId) { return row((await this.pool.query('SELECT * FROM preview_policies WHERE organization_id=$1 AND repository_id=$2 AND enabled ORDER BY created_at,id LIMIT 1', [org, repositoryId])).rows[0]); }
  async eventPreview(org, repositoryId, pr) { return row((await this.pool.query(`SELECT * FROM preview_instances WHERE organization_id=$1 AND repository_id=$2 AND pull_request_number IS NOT DISTINCT FROM $3 AND lifecycle_status<>'removed' ORDER BY created_at,id LIMIT 1`, [org, repositoryId, pr ?? null])).rows[0]); }
  async create(actor, org, input, key) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.DEPLOYMENT_CREATE);
    const policy = await this.getPolicy(org, input.serviceId);
    if (!policy?.enabled) fail('PREVIEW_POLICY_DISABLED', 'Preview policy is unavailable');
    await this._resources(actor, org, input);
    if (policy.projectId !== input.projectId || policy.repositoryId !== input.repositoryId) fail('PREVIEW_RESOURCE_NOT_FOUND', 'Preview resources not found', 404);
    if (!/^[a-f0-9]{40,64}$/i.test(input.commitSha)) fail('COMMIT_SHA_INVALID', 'An immutable commit SHA is required', 400);
    if (input.forked && !input.providerTrustVerified) fail('FORK_TRUST_UNVERIFIED', 'Fork trust requires verified provider metadata', 403);
    if (input.deploymentId) {
      const d = await this.pool.query('SELECT id FROM deployments WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND service_id=$4', [input.deploymentId, org, input.projectId, input.serviceId]);
      if (!d.rowCount) fail('PREVIEW_RESOURCE_NOT_FOUND', 'Preview resources not found', 404);
    }
    return withTransaction(this.pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`preview:${org}:${input.serviceId}:${input.pullRequestNumber ?? 'manual'}`]);
      const duplicate = await client.query('SELECT * FROM preview_revisions WHERE organization_id=$1 AND idempotency_key=$2', [org, `${org}:${key}`]);
      if (duplicate.rowCount) {
        const revision = row(duplicate.rows[0]);
        const p = await client.query('SELECT * FROM preview_instances WHERE id=$1 AND organization_id=$2', [revision.previewId, org]);
        return { preview: row(p.rows[0]), revision, created: false };
      }
      let p = row((await client.query(`SELECT * FROM preview_instances WHERE organization_id=$1 AND service_id=$2 AND pull_request_number IS NOT DISTINCT FROM $3 AND lifecycle_status<>'removed'`, [org, input.serviceId, input.pullRequestNumber ?? null])).rows[0]);
      if (!p) {
        const r = await client.query(`INSERT INTO preview_instances(id,organization_id,project_id,service_id,repository_id,pull_request_number,isolation_key,generated_hostname,lifecycle_status,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING *`,
        [crypto.randomUUID(), org, input.projectId, input.serviceId, input.repositoryId, input.pullRequestNumber ?? null, isolationKey({ organizationId: org, serviceId: input.serviceId, prNumber: input.pullRequestNumber, commitSha: input.commitSha }), previewHostname({ organizationId: org, serviceId: input.serviceId, prNumber: input.pullRequestNumber, baseDomain: this.baseDomain }), new Date(Date.now() + policy.ttlSeconds * 1000)]);
        p = row(r.rows[0]);
      }
      const r = await client.query(`INSERT INTO preview_revisions(id,preview_id,organization_id,deployment_id,commit_sha,provider_delivery_id,trust_level,protected_secrets_allowed,secret_profile,idempotency_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(preview_id,commit_sha) DO UPDATE SET id=preview_revisions.id WHERE preview_revisions.organization_id=$3 RETURNING *`,
      [crypto.randomUUID(), p.id, org, input.deploymentId || null, input.commitSha.toLowerCase(), input.providerDeliveryId || null, input.forked ? 'fork_verified' : 'same_repository', !input.forked, input.forked ? 'untrusted-preview' : 'trusted-preview', `${org}:${key}`]);
      const revision = row(r.rows[0]);
      p = row((await client.query(`UPDATE preview_instances SET active_revision_id=$3,lifecycle_status='building',updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *`, [p.id, org, revision.id])).rows[0]);
      if (this.repository.auditService?.appendInTransaction) await this.repository.auditService.appendInTransaction(client, {
        organizationId: org, actorId: actor, action: 'preview.created', resourceType: 'preview', resourceId: p.id,
        result: 'success', sourceCategory: 'preview', idempotencyKey: `preview-revision:${revision.id}`,
      });
      return { preview: p, revision, created: true };
    });
  }
  async list(actor, org) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.OBSERVE);
    return (await this.pool.query('SELECT * FROM preview_instances WHERE organization_id=$1 ORDER BY created_at,id', [org])).rows.map(row);
  }
  async previewRecord(org, id, client = this.pool) {
    const r = await client.query('SELECT * FROM preview_instances WHERE id=$1 AND organization_id=$2', [id, org]);
    if (!r.rowCount) fail('PREVIEW_NOT_FOUND', 'Preview not found', 404);
    return row(r.rows[0]);
  }
  async routeRecord(org, id) {
    const r = await this.pool.query('SELECT * FROM platform_routes WHERE id=$1 AND organization_id=$2', [id, org]);
    if (!r.rowCount) fail('ROUTE_NOT_FOUND', 'Route not found', 404);
    return row(r.rows[0]);
  }
  async previewRoute(org, id) { return row((await this.pool.query(`SELECT * FROM platform_routes WHERE preview_id=$1 AND organization_id=$2 AND status<>'removed' ORDER BY created_at,id LIMIT 1`, [id, org])).rows[0]); }
  async get(actor, org, id) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.OBSERVE);
    const p = await this.previewRecord(org, id);
    const r = await this.pool.query('SELECT * FROM preview_revisions WHERE id=$1 AND organization_id=$2 AND preview_id=$3', [p.activeRevisionId, org, id]);
    return { ...p, revision: row(r.rows[0]), route: await this.previewRoute(org, id) };
  }
  async setDeploymentResource(org, id, value) {
    await this.previewRecord(org, id);
    await this.pool.query('UPDATE preview_instances SET deployment_resource=$3,updated_at=NOW() WHERE id=$1 AND organization_id=$2', [id, org, value]);
  }
  async markReady(id, { routeId, deploymentHealthy, httpVerified, scope = 'local', organizationId: org }) {
    return withTransaction(this.pool, async client => {
      const p = await this.previewRecord(org, id, client);
      const route = row((await client.query('SELECT * FROM platform_routes WHERE id=$1 AND organization_id=$2 AND preview_id=$3', [routeId, org, id])).rows[0]);
      if (!route) fail('PREVIEW_ROUTE_NOT_FOUND', 'Preview route not found', 404);
      if (route.status !== 'ready' || !deploymentHealthy || !httpVerified || (route.tlsRequired && route.certificateStatus !== 'ready')) fail('PREVIEW_NOT_VERIFIED', 'Route, TLS, health and HTTP verification must pass');
      await client.query('UPDATE platform_routes SET verification_scope=$3,last_verified_at=NOW() WHERE id=$1 AND organization_id=$2', [routeId, org, scope]);
      await client.query(`UPDATE preview_revisions SET status='ready' WHERE id=$1 AND organization_id=$2 AND preview_id=$3`, [p.activeRevisionId, org, id]);
      return row((await client.query(`UPDATE preview_instances SET lifecycle_status='ready',updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *`, [id, org])).rows[0]);
    });
  }
  async _insertRoute(client, org, serviceId, previewId, hostname, input) {
    const r = await client.query(`INSERT INTO platform_routes(id,organization_id,service_id,preview_id,hostname,namespace,resource_name,backend_service,backend_port,tls_required,certificate_status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [crypto.randomUUID(), org, serviceId, previewId, hostname, input.namespace, input.resourceName, input.backendService, input.backendPort, input.tlsRequired !== false, input.tlsRequired === false ? 'ready' : 'requested']);
    return row(r.rows[0]);
  }
  async route(actor, org, input) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    const p = await this.get(actor, org, input.previewId);
    if (p.route) return p.route;
    return this._insertRoute(this.pool, org, p.serviceId, p.id, p.generatedHostname, input);
  }
  async updateRoute(org, id, input) {
    const current = await this.routeRecord(org, id);
    // Whitelist mutable observation fields; never accept ownership fields from input.
    const x = { ...current };
    for (const key of ['status', 'certificateStatus', 'certificateExpiresAt', 'lastVerifiedAt', 'verificationScope', 'failureCode']) if (Object.hasOwn(input, key)) x[key] = input[key];
    return row((await this.pool.query(`UPDATE platform_routes SET status=$3,certificate_status=$4,certificate_expires_at=$5,last_verified_at=$6,verification_scope=$7,failure_code=$8,updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *`, [id, org, x.status, x.certificateStatus, x.certificateExpiresAt, x.lastVerifiedAt, x.verificationScope, x.failureCode])).rows[0]);
  }
  async requestDomain(actor, org, input) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    await this._resources(actor, org, input);
    const hostname = normalizeHostname(input.hostname), token = crypto.randomBytes(32).toString('base64url'), expires = new Date(Date.now() + this.challengeTtlMs).toISOString();
    try {
      return await withTransaction(this.pool, async client => {
        const r = await client.query(`INSERT INTO custom_domains(id,organization_id,project_id,service_id,hostname_ascii,hostname_display,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [crypto.randomUUID(), org, input.projectId, input.serviceId, hostname, String(input.hostname), actor]);
        const domain = row(r.rows[0]), name = `_platform-verification.${hostname}`;
        await client.query(`INSERT INTO domain_verification_challenges(id,custom_domain_id,token_hash,dns_record_name,expires_at) VALUES($1,$2,$3,$4,$5)`, [crypto.randomUUID(), domain.id, hash(token), name, expires]);
        return { domain, instructions: { type: 'TXT', name, value: `platform-verification=${token}`, expiresAt: expires } };
      });
    } catch (error) {
      if (error.code === '23505') fail('DOMAIN_ALREADY_CLAIMED', 'Domain is already claimed');
      throw error;
    }
  }
  async _domain(org, id, client = this.pool) {
    const r = await client.query(`SELECT * FROM custom_domains WHERE id=$1 AND organization_id=$2 AND status<>'removed'`, [id, org]);
    if (!r.rowCount) fail('DOMAIN_NOT_FOUND', 'Domain not found', 404);
    return row(r.rows[0]);
  }
  async verifyDomain(actor, org, id, { token, dnsValues = [] }) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    const result = await withTransaction(this.pool, async client => {
      await this._domain(org, id, client);
      const r = await client.query(`SELECT c.* FROM domain_verification_challenges c JOIN custom_domains d ON d.id=c.custom_domain_id WHERE d.id=$1 AND d.organization_id=$2`, [id, org]);
      const c = row(r.rows[0]);
      if (!c || Date.parse(c.expiresAt) <= Date.now()) fail('DOMAIN_CHALLENGE_EXPIRED', 'Domain verification challenge expired', 410);
      await client.query(`UPDATE domain_verification_challenges c SET attempts=c.attempts+1 FROM custom_domains d WHERE c.custom_domain_id=d.id AND d.id=$1 AND d.organization_id=$2`, [id, org]);
      const candidate = token || dnsValues.map(x => String(x).replace(/^platform-verification=/, '')).find(Boolean);
      if (!candidate || hash(candidate) !== c.tokenHash) return null; // Commit the failed attempt before returning its error.
      await client.query(`UPDATE domain_verification_challenges c SET verified_at=NOW() FROM custom_domains d WHERE c.custom_domain_id=d.id AND d.id=$1 AND d.organization_id=$2`, [id, org]);
      return row((await client.query(`UPDATE custom_domains SET status='verified',updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *`, [id, org])).rows[0]);
    });
    if (!result) fail('DOMAIN_VERIFICATION_FAILED', 'Domain control could not be verified', 422);
    return result;
  }
  async activateDomain(actor, org, id, input) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    return withTransaction(this.pool, async client => {
      const d = await this._domain(org, id, client);
      if (d.status !== 'verified') fail('DOMAIN_NOT_VERIFIED', 'Domain ownership must be verified before activation');
      const existing = await client.query(`SELECT * FROM platform_routes WHERE organization_id=$1 AND service_id=$2 AND hostname=$3 AND status<>'removed'`, [org, d.serviceId, d.hostnameAscii]);
      const route = row(existing.rows[0]) || await this._insertRoute(client, org, d.serviceId, null, d.hostnameAscii, { ...input, tlsRequired: true });
      const domain = row((await client.query(`UPDATE custom_domains SET route_id=$3,status='activating',updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *`, [id, org, route.id])).rows[0]);
      return { domain, route };
    });
  }
  async setDomainStatus(org, id, status) {
    await this._domain(org, id);
    return row((await this.pool.query('UPDATE custom_domains SET status=$3,updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *', [id, org, status])).rows[0]);
  }
  async removeDomain(actor, org, id) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    return withTransaction(this.pool, async client => {
      const d = await this._domain(org, id, client);
      await client.query(`DELETE FROM domain_verification_challenges c USING custom_domains d WHERE c.custom_domain_id=d.id AND d.id=$1 AND d.organization_id=$2`, [id, org]);
      if (d.routeId) await client.query(`UPDATE platform_routes SET status='removed',certificate_status='removed' WHERE id=$1 AND organization_id=$2`, [d.routeId, org]);
      return row((await client.query(`UPDATE custom_domains SET status='removed',removed_at=NOW(),route_id=NULL,updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *`, [id, org])).rows[0]);
    });
  }
  async listDomains(actor, org) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.OBSERVE);
    return (await this.pool.query(`SELECT * FROM custom_domains WHERE organization_id=$1 AND status<>'removed' ORDER BY created_at,id`, [org])).rows.map(row);
  }
  async scheduleCleanup(id, reason = 'expired', org) {
    return withTransaction(this.pool, async client => {
      const p = await this.previewRecord(org, id, client);
      const route = row((await client.query('SELECT * FROM platform_routes WHERE preview_id=$1 AND organization_id=$2 ORDER BY created_at LIMIT 1', [id, org])).rows[0]);
      const r = await client.query(`INSERT INTO preview_cleanup_jobs(id,preview_id,organization_id,finalizer_deadline,owned_resource_ids,reason)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(preview_id) DO UPDATE SET id=preview_cleanup_jobs.id WHERE preview_cleanup_jobs.organization_id=$3 RETURNING *`,
      [crypto.randomUUID(), id, org, new Date(Date.now() + 3600000), { isolationKey: p.isolationKey, routeId: route?.id || null }, reason]);
      if (r.rows[0].status !== 'completed') await client.query(`UPDATE preview_instances SET cleanup_status='pending',lifecycle_status='closing',updated_at=NOW() WHERE id=$1 AND organization_id=$2`, [id, org]);
      return row(r.rows[0]);
    });
  }
  async due(org) {
    // Tenant-scoped reconciliation; a scheduler must explicitly enumerate its tenants.
    const expired = await this.pool.query(`SELECT id FROM preview_instances WHERE organization_id=$1 AND expires_at<=NOW() AND lifecycle_status NOT IN('removed','closing')`, [org]);
    for (const p of expired.rows) await this.scheduleCleanup(p.id, 'expired', org);
    return (await this.pool.query(`SELECT * FROM preview_cleanup_jobs WHERE organization_id=$1 AND status IN('pending','retry') AND next_attempt_at<=NOW() ORDER BY next_attempt_at,id`, [org])).rows.map(row);
  }
  async cleanupComplete(job) {
    return withTransaction(this.pool, async client => {
      const r = await client.query(`UPDATE preview_cleanup_jobs SET status='completed',updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND preview_id=$3 RETURNING id`, [job.id, job.organizationId, job.previewId]);
      if (!r.rowCount) fail('PREVIEW_NOT_FOUND', 'Preview cleanup job not found', 404);
      await client.query(`UPDATE platform_routes SET status='removed',certificate_status='removed',updated_at=NOW() WHERE preview_id=$1 AND organization_id=$2`, [job.previewId, job.organizationId]);
      const p = row((await client.query(`UPDATE preview_instances SET cleanup_status='completed',lifecycle_status='removed',updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING *`, [job.previewId, job.organizationId])).rows[0]);
      job.status = 'completed'; return p;
    });
  }
  async cleanupFailed(job, error) {
    // Provider messages can contain credentials; persist only a bounded error code.
    const r = await this.pool.query(`UPDATE preview_cleanup_jobs SET attempt=attempt+1,status=CASE WHEN finalizer_deadline<=NOW() THEN 'failed' ELSE 'retry' END,
      last_error=$4,next_attempt_at=NOW()+LEAST(60000,1000*power(2,LEAST(attempt+1,10)))*INTERVAL '1 millisecond',updated_at=NOW()
      WHERE id=$1 AND organization_id=$2 AND preview_id=$3 RETURNING *`, [job.id, job.organizationId, job.previewId, /^[A-Z0-9_]{1,80}$/.test(error.code || '') ? error.code : 'PREVIEW_CLEANUP_FAILED']);
    if (!r.rowCount) fail('PREVIEW_NOT_FOUND', 'Preview cleanup job not found', 404);
    Object.assign(job, row(r.rows[0])); return job;
  }
  async knownPreviewIds(org) { return (await this.pool.query('SELECT id FROM preview_instances WHERE organization_id=$1', [org])).rows.map(x => x.id); }
  async certificateRoutes(org) { return (await this.pool.query('SELECT * FROM platform_routes WHERE organization_id=$1', [org])).rows.map(row); }
  async handleProviderEvent(event) {
    if (event.eventType !== 'pull_request') return null;
    const p = await this.eventPolicy(event.organizationId, event.repositoryId);
    if (!p) return null;
    const current = await this.eventPreview(event.organizationId, event.repositoryId, event.pullRequestNumber), action = event.metadata?.action;
    if (action === 'closed') return current ? this.scheduleCleanup(current.id, event.metadata?.merged ? 'merged' : 'closed', event.organizationId) : null;
    if (!['opened', 'reopened', 'synchronize'].includes(action)) return null;
    return this.create(p.createdBy, event.organizationId, { projectId: p.projectId, serviceId: p.serviceId, repositoryId: p.repositoryId, pullRequestNumber: event.pullRequestNumber, commitSha: event.commitSha, forked: event.forkedPullRequest, providerTrustVerified: true, providerDeliveryId: event.deliveryId }, `github:${event.deliveryId}`);
  }
}
module.exports = { PostgresPreviewStore };
