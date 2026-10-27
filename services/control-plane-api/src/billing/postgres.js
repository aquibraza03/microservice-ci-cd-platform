const { randomUUID } = require('crypto');
const { withTransaction } = require('../database/transaction');
const { UsageLedger } = require('./ledger');
const { PLANS } = require('./plans');
const { getMeter } = require('./catalog');
const { EXEMPT_OPERATIONS } = require('./quotas');
const { row: camelRow } = require('../database/rows');

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const lock = (c, key) => c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
const usageRow = r => r && { ...camelRow(r), quantity: Number(r.quantity) };

class PostgresUsageLedger {
  constructor(pool, { clock = () => new Date(), auditService } = {}) { this.pool = pool; this.clock = clock; this.auditService = auditService; }
  async append(input) { return withTransaction(this.pool, c => this.appendInTransaction(c, input)); }
  async appendInTransaction(c, input) {
    // Reuse the established input contract; the temporary validator holds no live state.
    const { event } = new UsageLedger({ clock: this.clock }).append(input);
    const meter = getMeter(event.meterId, event.meterVersion);
    await c.query('INSERT INTO meter_definitions(meter_id,version,unit,definition) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [meter.id, meter.version, meter.unit, meter]);
    if (input.adjustmentOf) {
      const original = await c.query('SELECT 1 FROM usage_events WHERE event_id=$1 AND organization_id=$2', [input.adjustmentOf, input.organizationId]);
      if (!original.rowCount) fail('USAGE_NOT_FOUND', 'Usage event not found');
    }
    const r = await c.query(`INSERT INTO usage_events(event_id,organization_id,meter_id,meter_version,quantity,unit,window_start,window_end,source_resource_type,source_resource_id,source_event_id,idempotency_key,occurred_at,received_at,processing_status,adjustment_of)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(organization_id,meter_id,meter_version,idempotency_key) DO NOTHING RETURNING *`,
    [randomUUID(), event.organizationId, event.meterId, event.meterVersion, event.quantity, event.unit, event.windowStart, event.windowEnd, event.sourceResourceType, event.sourceResourceId, event.sourceEventId, event.idempotencyKey, event.occurredAt, event.receivedAt, event.processingStatus, event.adjustmentOf]);
    const stored = r.rows[0] || (await c.query('SELECT * FROM usage_events WHERE organization_id=$1 AND meter_id=$2 AND meter_version=$3 AND idempotency_key=$4', [event.organizationId, event.meterId, event.meterVersion, event.idempotencyKey])).rows[0];
    if (r.rowCount && this.auditService) await this.auditService.appendInTransaction(c, { organizationId: event.organizationId, action: event.adjustmentOf ? 'usage.adjusted' : 'usage.recorded', resourceType: 'usage', resourceId: stored.event_id, result: 'success', sourceCategory: 'billing', idempotencyKey: `usage:${stored.event_id}` });
    return { event: usageRow(stored), duplicate: !r.rowCount };
  }
  async adjust({ organizationId, originalEventId, quantity, reason, idempotencyKey, actorId }) {
    if (!reason || !actorId) fail('ADJUSTMENT_INVALID', 'Adjustment reason and actor required');
    const r = await this.pool.query('SELECT * FROM usage_events WHERE event_id=$1 AND organization_id=$2', [originalEventId, organizationId]);
    if (!r.rowCount) fail('USAGE_NOT_FOUND', 'Usage event not found');
    return this.append({ ...usageRow(r.rows[0]), quantity, idempotencyKey, sourceResourceId: originalEventId, sourceResourceType: 'usage_event', adjustmentOf: originalEventId, occurredAt: this.clock().toISOString() });
  }
  async list(org, { meterId, cursor = 0, limit = 50 } = {}) {
    limit = Math.min(Math.max(Number(limit) || 50, 1), 100); cursor = Math.max(Number(cursor) || 0, 0);
    const r = await this.pool.query('SELECT * FROM usage_events WHERE organization_id=$1 AND ($2::text IS NULL OR meter_id=$2) ORDER BY received_at,event_id LIMIT $3 OFFSET $4', [org, meterId || null, limit + 1, cursor]);
    return { items: r.rows.slice(0, limit).map(usageRow), nextCursor: r.rows.length > limit ? cursor + limit : null };
  }
  async aggregate(org, { start = '1970-01-01', end = '9999-12-31' } = {}) {
    const r = await this.pool.query('SELECT meter_id,meter_version,SUM(quantity) AS quantity FROM usage_events WHERE organization_id=$1 AND occurred_at >= $2 AND occurred_at < $3 GROUP BY meter_id,meter_version', [org, start, end]);
    return Object.fromEntries(r.rows.map(x => { const q = Number(x.quantity); if (!Number.isSafeInteger(q)) fail('USAGE_OVERFLOW', 'Usage exceeds exact integer range'); return [`${x.meter_id}:v${x.meter_version}`, q]; }));
  }
  async reconcile({ organizationId, meterId, expectedQuantity, start = '1970-01-01', end = '9999-12-31' }) {
    const totals = await this.aggregate(organizationId, { start, end });
    const recorded = Object.entries(totals).filter(([k]) => k.startsWith(`${meterId}:`)).reduce((n, [, q]) => n + q, 0);
    const r = await this.pool.query(`INSERT INTO usage_reconciliations(id,organization_id,meter_id,period_start,period_end,expected_quantity,recorded_quantity,difference,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [randomUUID(), organizationId, meterId, start, end, expectedQuantity, recorded, expectedQuantity - recorded, expectedQuantity === recorded ? 'matched' : 'mismatch']);
    return camelRow(r.rows[0]);
  }
}

class PostgresEntitlementService {
  constructor(pool, { auditService } = {}) { this.pool = pool; this.auditService = auditService; }
  async assign(org, planId, effectiveAt = new Date().toISOString()) {
    const plan = PLANS[planId]; if (!plan) fail('PLAN_UNKNOWN', 'Unknown plan');
    return withTransaction(this.pool, async c => {
      await lock(c, `subscription:${org}`);
      await c.query('INSERT INTO plan_definitions(plan_id,version,currency,entitlements) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [planId, plan.version, plan.currency, plan.entitlements]);
      // Future assignments must not erase the presently effective subscription.
      await c.query('UPDATE organization_subscriptions SET ended_at=$2,version=version+1 WHERE organization_id=$1 AND ended_at IS NULL', [org, effectiveAt]);
      const id = randomUUID();
      await c.query("INSERT INTO organization_subscriptions(id,organization_id,plan_id,plan_version,state,effective_at) VALUES($1,$2,$3,$4,'active',$5)", [id, org, planId, plan.version, effectiveAt]);
      if (this.auditService) await this.auditService.appendInTransaction(c, { organizationId: org, action: 'billing.plan.assigned', resourceType: 'subscription', resourceId: id, result: 'success', sourceCategory: 'billing', idempotencyKey: `subscription:${id}` });
      return { organizationId: org, planId, planVersion: plan.version, effectiveAt };
    });
  }
  async override({ organizationId, entitlement, value, expiresAt, reason, actorId }) {
    if (!reason || !actorId || !Number.isSafeInteger(value) || value < 0) fail('ENTITLEMENT_INVALID', 'Invalid override');
    const r = await this.pool.query('INSERT INTO entitlement_overrides(id,organization_id,entitlement,value,reason,starts_at,expires_at,created_by) VALUES($1,$2,$3,$4,$5,NOW(),$6,$7) RETURNING *', [randomUUID(), organizationId, entitlement, value, reason, expiresAt || null, actorId]);
    return camelRow(r.rows[0]);
  }
  async effective(org) {
    const r = await this.pool.query(`SELECT s.*,p.entitlements FROM organization_subscriptions s JOIN plan_definitions p ON p.plan_id=s.plan_id AND p.version=s.plan_version
      WHERE s.organization_id=$1 AND s.state IN ('active','grace') AND s.effective_at<=NOW() AND (s.ended_at IS NULL OR s.ended_at>NOW()) ORDER BY s.effective_at DESC LIMIT 1`, [org]);
    if (!r.rowCount) return null;
    const item = camelRow(r.rows[0]);
    const overrides = await this.pool.query('SELECT entitlement,value FROM entitlement_overrides WHERE organization_id=$1 AND starts_at<=NOW() AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY created_at,id', [org]);
    for (const x of overrides.rows) item.entitlements[x.entitlement] = Number(x.value);
    return item;
  }
}

class PostgresQuotaManager {
  constructor(pool, { auditService } = {}) { this.pool = pool; this.auditService = auditService; }
  async setLimit(org, type, limit) {
    if (!Number.isSafeInteger(limit) || limit < 0) fail('QUOTA_INVALID', 'Invalid limit');
    return withTransaction(this.pool, async c => {
      await lock(c, `quota:${org}:${type}`);
      const used = await this._used(c, org, type);
      if (used > limit) fail('QUOTA_EXCEEDED', 'Limit is below existing reservations');
      await c.query('INSERT INTO quota_limits(organization_id,resource_type,limit_value) VALUES($1,$2,$3) ON CONFLICT(organization_id,resource_type) DO UPDATE SET limit_value=$3', [org, type, limit]);
    });
  }
  async _used(c, org, type) {
    return Number((await c.query("SELECT COALESCE(SUM(quantity),0) AS quantity FROM quota_reservations WHERE organization_id=$1 AND resource_type=$2 AND (status='consumed' OR (status='active' AND expires_at>NOW()))", [org, type])).rows[0].quantity);
  }
  async reserve(input) { return withTransaction(this.pool, c => this.reserveInTransaction(c, input)); }
  async reserveInTransaction(c, { organizationId: org, resourceType: type, quantity = 1, ownerOperation, idempotencyKey, ttlSeconds = 900 }) {
    if (!org || !type || !ownerOperation || !idempotencyKey || !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) fail('QUOTA_INVALID', 'Invalid reservation');
    if (EXEMPT_OPERATIONS.has(ownerOperation)) return { exempt: true, operation: ownerOperation };
    await lock(c, `quota:${org}:${type}`);
    await c.query("UPDATE quota_reservations SET status='expired',version=version+1 WHERE organization_id=$1 AND resource_type=$2 AND status='active' AND expires_at<=NOW()", [org, type]);
    const old = await c.query('SELECT * FROM quota_reservations WHERE organization_id=$1 AND resource_type=$2 AND idempotency_key=$3', [org, type, idempotencyKey]);
    if (old.rowCount) return this._row(old.rows[0]);
    const limits = await c.query('SELECT limit_value FROM quota_limits WHERE organization_id=$1 AND resource_type=$2', [org, type]);
    if (!limits.rowCount) fail('QUOTA_NOT_CONFIGURED', 'Quota limit is required');
    if (await this._used(c, org, type) + quantity > Number(limits.rows[0].limit_value)) fail('QUOTA_EXCEEDED', 'Quota exhausted; retry after a reservation is released');
    const r = await c.query(`INSERT INTO quota_reservations(id,organization_id,resource_type,quantity,owner_operation,idempotency_key,status,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'active',NOW()+$7*INTERVAL '1 second') RETURNING *`, [randomUUID(), org, type, quantity, ownerOperation, idempotencyKey, ttlSeconds]);
    if (this.auditService) await this.auditService.appendInTransaction(c, { organizationId: org, action: 'quota.reserved', resourceType: 'quota_reservation', resourceId: r.rows[0].id, result: 'success', sourceCategory: 'billing', idempotencyKey: `quota:${r.rows[0].id}` });
    return this._row(r.rows[0]);
  }
  _row(r) { const x = camelRow(r); return { ...x, reservationId: x.id }; }
  async release(id, org) { return this._transition(id, org, 'released'); }
  async consume(id, org) { return this._transition(id, org, 'consumed'); }
  async _transition(id, org, status) {
    return withTransaction(this.pool, async c => {
      const row = (await c.query('SELECT * FROM quota_reservations WHERE id=$1 AND organization_id=$2', [id, org])).rows[0];
      if (!row) return { released: false, consumed: false };
      await lock(c, `quota:${org}:${row.resource_type}`);
      const r = await c.query(`UPDATE quota_reservations SET status=$3,released_at=CASE WHEN $3='released' THEN NOW() ELSE NULL END,version=version+1
        WHERE id=$1 AND organization_id=$2 AND ((status='active' AND expires_at>NOW()) OR ($3='released' AND status='consumed')) RETURNING *`, [id, org, status]);
      return { released: status === 'released' && !!r.rowCount, consumed: status === 'consumed' && !!r.rowCount, reservation: r.rowCount ? this._row(r.rows[0]) : undefined };
    });
  }
  async expire() { return (await this.pool.query("UPDATE quota_reservations SET status='expired',version=version+1 WHERE status='active' AND expires_at<=NOW()")).rowCount; }
  async reconcile(activeOperationIds, org) {
    await this.expire();
    const rows = await this.pool.query("SELECT id,owner_operation FROM quota_reservations WHERE organization_id=$1 AND status='active'", [org]);
    const releasedLeaks = [];
    for (const r of rows.rows) if (!activeOperationIds.has(r.owner_operation) && (await this.release(r.id, org)).released) releasedLeaks.push(r.id);
    return { releasedLeaks };
  }
}
module.exports = { PostgresUsageLedger, PostgresEntitlementService, PostgresQuotaManager };
