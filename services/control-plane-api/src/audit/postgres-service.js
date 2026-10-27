const crypto = require("crypto");
const { validateInput, canonical } = require("./schema");
const { ZERO } = require("./service");
const { MemoryAuditService } = require('./service');
const { withTransaction } = require('../database/transaction');
const { PERMISSIONS } = require('../auth/rbac');
const { ControlPlaneError } = require('../errors');
class PostgresAuditService {
  constructor(repository, { integrityKeys, activeKeyVersion = 1 }) {
    this.repository = repository;
    this.integrityKeys = Object.fromEntries(Object.entries(integrityKeys || {}).map(([version, key]) => [version, Buffer.isBuffer(key) ? key : Buffer.from(key, 'base64')]));
    this.activeKeyVersion = activeKeyVersion;
    this.pool = repository.pool;
    if (!this.integrityKeys[activeKeyVersion] || this.integrityKeys[activeKeyVersion].length < 32)
      throw new Error('Audit integrity key must contain at least 32 bytes');
  }
  _event(row) {
    return { ...row.event_payload, integrity: { algorithm: 'HMAC-SHA256', keyVersion: row.key_version, previousHash: row.previous_hash, hash: row.event_hash } };
  }
  async append(input) {
    return withTransaction(this.pool, async client => this._event(await this.appendInTransaction(client, input)));
  }
  async _view(actor, org, permission = PERMISSIONS.AUDIT_READ) {
    await this.repository.requireAccess(actor, org, permission);
    const rows = await this.pool.query('SELECT e.*,h.last_sequence,h.last_hash FROM audit_chain_heads h LEFT JOIN enterprise_audit_events e ON e.organization_id=h.organization_id WHERE h.organization_id=$1 ORDER BY e.sequence', [org]);
    // Request-local projection reuses filtering/hash verification, never stores authoritative state.
    const view = new MemoryAuditService({ requireAccess() {} }, { integrityKeys: this.integrityKeys, activeKeyVersion: this.activeKeyVersion });
    view.events.set(org, rows.rows.filter(row => row.event_payload).map(row => this._event(row)));
    view.durableHead = rows.rows[0] && { sequence: Number(rows.rows[0].last_sequence), hash: rows.rows[0].last_hash };
    return view;
  }
  async search(actor, org, query) { return (await this._view(actor, org)).search(actor, org, query); }
  async get(actor, org, id) { return (await this._view(actor, org)).get(actor, org, id); }
  async verify(actor, org, range = {}) {
    const view = await this._view(actor, org, PERMISSIONS.AUDIT_VERIFY);
    const result = view.verify(actor, org, range);
    if (!range.toSequence && view.durableHead && (result.toSequence !== view.durableHead.sequence || result.checkpointHash !== view.durableHead.hash)) {
      result.valid = false; result.failures.push({ code: 'CHAIN_HEAD_MISMATCH', sequence: view.durableHead.sequence });
    }
    return result;
  }
  async requestExport(actor, org, query = {}, key = crypto.randomUUID()) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.AUDIT_EXPORT);
    if (query.from && query.to && (new Date(query.to) - new Date(query.from)) / 86400000 > 366)
      throw new ControlPlaneError(400, 'AUDIT_EXPORT_RANGE_TOO_LARGE', 'Audit export range is too large');
    return withTransaction(this.pool, async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`audit-export:${org}:${key}`]);
      const existing = await c.query('SELECT * FROM audit_exports WHERE organization_id=$1 AND idempotency_key=$2', [org, key]);
      if (existing.rowCount) return this._export(existing.rows[0]);
      const view = await this._view(actor, org, PERMISSIONS.AUDIT_EXPORT);
      const items = []; let after = 0;
      do { const page = view.search(actor, org, { ...query, after, limit: 200 }); items.push(...page.items); after = page.pagination.nextAfter; } while (after);
      const body = items.map(x => JSON.stringify(x) + '\n').join('');
      const exportId = crypto.randomUUID();
      const token = this._downloadToken(exportId, this.activeKeyVersion);
      const row = (await c.query(`INSERT INTO audit_exports(id,organization_id,requester_id,state,format,filter,export_body,content_sha256,event_count,download_token_hash,download_expires_at,idempotency_key,completed_at)
        VALUES($1,$2,$3,'completed','audit-jsonl-v1',$4,$5,$6,$7,$8,NOW()+INTERVAL '5 minutes',$9,NOW()) RETURNING *`,
      [exportId, org, actor, query, body, crypto.createHash('sha256').update(body).digest('hex'), items.length, crypto.createHash('sha256').update(token).digest('hex'), key])).rows[0];
      await this.appendInTransaction(c, { organizationId: org, actorId: actor, action: 'audit.export.completed', resourceType: 'audit_export', resourceId: row.id, result: 'success', sourceCategory: 'audit', idempotencyKey: `export:${row.id}` });
      return { ...this._export(row), downloadToken: token };
    });
  }
  _downloadToken(id, version) { return crypto.createHmac('sha256', this.integrityKeys[version]).update(`audit-export-download\n${id}`).digest('base64url'); }
  _export(r) {
    const value = { id: r.id, organizationId: r.organization_id, state: r.state, format: r.format, eventCount: Number(r.event_count), sha256: r.content_sha256, createdAt: r.created_at.toISOString(), expiresAt: r.download_expires_at.toISOString() };
    // Reconstruct an unconsumed grant after response loss/restart without storing
    // its plaintext. Historical integrity keys also support active grant retries.
    if (!r.downloaded_at && r.download_expires_at > new Date()) for (const version of Object.keys(this.integrityKeys)) {
      const token = this._downloadToken(r.id, version);
      if (crypto.createHash('sha256').update(token).digest('hex') === r.download_token_hash) { value.downloadToken = token; break; }
    }
    return value;
  }
  async download(actor, org, id, token) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.AUDIT_EXPORT);
    return withTransaction(this.pool, async c => {
      const r = (await c.query('SELECT * FROM audit_exports WHERE id=$1 AND organization_id=$2 AND download_token_hash=$3 AND downloaded_at IS NULL FOR UPDATE', [id, org, crypto.createHash('sha256').update(String(token || '')).digest('hex')])).rows[0];
      if (!r) throw new ControlPlaneError(404, 'AUDIT_EXPORT_NOT_FOUND', 'Audit export not found');
      if (r.download_expires_at <= new Date()) throw new ControlPlaneError(410, 'AUDIT_EXPORT_EXPIRED', 'Audit export expired');
      await c.query('UPDATE audit_exports SET downloaded_at=NOW() WHERE id=$1 AND organization_id=$2', [id, org]);
      await this.appendInTransaction(c, { organizationId: org, actorId: actor, action: 'audit.export.downloaded', resourceType: 'audit_export', resourceId: id, result: 'success', sourceCategory: 'audit', idempotencyKey: `download:${id}` });
      return { contentType: 'application/x-ndjson', body: r.export_body, sha256: r.content_sha256 };
    });
  }
  async retentionDetails(actor, org) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.AUDIT_READ);
    const r = await this.pool.query('SELECT retention_days FROM audit_retention_policies WHERE organization_id=$1', [org]);
    return { applicationRetentionDays: r.rows[0]?.retention_days || 365, minRetentionDays: 30, maxRetentionDays: 2555, legalHoldSupported: false, externalImmutableStorageRequiredForWorm: true };
  }
  async setRetention(actor, org, days) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.AUDIT_RETENTION_MANAGE);
    if (!Number.isInteger(days) || days < 30 || days > 2555) throw new ControlPlaneError(400, 'AUDIT_RETENTION_INVALID', 'Audit retention is outside supported limits');
    await withTransaction(this.pool, async c => {
      const r = await c.query(`INSERT INTO audit_retention_policies(organization_id,retention_days,updated_by) VALUES($1,$2,$3)
        ON CONFLICT(organization_id) DO UPDATE SET retention_days=$2,updated_by=$3,version=audit_retention_policies.version+1,updated_at=NOW() RETURNING version`, [org, days, actor]);
      await this.appendInTransaction(c, { organizationId: org, actorId: actor, action: 'audit.retention.changed', resourceType: 'audit_policy', resourceId: org, result: 'success', sourceCategory: 'audit', idempotencyKey: `retention:${org}:${r.rows[0].version}`, metadata: { days } });
    });
    return this.retentionDetails(actor, org);
  }
  _hash(base, previous) {
    return crypto
      .createHmac("sha256", this.integrityKeys[this.activeKeyVersion])
      .update(`${previous}\n${canonical(base)}`)
      .digest("hex");
  }
  async appendInTransaction(client, input) {
    const safe = validateInput(input);
    await client.query(
      "INSERT INTO audit_chain_heads(organization_id,last_sequence,last_hash,key_version) VALUES($1,0,$2,$3) ON CONFLICT DO NOTHING",
      [safe.organizationId, ZERO, this.activeKeyVersion],
    );
    const head = (
        await client.query(
          "SELECT last_sequence,last_hash FROM audit_chain_heads WHERE organization_id=$1 FOR UPDATE",
          [safe.organizationId],
        )
      ).rows[0],
      sequence = Number(head.last_sequence) + 1,
      timestamp = new Date().toISOString(),
      base = { id: crypto.randomUUID(), ...safe, timestamp, sequence },
      hash = this._hash(base, head.last_hash);
    const inserted = await client.query(
      "INSERT INTO enterprise_audit_events(id,organization_id,sequence,schema_version,event_timestamp,event_payload,previous_hash,event_hash,key_version,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(organization_id,idempotency_key) DO NOTHING RETURNING *",
      [
        base.id,
        safe.organizationId,
        sequence,
        safe.schemaVersion,
        timestamp,
        base,
        head.last_hash,
        hash,
        this.activeKeyVersion,
        safe.idempotencyKey,
      ],
    );
    if (!inserted.rowCount)
      return (
        await client.query(
          "SELECT * FROM enterprise_audit_events WHERE organization_id=$1 AND idempotency_key=$2",
          [safe.organizationId, safe.idempotencyKey],
        )
      ).rows[0];
    await client.query(
      "UPDATE audit_chain_heads SET last_sequence=$2,last_hash=$3,key_version=$4,updated_at=NOW() WHERE organization_id=$1",
      [safe.organizationId, sequence, hash, this.activeKeyVersion],
    );
    await client.query(
      "INSERT INTO audit_outbox(organization_id,audit_event_id,event_type,payload,idempotency_key) VALUES($1,$2,'audit.event.appended',$3,$4) ON CONFLICT DO NOTHING",
      [
        safe.organizationId,
        base.id,
        { eventId: base.id, sequence },
        `audit:${base.id}`,
      ],
    );
    return inserted.rows[0];
  }
}
module.exports = { PostgresAuditService };
