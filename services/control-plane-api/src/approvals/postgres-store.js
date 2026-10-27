const { randomUUID, createHash } = require('crypto');
const { ControlPlaneError } = require('../errors');
const { PERMISSIONS } = require('../auth/rbac');
const { withTransaction, bindTransactions } = require('../database/transaction');
const { row } = require('../database/rows');
const { MemoryApprovalStore, PROTECTED_ACTIONS } = require('./store');
const { canonicalize, snapshotDigest } = require('./canonical');
const hash = x => createHash('sha256').update(String(x)).digest('hex');
const fail = (code, message, status = 409) => { throw new ControlPlaneError(status, code, message); };

class PostgresApprovalStore {
  constructor(repository, { pool = repository.pool, clock = () => new Date(), eventSink = () => {} } = {}) {
    Object.assign(this, { repository, pool, clock, eventSink });
    bindTransactions(pool);
    for (const name of ['request', 'decide', 'override', 'cancel', 'invalidate', 'finishExecution', '_expire']) {
      const method = this[name].bind(this);
      this[name] = (...args) => withTransaction(pool, () => method(...args));
    }
  }
  _emit(...args) { return MemoryApprovalStore.prototype._emit.apply(this, args); }
  transition(...args) { return MemoryApprovalStore.prototype.transition.apply(this, args); }
  async _membership(userId, org) {
    const r = await this.pool.query('SELECT * FROM organization_members WHERE organization_id=$1 AND user_id=$2 AND status=\'active\'', [org, userId]);
    if (!r.rowCount) fail('MEMBERSHIP_INACTIVE', 'Active membership is required', 403);
    return row(r.rows[0]);
  }
  async _eligibleMembers(org, policy) {
    const r = await this.pool.query(`SELECT * FROM organization_members WHERE organization_id=$1 AND status='active'
      AND (role=ANY($2::text[]) OR user_id=ANY($3::uuid[]))`, [org, policy.eligibleRoles, policy.eligibleUserIds]);
    return r.rows.map(row);
  }
  async assertApproverChangeSafe(org, userId, replacementRole = null) {
    const r = await this.pool.query(`SELECT p.* FROM approval_requests r JOIN approval_policies p ON p.id=r.policy_id
      AND p.organization_id=r.organization_id AND p.version=r.policy_version WHERE r.organization_id=$1 AND r.state='pending'`, [org]);
    for (const p of r.rows.map(row)) {
      const eligible = (await this._eligibleMembers(org, p)).filter(m => m.userId !== userId || (replacementRole && p.eligibleRoles.includes(replacementRole)));
      if (eligible.length < p.requiredCount) fail('FINAL_ELIGIBLE_APPROVER_REQUIRED', 'Membership change would make a pending approval unsatisfiable');
    }
  }
  async validatePolicy(org, input) {
    if (!PROTECTED_ACTIONS.has(input.action)) fail('APPROVAL_ACTION_INVALID', 'Approval action is invalid', 400);
    const requiredCount = Number(input.requiredCount || 1);
    if (!Number.isInteger(requiredCount) || requiredCount < 1 || requiredCount > 10) fail('APPROVAL_COUNT_INVALID', 'Required approval count is invalid', 400);
    const candidate = { ...input, requiredCount, eligibleRoles: [...new Set(input.eligibleRoles || ['approver'])], eligibleUserIds: [...new Set(input.eligibleUserIds || [])] };
    if (input.action === 'approval_policy.change' && !candidate.eligibleRoles.length && !candidate.eligibleUserIds.length)
      fail('APPROVAL_POLICY_RECURSIVE', 'Policy cannot require an impossible approval of itself');
    if ((await this._eligibleMembers(org, candidate)).length < candidate.requiredCount) fail('APPROVAL_POLICY_UNSATISFIABLE', 'Policy has too few currently eligible approvers');
    return candidate;
  }
  async listPolicies(actor, org) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.POLICY_READ);
    return (await this.pool.query('SELECT * FROM approval_policies WHERE organization_id=$1 ORDER BY created_at,id', [org])).rows.map(row);
  }
  async setPolicy(actor, org, input, expectedVersion = null) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.APPROVAL_POLICY_MANAGE);
    const c = await this.validatePolicy(org, input);
    if (input.projectId) await this.repository.getProject(actor, org, input.projectId);
    if ((input.scopeType || 'organization') === 'organization' && input.scopeId && input.scopeId !== org) fail('APPROVAL_SCOPE_INVALID', 'Policy scope is outside the organization', 404);
    if (input.scopeType === 'project') await this.repository.getProject(actor, org, input.scopeId);
    const r = await this.pool.query(`INSERT INTO approval_policies(id,organization_id,project_id,environment,scope_type,scope_id,action,resource_type,risk_level,required_count,eligible_roles,eligible_user_ids,separation_of_duties,expires_in_seconds,enabled)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT(organization_id,scope_type,scope_id,action) DO UPDATE SET project_id=EXCLUDED.project_id,environment=EXCLUDED.environment,
      resource_type=EXCLUDED.resource_type,risk_level=EXCLUDED.risk_level,required_count=EXCLUDED.required_count,eligible_roles=EXCLUDED.eligible_roles,
      eligible_user_ids=EXCLUDED.eligible_user_ids,separation_of_duties=EXCLUDED.separation_of_duties,expires_in_seconds=EXCLUDED.expires_in_seconds,
      enabled=EXCLUDED.enabled,version=approval_policies.version+1,updated_at=NOW() WHERE approval_policies.version=$16 RETURNING *`,
    [randomUUID(), org, input.projectId || null, input.environment || null, input.scopeType || 'organization', input.scopeId || org, input.action, input.resourceType || null, input.riskLevel || 'high', c.requiredCount, JSON.stringify(c.eligibleRoles), JSON.stringify(c.eligibleUserIds), input.separationOfDuties !== false, Math.min(Math.max(input.expiresInSeconds || 3600, 60), 86400), input.enabled !== false, expectedVersion]);
    if (!r.rowCount) fail('POLICY_VERSION_CONFLICT', 'Approval policy changed concurrently');
    return row(r.rows[0]);
  }
  async matchingPolicy(org, c) {
    const r = await this.pool.query(`SELECT * FROM approval_policies WHERE organization_id=$1 AND enabled AND action=$2
      AND (project_id IS NULL OR project_id=$3) AND (environment IS NULL OR environment=$4) AND (resource_type IS NULL OR resource_type=$5)
      ORDER BY ((environment IS NOT NULL)::int+(project_id IS NOT NULL)::int) DESC,created_at,id LIMIT 1`, [org, c.action, c.projectId || null, c.environment || null, c.resourceType || null]);
    return row(r.rows[0]);
  }
  async request(actor, org, context, snapshot, key) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.APPROVAL_REQUEST);
    const p = await this.matchingPolicy(org, context);
    if (!p) return { state: 'not_required', approval: null };
    if (context.projectId) await this.repository.getProject(actor, org, context.projectId);
    const safe = canonicalize(snapshot), created = this.clock();
    const r = await this.pool.query(`INSERT INTO approval_requests(id,organization_id,policy_id,project_id,environment,resource_type,resource_id,action,risk_level,requester_id,policy_version,resource_version,snapshot,snapshot_digest,state,required_count,separation_of_duties,expires_at,idempotency_key_hash,eligible_roles,eligible_user_ids,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16,$17,$18,$19,$20,$21)
      ON CONFLICT(organization_id,idempotency_key_hash) DO NOTHING RETURNING *`,
    [randomUUID(), org, p.id, context.projectId || null, context.environment || null, context.resourceType, context.resourceId || null, context.action, context.riskLevel || p.riskLevel, actor, p.version, context.resourceVersion || null, safe, snapshotDigest(safe), p.requiredCount, p.separationOfDuties, new Date(created.getTime() + p.expiresInSeconds * 1000), hash(key), JSON.stringify(p.eligibleRoles), JSON.stringify(p.eligibleUserIds), created]);
    const raw = r.rows[0] || (await this.pool.query('SELECT * FROM approval_requests WHERE organization_id=$1 AND idempotency_key_hash=$2', [org, hash(key)])).rows[0];
    const item = await this._hydrate(raw);
    if (r.rowCount) await this._emit('approval.requested', item, actor, { action: item.action, snapshotDigest: item.snapshotDigest });
    return { state: item.state, approval: item };
  }
  async _hydrate(raw) {
    const item = row(raw);
    delete item.idempotencyKeyHash;
    const r = await this.pool.query(`SELECT d.actor_user_id AS "actorId",d.authorization_version AS "authorizationVersion",d.role,d.created_at AS at
      FROM approval_decisions d JOIN approval_requests a ON a.id=d.approval_request_id
      WHERE a.id=$1 AND a.organization_id=$2 AND d.decision='approved' ORDER BY d.created_at,d.actor_user_id`, [item.id, item.organizationId]);
    item.approvals = r.rows.map(x => ({ ...x, at: x.at.toISOString() }));
    return item;
  }
  async _expire(item) {
    if (['pending', 'approved', 'overridden'].includes(item.state) && this.clock() >= new Date(item.expiresAt)) {
      const version = item.version; item.state = 'expired'; item.version++;
      await this._save(this.pool, item, version); await this._emit('approval.expired', item, null);
    }
    return item;
  }
  async get(actor, org, id, permission = PERMISSIONS.POLICY_READ) {
    await this.repository.requireAccess(actor, org, permission);
    const r = await this.pool.query('SELECT * FROM approval_requests WHERE id=$1 AND organization_id=$2', [id, org]);
    if (!r.rowCount) fail('APPROVAL_NOT_FOUND', 'Approval not found', 404);
    return this._expire(await this._hydrate(r.rows[0]));
  }
  async list(actor, org) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.POLICY_READ);
    const r = await this.pool.query('SELECT * FROM approval_requests WHERE organization_id=$1 ORDER BY created_at,id', [org]);
    const items = [];
    for (const raw of r.rows) items.push(await this._expire(await this._hydrate(raw)));
    return items;
  }
  async _save(client, item, version) {
    const r = await client.query(`UPDATE approval_requests SET state=$3,version=$4,rejection_reason=$5,override=$6,updated_at=NOW()
      WHERE id=$1 AND organization_id=$2 AND version=$7 RETURNING id`, [item.id, item.organizationId, item.state, item.version, item.rejectionReason, item.override || null, version]);
    if (!r.rowCount) fail('VERSION_CONFLICT', 'Approval changed concurrently');
  }
  async decide(actor, org, id, { decision, reason }) {
    const item = await this.get(actor, org, id, PERMISSIONS.APPROVAL_DECIDE), version = item.version;
    if (item.state !== 'pending') fail('APPROVAL_NOT_PENDING', 'Approval is not pending');
    const m = await this._membership(actor, org);
    if (item.separationOfDuties && actor === item.requesterId) fail('SELF_APPROVAL_DENIED', 'Requester cannot approve this action', 403);
    if (!item.eligibleRoles.includes(m.role) && !item.eligibleUserIds.includes(actor)) fail('APPROVER_NOT_ELIGIBLE', 'Actor is not eligible to approve this action', 403);
    if (!['approve', 'reject'].includes(decision)) fail('APPROVAL_DECISION_INVALID', 'Decision must be approve or reject', 400);
    if (item.approvals.some(a => a.actorId === actor)) fail('DUPLICATE_APPROVER', 'Approver already voted');
    if (decision === 'reject') {
      if (!reason || reason.trim().length < 4) fail('REJECTION_REASON_REQUIRED', 'A rejection reason is required', 400);
      item.rejectionReason = reason.trim(); this.transition(item, 'rejected');
    } else {
      item.approvals.push({ actorId: actor, authorizationVersion: m.authorizationVersion, role: m.role, at: this.clock().toISOString() });
      item.version++;
      if (item.approvals.length >= item.requiredCount) this.transition(item, 'approved');
    }
    await withTransaction(this.pool, async client => {
      await this._save(client, item, version);
      await client.query(`INSERT INTO approval_decisions(approval_request_id,actor_user_id,decision,role,authorization_version,reason,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, actor, decision === 'approve' ? 'approved' : 'rejected', m.role, m.authorizationVersion, decision === 'reject' ? item.rejectionReason : null, this.clock()]);
    });
    await this._emit(decision === 'approve' ? 'approval.approved' : 'approval.rejected', item, actor, decision === 'approve' ? { approvalCount: item.approvals.length } : { reason: item.rejectionReason });
    return item;
  }
  async override(actor, org, id, justification) {
    const item = await this.get(actor, org, id), version = item.version;
    await this.repository.requireAccess(actor, org, PERMISSIONS.APPROVAL_OVERRIDE);
    if (!justification || justification.trim().length < 12) fail('OVERRIDE_JUSTIFICATION_REQUIRED', 'Emergency override justification is required', 400);
    this.transition(item, 'overridden'); item.override = { actorId: actor, justification: justification.trim(), at: this.clock().toISOString() };
    await this._save(this.pool, item, version); await this._emit('approval.overridden', item, actor, { justification: item.override.justification }); return item;
  }
  async cancel(actor, org, id) {
    const item = await this.get(actor, org, id), version = item.version;
    if (actor !== item.requesterId) await this.repository.requireAccess(actor, org, PERMISSIONS.APPROVAL_POLICY_MANAGE);
    this.transition(item, 'cancelled'); await this._save(this.pool, item, version); await this._emit('approval.cancelled', item, actor); return item;
  }
  async invalidate(actor, org, id, reason = 'Material action data changed') {
    const item = await this.get(actor, org, id), version = item.version;
    this.transition(item, 'invalidated'); await this._save(this.pool, item, version); await this._emit('approval.invalidated', item, actor, { reason }); return item;
  }
  async beginExecution(actor, org, id, snapshot, key) {
    const item = await this.get(actor, org, id), version = item.version;
    if (!['approved', 'overridden', 'not_required'].includes(item.state)) fail('APPROVAL_NOT_EXECUTABLE', 'Approval is not executable');
    const invalidate = async (code, message) => { this.transition(item, 'invalidated'); await this._save(this.pool, item, version); await this._emit('approval.invalidated', item, actor, { reason: code }); fail(code, message); };
    if (snapshotDigest(snapshot) !== item.snapshotDigest) await invalidate('APPROVAL_SNAPSHOT_CHANGED', 'Approved action changed materially');
    const p = await this.matchingPolicy(org, item);
    if (!p || p.id !== item.policyId || p.version !== item.policyVersion) await invalidate('APPROVAL_POLICY_CHANGED', 'Approval policy changed');
    for (const a of item.approvals) {
      const m = await this._membership(a.actorId, org);
      if (m.authorizationVersion !== a.authorizationVersion || (!item.eligibleRoles.includes(m.role) && !item.eligibleUserIds.includes(a.actorId))) await invalidate('APPROVER_AUTHORIZATION_CHANGED', 'Approver authorization changed');
    }
    this.transition(item, 'executing');
    await withTransaction(this.pool, async client => {
      const inserted = await client.query(`INSERT INTO protected_action_executions(id,organization_id,approval_request_id,execution_key_hash,state)
        VALUES($1,$2,$3,$4,'executing') ON CONFLICT DO NOTHING RETURNING id`, [randomUUID(), org, id, hash(key)]);
      if (!inserted.rowCount) fail('APPROVAL_ALREADY_CONSUMED', 'Protected action already executed');
      await this._save(client, item, version);
      await this._emit('approval.executing', item, actor);
    });
    return item;
  }
  async finishExecution(id, succeeded = true, org) {
    // Internal worker call: the tenant is required even when there is no user actor.
    const r = await this.pool.query('SELECT * FROM approval_requests WHERE id=$1 AND organization_id=$2', [id, org]);
    if (!r.rowCount) fail('APPROVAL_NOT_FOUND', 'Approval not found', 404);
    const item = await this._hydrate(r.rows[0]), version = item.version;
    this.transition(item, succeeded ? 'consumed' : 'failed');
    await withTransaction(this.pool, async client => {
      await this._save(client, item, version);
      await client.query('UPDATE protected_action_executions SET state=$3,completed_at=$4 WHERE approval_request_id=$1 AND organization_id=$2', [id, org, item.state, this.clock()]);
    });
    await this._emit(succeeded ? 'approval.consumed' : 'approval.failed', item, null); return item;
  }
}
module.exports = { PostgresApprovalStore };
