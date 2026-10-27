const { randomUUID } = require('crypto');
const { ControlPlaneError } = require('../errors');
const { PERMISSIONS } = require('../auth/rbac');
const { row } = require('../database/rows');
const { MemoryPolicyExceptionStore } = require('./exceptions');
const { withTransaction, bindTransactions } = require('../database/transaction');
const fail = (code, message, status = 409) => { throw new ControlPlaneError(status, code, message); };

class PostgresPolicyExceptionStore {
  constructor(repository, { pool = repository.pool, clock = () => new Date(), eventSink = () => {} } = {}) {
    Object.assign(this, { repository, pool, clock, eventSink });
    bindTransactions(pool);
    for (const name of ['request', 'approve', 'revoke', '_refresh']) {
      const method = this[name].bind(this);
      this[name] = (...args) => withTransaction(pool, () => method(...args));
    }
  }
  _emit(...args) { return MemoryPolicyExceptionStore.prototype._emit.apply(this, args); }
  _row(raw) {
    const x = row(raw);
    x.targetId = x.deploymentTargetId; x.approvalId = x.approvalRequestId;
    delete x.deploymentTargetId; delete x.approvalRequestId;
    return x;
  }
  async request(actor, org, input) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.POLICY_EXCEPTION_REQUEST);
    if (!input.projectId || !input.environment || !input.targetId || !input.policyId || !input.serviceId || !input.justification || !input.compensatingControl)
      fail('POLICY_EXCEPTION_SCOPE_REQUIRED', 'A narrow scope, justification and compensating control are required', 400);
    const start = new Date(input.startsAt || this.clock()), end = new Date(input.expiresAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end - start > 30 * 86400000)
      fail('POLICY_EXCEPTION_EXPIRY_INVALID', 'Exception must expire within 30 days', 400);
    await this.repository.getProject(actor, org, input.projectId);
    const service = await this.repository.getService(actor, org, input.serviceId);
    if (service.projectId !== input.projectId) fail('POLICY_EXCEPTION_SCOPE_REQUIRED', 'Service is outside the project', 404);
    const target = await this.pool.query('SELECT id FROM deployment_targets WHERE id=$1 AND organization_id=$2', [input.targetId, org]);
    if (!target.rowCount) fail('DEPLOYMENT_TARGET_NOT_FOUND', 'Deployment target not found', 404);
    if (input.approvalId) {
      const a = await this.pool.query('SELECT id FROM approval_requests WHERE id=$1 AND organization_id=$2 AND (project_id IS NULL OR project_id=$3)', [input.approvalId, org, input.projectId]);
      if (!a.rowCount) fail('APPROVAL_NOT_FOUND', 'Approval not found', 404);
    }
    const r = await this.pool.query(`INSERT INTO policy_exceptions(id,organization_id,project_id,environment,deployment_target_id,policy_id,service_id,workload_id,justification,compensating_control,requester_id,starts_at,expires_at,status,policy_version,resource_version,approval_request_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,$15,$16) RETURNING *`,
    [randomUUID(), org, input.projectId, input.environment, input.targetId, input.policyId, input.serviceId, input.workloadId || null, input.justification, input.compensatingControl, actor, start, end, input.policyVersion, input.resourceVersion, input.approvalId || null]);
    const x = this._row(r.rows[0]); await this._emit('policy_exception.requested', x, actor); return x;
  }
  async _save(x, version) {
    const r = await this.pool.query(`UPDATE policy_exceptions SET status=$3,approver_id=$4,version=$5,updated_at=NOW()
      WHERE id=$1 AND organization_id=$2 AND version=$6 RETURNING id`, [x.id, x.organizationId, x.status, x.approverId, x.version, version]);
    if (!r.rowCount) fail('VERSION_CONFLICT', 'Policy exception changed concurrently');
    return x;
  }
  async _refresh(x) {
    const previous = x.status, time = this.clock().getTime();
    if (['active', 'approved'].includes(x.status) && time >= Date.parse(x.expiresAt)) x.status = 'expired';
    else if (x.status === 'approved' && time >= Date.parse(x.startsAt)) x.status = 'active';
    if (previous !== x.status) {
      const version = x.version++;
      await this._save(x, version);
      if (x.status === 'expired') await this._emit('policy_exception.expired', x, null, { workloadAction: 'report_noncompliant_no_automatic_delete' });
    }
    return x;
  }
  async get(actor, org, id, permission = PERMISSIONS.POLICY_READ) {
    await this.repository.requireAccess(actor, org, permission);
    const r = await this.pool.query('SELECT * FROM policy_exceptions WHERE id=$1 AND organization_id=$2', [id, org]);
    if (!r.rowCount) fail('POLICY_EXCEPTION_NOT_FOUND', 'Policy exception not found', 404);
    return this._refresh(this._row(r.rows[0]));
  }
  async list(actor, org) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.POLICY_READ);
    const r = await this.pool.query('SELECT * FROM policy_exceptions WHERE organization_id=$1 ORDER BY created_at,id', [org]);
    const items = [];
    for (const raw of r.rows) items.push(await this._refresh(this._row(raw)));
    return items;
  }
  async approve(actor, org, id, { approvalId, policyVersion, resourceVersion }) {
    const x = await this.get(actor, org, id, PERMISSIONS.POLICY_EXCEPTION_APPROVE), version = x.version;
    if (x.status !== 'pending') fail('POLICY_EXCEPTION_NOT_PENDING', 'Exception is not pending');
    if (actor === x.requesterId) fail('SELF_APPROVAL_DENIED', 'Requester cannot approve an exception', 403);
    if (!approvalId || approvalId !== x.approvalId || policyVersion !== x.policyVersion || resourceVersion !== x.resourceVersion)
      fail('POLICY_EXCEPTION_INVALIDATED', 'Exception approval or resource version changed');
    x.status = this.clock() < new Date(x.startsAt) ? 'approved' : 'active'; x.approverId = actor; x.version++;
    await this._save(x, version); await this._emit('policy_exception.approved', x, actor); return this._refresh(x);
  }
  async applies(org, scope) {
    const r = await this.pool.query(`SELECT * FROM policy_exceptions WHERE organization_id=$1 AND project_id=$2 AND environment=$3
      AND deployment_target_id=$4 AND policy_id=$5 AND service_id=$6 AND (workload_id IS NULL OR workload_id=$7)`,
    [org, scope.projectId, scope.environment, scope.targetId, scope.policyId, scope.serviceId, scope.workloadId || null]);
    let active = false;
    for (const raw of r.rows) if ((await this._refresh(this._row(raw))).status === 'active') active = true;
    return active;
  }
  async revoke(actor, org, id) {
    await this.repository.requireAccess(actor, org, PERMISSIONS.SECURITY_POLICY_MANAGE);
    const x = await this.get(actor, org, id), version = x.version;
    if (!['pending', 'approved', 'active'].includes(x.status)) fail('POLICY_EXCEPTION_TERMINAL', 'Exception is already terminal');
    x.status = 'revoked'; x.version++;
    await this._save(x, version); await this._emit('policy_exception.revoked', x, actor); return x;
  }
}
module.exports = { PostgresPolicyExceptionStore };
