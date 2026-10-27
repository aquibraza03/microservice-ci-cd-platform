const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('crypto');
const { fork } = require('child_process');
const path = require('path');
const { Pool } = require('pg');
const { services } = require('../helpers/persistence-process');
const { withTransaction } = require('../../src/database/transaction');
const { PostgresDeploymentStore } = require('../../src/deployments/postgres-store');
const { PostgresByocStore } = require('../../src/byoc/postgres-store');
const { AwsCloudAccountProvider } = require('../../src/byoc/aws-provider');
const { revalidateDeployment } = require('../../src/worker/authorization');
const { DriftDetector } = require('../../src/policy/drift');
const { dispatchDeploymentOutbox } = require('../../src/queue/outbox');

const helper = path.join(__dirname, '../helpers/persistence-process.js');
async function launch(input) {
  const child = fork(helper, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = ''; child.stderr.on('data', x => { stderr += x; });
  await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject); child.once('exit', code => reject(new Error(`Child exited ${code}: ${stderr}`))); });
  const result = new Promise((resolve, reject) => { child.on('message', m => { if (!m.ready) resolve(m); }); child.once('error', reject); child.once('exit', code => { if (code) reject(new Error(`Child exited ${code}: ${stderr}`)); }); });
  return { child, start: () => { child.send(input); return result; } };
}
async function processes(inputs) { const workers = await Promise.all(inputs.map(launch)); return Promise.all(workers.map(w => w.start())); }

describe('Part 2 persistence and concurrency (disposable PostgreSQL)', function () {
  this.timeout(20000);
  let pool, s, key, actor, org, other, project, repositoryId, service;
  const uid = () => randomUUID();
  const auditInput = i => ({ organizationId: org, actorId: actor, action: 'test.recorded', resourceType: 'test', resourceId: String(i), result: 'success', sourceCategory: 'test', idempotencyKey: `audit:${i}` });
  const usageInput = i => ({ organizationId: org, meterId: 'deployment_count', quantity: 1, sourceResourceId: String(i), idempotencyKey: `usage:${i}` });
  const reservation = (id, quantity = 1) => ({ organizationId: org, resourceType: 'builds', quantity, ownerOperation: id, idempotencyKey: id });
  before(() => {
    assert.match(process.env.DURABILITY_DISPOSABLE_DATABASE || '', /^cp_part1_test_\d+_\d+$/);
    assert.equal(new URL(process.env.DATABASE_URL).pathname.slice(1), process.env.DURABILITY_DISPOSABLE_DATABASE);
    pool = new Pool({ connectionString: process.env.DATABASE_URL }); key = randomBytes(32).toString('base64'); s = services(pool, key);
  });
  after(async () => { await pool.end(); });
  beforeEach(async () => {
    actor = (await s.repo.upsertUser({ subject: uid() })).id;
    org = (await s.repo.createOrganization(actor, { name: 'A', slug: uid() })).id;
    other = (await s.repo.createOrganization(actor, { name: 'B', slug: uid() })).id;
    project = (await s.repo.createProject(actor, org, { name: 'P', slug: uid() })).id;
    repositoryId = uid(); service = uid();
    await pool.query("INSERT INTO repository_references(id,organization_id,project_id,provider,external_id,name,default_branch,visibility) VALUES($1,$2,$3,'github',$4,'test','main','private')", [repositoryId, org, project, uid()]);
    await pool.query("INSERT INTO services(id,organization_id,project_id,repository_id,name) VALUES($1,$2,$3,$4,'test')", [service, org, project, repositoryId]);
  });
  it('serializes quota 7+7 against limit 10 across independent processes', async () => {
    await s.quota.setLimit(org, 'builds', 10);
    const results = await processes(['a','b'].map(id => ({ action: 'quota', key, reservation: reservation(id, 7) })));
    assert.equal(results.filter(x => x.result).length, 1);
    assert.equal(results.filter(x => x.error?.code === 'QUOTA_EXCEEDED').length, 1);
    assert.equal(Number((await pool.query("SELECT SUM(quantity) AS q FROM quota_reservations WHERE organization_id=$1 AND status='active'", [org])).rows[0].q), 7);
  });
  it('quota duplicate, consume, release, expiry and rollback preserve authoritative totals', async () => {
    await s.quota.setLimit(org, 'builds', 2);
    const a = await s.quota.reserve(reservation('one'));
    assert.equal((await s.quota.reserve(reservation('one'))).reservationId, a.reservationId);
    assert.equal((await s.quota.consume(a.reservationId, other)).consumed, false);
    assert.equal((await s.quota.consume(a.reservationId, org)).consumed, true);
    assert.equal((await s.quota.release(a.reservationId, org)).released, true);
    assert.equal((await s.quota.release(a.reservationId, org)).released, false);
    await assert.rejects(withTransaction(pool, async () => { await s.quota.reserve(reservation('rollback')); throw new Error('injected'); }), /injected/);
    assert.equal((await pool.query("SELECT 1 FROM quota_reservations WHERE organization_id=$1 AND idempotency_key='rollback'", [org])).rowCount, 0);
    const b = await s.quota.reserve(reservation('expire'));
    await pool.query("UPDATE quota_reservations SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [b.reservationId]);
    await s.quota.expire();
    assert.equal((await s.quota.reserve(reservation('expire'))).status, 'expired');
    await assert.rejects(s.quota.reserve(reservation('negative', -1)), { code: 'QUOTA_INVALID' });
  });
  it('concurrent usage produces exact totals and retries do not double count', async () => {
    const items = Array.from({ length: 20 }, (_, i) => usageInput(i));
    const result = await processes([0,1].map(() => ({ action: 'usage', key, items })));
    assert.ok(result.every(x => !x.error), JSON.stringify(result));
    assert.deepEqual(await s.usage.aggregate(org), { 'deployment_count:v1': 20 });
    assert.deepEqual(await s.usage.aggregate(other), {});
    assert.equal((await pool.query('SELECT * FROM usage_events WHERE organization_id=$1', [org])).rowCount, 20);
  });
  it('audit concurrent writers and duplicate retries maintain one continuous chain', async () => {
    const items = Array.from({ length: 12 }, (_, i) => auditInput(i));
    const result = await processes([0,1].map(() => ({ action: 'audit', key, items })));
    assert.ok(result.every(x => !x.error), JSON.stringify(result));
    const verification = await s.audit.verify(actor, org);
    assert.equal(verification.valid, true); assert.equal(verification.checkedEvents, 12);
    assert.equal((await pool.query('SELECT * FROM audit_outbox WHERE organization_id=$1', [org])).rowCount, 12);
    await assert.rejects(pool.query("UPDATE enterprise_audit_events SET event_hash=repeat('0',64) WHERE organization_id=$1", [org]), /append-only/);
  });
  it('durable export grant is tenant scoped, single-use under concurrency and persists retention', async () => {
    await s.audit.append(auditInput(1));
    const exportKey = uid();
    const exp = await s.audit.requestExport(actor, org, {}, exportKey);
    const retry = await services(pool, key).audit.requestExport(actor, org, {}, exportKey);
    assert.equal(retry.id, exp.id); assert.equal(retry.downloadToken, exp.downloadToken);
    await assert.rejects(s.audit.download(actor, other, exp.id, exp.downloadToken), { code: 'AUDIT_EXPORT_NOT_FOUND' });
    const outcomes = await Promise.allSettled([services(pool, key).audit.download(actor, org, exp.id, exp.downloadToken), s.audit.download(actor, org, exp.id, exp.downloadToken)]);
    assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
    const expired = await s.audit.requestExport(actor, org, {}, uid());
    await pool.query("UPDATE audit_exports SET download_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [expired.id]);
    await assert.rejects(s.audit.download(actor, org, expired.id, expired.downloadToken), { code: 'AUDIT_EXPORT_EXPIRED' });
    await s.audit.setRetention(actor, org, 90);
    assert.equal((await services(pool, key).audit.retentionDetails(actor, org)).applicationRetentionDays, 90);
    const outsider = (await s.repo.upsertUser({ subject: uid() })).id;
    await assert.rejects(s.audit.search(outsider, org), { code: 'PERMISSION_DENIED' });
    await assert.rejects(s.audit.requestExport(outsider, org), { code: 'PERMISSION_DENIED' });
  });
  it('plan assignments and overrides reconstruct from durable inputs after process restart', async () => {
    await s.plans.assign(org, 'team');
    await s.plans.override({ organizationId: org, entitlement: 'concurrent_builds', value: 8, reason: 'test', actorId: actor });
    await s.usage.append(usageInput(1)); await s.audit.append(auditInput(1));
    await s.quota.setLimit(org, 'builds', 2); await s.quota.reserve(reservation('restart'));
    const input = { action: 'read', key, actor, org };
    const first = (await processes([input]))[0];
    const second = (await processes([input]))[0];
    assert.ok(!first.error && !second.error, JSON.stringify([first, second]));
    assert.equal(second.result.plan.entitlements.concurrent_builds, 8);
    assert.deepEqual(first.result.usage, second.result.usage);
    assert.equal(second.result.audit.valid, true);
    assert.equal(second.result.quota[0].status, 'active');
  });
  it('only one process consumes an approved request', async () => {
    const approver = (await s.repo.upsertUser({ subject: uid() })).id;
    await pool.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'approver')", [org, approver]);
    await s.approvals.setPolicy(actor, org, { action: 'deployment.production', eligibleRoles: ['approver'], requiredCount: 1 });
    const snapshot = { commitSha: 'a'.repeat(40) };
    const { approval } = await s.approvals.request(actor, org, { action: 'deployment.production', resourceType: 'deployment' }, snapshot, uid());
    await s.approvals.decide(approver, org, approval.id, { decision: 'approve' });
    const result = await processes([0,1].map(i => ({ action: 'approval', key, actor, org, id: approval.id, snapshot, executionKey: `execute-${i}` })));
    assert.equal(result.filter(x => x.result).length, 1, JSON.stringify(result));
    assert.ok(['APPROVAL_ALREADY_CONSUMED','APPROVAL_NOT_EXECUTABLE','VERSION_CONFLICT'].includes(result.find(x => x.error).error.code));
    assert.equal((await pool.query('SELECT * FROM protected_action_executions WHERE approval_request_id=$1', [approval.id])).rowCount, 1);
    assert.equal((await s.approvals.get(actor, org, approval.id)).state, 'executing');
    assert.equal((await s.audit.search(actor, org, { action: 'approval.executing' })).items.length, 1);
  });
  it('process termination during BYOC validation is recovered durably', async () => {
    const byoc = new PostgresByocStore(s.repo, { encryptionKey: key, awsProvider: new AwsCloudAccountProvider({ platformPrincipalArn: 'arn:aws:iam::999999999999:role/platform' }) });
    const { connection } = await byoc.createAws(actor, org, { displayName: 'test', roleArn: 'arn:aws:iam::123456789012:role/platform', expectedAccountId: '123456789012', permittedRegions: ['us-east-1'] }, uid());
    const worker = await launch({ action: 'interrupt-byoc', key, actor, org, id: connection.id, version: 1 });
    assert.equal((await worker.start()).validating, true);
    const exited = new Promise(resolve => worker.child.once('exit', resolve)); worker.child.kill(); await exited;
    await pool.query("UPDATE connection_validation_attempts SET started_at=NOW()-INTERVAL '2 minutes' WHERE provider_connection_id=$1", [connection.id]);
    await pool.query("UPDATE provider_connections SET last_validation_at=NOW()-INTERVAL '2 minutes' WHERE id=$1", [connection.id]);
    const result = (await processes([{ action: 'recover-byoc', key }]))[0];
    assert.equal(result.result, 1, JSON.stringify(result));
    assert.equal((await byoc.connection(actor, org, connection.id)).status, 'invalid');
    const attempt = (await pool.query('SELECT * FROM connection_validation_attempts WHERE provider_connection_id=$1', [connection.id])).rows[0];
    assert.equal(attempt.status, 'failed'); assert.equal(attempt.retryable, true);
  });
  it('async authorization waits for denial before inspecting external resources', async () => {
    let called = false;
    const detector = new DriftDetector({ requireAccess: async () => { throw new Error('denied'); } }, { inspect: async () => { called = true; } });
    await assert.rejects(detector.run(actor, org, {}), /denied/); assert.equal(called, false);
  });
  it('worker revalidates revoked membership and cross-tenant service references', async () => {
    const d = { organizationId: org, triggeringUserId: actor, projectId: project, serviceId: service, repositoryId, environment: 'staging' };
    await revalidateDeployment(s.repo, d);
    await assert.rejects(revalidateDeployment(s.repo, { ...d, organizationId: other }));
    await pool.query("UPDATE organization_members SET role='viewer' WHERE user_id=$1 AND organization_id=$2", [actor, org]);
    await assert.rejects(revalidateDeployment(s.repo, { ...d, triggerSource: 'rollback' }), { code: 'PERMISSION_DENIED' });
    await pool.query("UPDATE organization_members SET status='revoked',authorization_version=authorization_version+1 WHERE user_id=$1 AND organization_id=$2", [actor, org]);
    await assert.rejects(revalidateDeployment(s.repo, d), { code: 'PERMISSION_DENIED' });
  });
  it('queue publication failure retains committed outbox work for a later worker', async () => {
    const store = new PostgresDeploymentStore(s.repo, pool);
    // The store's reference validation requires an active provider installation; this test
    // isolates committed transition/outbox behavior using an already accepted deployment.
    const id = uid();
    await pool.query("INSERT INTO deployments(id,organization_id,project_id,service_id,repository_id,branch,commit_sha,triggering_user_id,environment,provider,current_state,idempotency_key_hash,trigger_source,configuration_snapshot) VALUES($1,$2,$3,$4,$5,'main',$6,$7,'staging','github','waiting_for_approval',$8,'manual','{}')", [id, org, project, service, repositoryId, 'a'.repeat(40), actor, uid()]);
    await store.transition(id, 'queued', { expectedVersion: 1, commandId: uid() });
    await assert.rejects(dispatchDeploymentOutbox(pool, { enqueue: async () => { throw new Error('broker unavailable'); } }, store), /broker unavailable/);
    assert.equal((await pool.query('SELECT * FROM deployment_outbox WHERE deployment_id=$1 AND delivered_at IS NULL', [id])).rowCount, 1);
    let delivered = 0;
    await dispatchDeploymentOutbox(pool, { enqueue: async () => { delivered++; } }, store);
    assert.equal(delivered, 1);
    assert.equal((await pool.query('SELECT * FROM deployment_outbox WHERE deployment_id=$1 AND delivered_at IS NULL', [id])).rowCount, 0);
  });
  it('HTTP application restarts preserve billing and audit reads', async () => {
    const subject = (await pool.query('SELECT external_subject FROM users WHERE id=$1', [actor])).rows[0].external_subject;
    await s.plans.assign(org, 'team'); await s.usage.append(usageInput(1)); await s.audit.append(auditInput(1));
    const observed = [];
    for (let i = 0; i < 2; i++) {
      const app = await launch({ action: 'serve', key, subject });
      const started = await app.start(); assert.ok(started.listening, JSON.stringify(started));
      try {
        const base = `http://127.0.0.1:${started.listening}/api/v1/organizations/${org}`;
        const billing = await fetch(`${base}/billing/overview`); assert.equal(billing.status, 200); observed.push(await billing.json());
        const audit = await fetch(`${base}/audit/events`); assert.equal(audit.status, 200); assert.ok((await audit.json()).items.length >= 1);
      } finally {
        const exited = new Promise(resolve => app.child.once('exit', resolve)); app.child.send({ stop: true }); await exited;
      }
    }
    assert.deepEqual(observed[0], observed[1]);
    assert.equal(observed[1].currentUsage['deployment_count:v1'], 1);
  });
  it('preview creation races deduplicate and an audit failure rolls back new state', async () => {
    const { PostgresPreviewStore } = require('../../src/previews/postgres-store');
    const previews = new PostgresPreviewStore(s.repo);
    const input = { projectId: project, serviceId: service, repositoryId, commitSha: 'a'.repeat(40), pullRequestNumber: 5 };
    await previews.policy(actor, org, input);
    const result = await Promise.all([previews.create(actor, org, input, 'same'), previews.create(actor, org, input, 'same')]);
    assert.equal(result.filter(x => x.created).length, 1);
    assert.equal((await pool.query('SELECT * FROM preview_revisions WHERE organization_id=$1', [org])).rowCount, 1);
    const append = s.repo.auditService.appendInTransaction;
    s.repo.auditService.appendInTransaction = async () => { throw new Error('audit unavailable'); };
    try { await assert.rejects(previews.create(actor, org, { ...input, pullRequestNumber: 6 }, 'fail'), /audit unavailable/); }
    finally { s.repo.auditService.appendInTransaction = append; }
    assert.equal((await pool.query('SELECT * FROM preview_instances WHERE organization_id=$1', [org])).rowCount, 1);
  });
  it('secret attachment audit failure rolls back the attachment version', async () => {
    const { PostgresSecretReferenceStore } = require('../../src/secrets/postgres-store');
    const store = new PostgresSecretReferenceStore(s.repo, {});
    const append = s.repo.auditService.appendInTransaction;
    s.repo.auditService.appendInTransaction = async () => { throw new Error('audit unavailable'); };
    try { await assert.rejects(store.attach(actor, org, service, [], 0), /audit unavailable/); }
    finally { s.repo.auditService.appendInTransaction = append; }
    assert.equal(Number((await pool.query('SELECT secret_attachment_version FROM services WHERE id=$1', [service])).rows[0].secret_attachment_version), 0);
  });
  it('project creation rolls back if its owner membership insert fails', async () => {
    const { PostgresRepository } = require('../../src/domain/postgres-repository');
    const brokenPool = { query: pool.query.bind(pool), connect: async () => {
      const client = await pool.connect();
      return { release: () => client.release(), query: (sql, values) => {
        if (sql.startsWith('INSERT INTO project_members')) throw new Error('membership insert failed');
        return client.query(sql, values);
      } };
    } };
    const slug = uid();
    await assert.rejects(new PostgresRepository(brokenPool).createProject(actor, org, { name: 'rollback', slug }), /membership insert failed/);
    assert.equal((await pool.query('SELECT * FROM projects WHERE slug=$1', [slug])).rowCount, 0);
  });
  it('actual production composition is durable and dependency loss makes readiness fail closed', async () => {
    const { productionEnv } = require('../helpers/production-config');
    const { createApplication } = require('../../src/server');
    const http = require('http');
    const app = createApplication({ pool, env: productionEnv() });
    const server = http.createServer(app.handle);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/v1/ready`;
    try {
      for (const name of ['repository','deploymentStore','previewStore','byocStore','secretStore','approvalStore','policyExceptionStore','auditService','usageLedger','entitlements','quotaManager']) assert.match(app[name].constructor.name, /^Postgres/);
      assert.equal((await fetch(url)).status, 200);
      // Rename only tables in this run's uniquely named disposable database.
      for (const table of ['enterprise_audit_events','usage_events','quota_reservations']) {
        await pool.query(`ALTER TABLE ${table} RENAME TO ${table}_unavailable`);
        try {
          assert.equal((await fetch(url)).status, 503);
          if (table === 'enterprise_audit_events') await assert.rejects(app.auditService.append(auditInput(uid())));
          if (table === 'usage_events') await assert.rejects(app.usageLedger.append(usageInput(uid())));
          if (table === 'quota_reservations') await assert.rejects(app.quotaManager.reserve(reservation(uid())));
        } finally { await pool.query(`ALTER TABLE ${table}_unavailable RENAME TO ${table}`); }
      }
    } finally { await new Promise(resolve => server.close(resolve)); await app.deploymentQueue.close(); }
    const unavailable = new Pool({ connectionString: 'postgres://127.0.0.1:1/unavailable_fixture', connectionTimeoutMillis: 300 });
    const failed = createApplication({ pool: unavailable, env: productionEnv() });
    const second = http.createServer(failed.handle);
    await new Promise(resolve => second.listen(0, '127.0.0.1', resolve));
    try { assert.equal((await fetch(`http://127.0.0.1:${second.address().port}/api/v1/ready`)).status, 503); assert.equal(failed.repository.constructor.name, 'PostgresRepository'); }
    finally { await new Promise(resolve => second.close(resolve)); await failed.deploymentQueue.close(); await unavailable.end(); }
  });
  it('all five Part 1 stores survive writer exit and fresh reader processes', async () => {
    const environment = uid();
    await pool.query("INSERT INTO environment_references(id,organization_id,project_id,name,type) VALUES($1,$2,$3,'staging','staging')", [environment, org, project]);
    const seed = (await processes([{ action: 'seed-part1', key, actor, org, project, service, repositoryId, environment }]))[0];
    assert.ok(!seed.error, JSON.stringify(seed));
    for (let i = 0; i < 2; i++) {
      const read = (await processes([{ action: 'read-part1', key, actor, org, ...seed.result }]))[0];
      assert.ok(!read.error, JSON.stringify(read));
      assert.equal(read.result.preview.id, seed.result.previewId);
      assert.equal(read.result.connection.id, seed.result.connectionId);
      assert.equal(read.result.secret.id, seed.result.secretId);
      assert.equal(read.result.approval.id, seed.result.approvalId);
      assert.equal(read.result.exceptions[0].id, seed.result.exceptionId);
    }
  });
  it('real BullMQ worker processes start, stop and restart against shared durable state', async () => {
    const queueName = `part2-worker-${uid()}`;
    Object.assign(s.repo, { usageLedger: s.usage, quotaManager: s.quota, entitlements: s.plans });
    const store = new PostgresDeploymentStore(s.repo, pool);
    const { deployment } = await store.create(actor, org, { projectId: project, serviceId: service, repositoryId, branch: 'main', commitSha: 'a'.repeat(40), environment: 'staging', configurationSnapshot: {} }, uid());
    await pool.query("UPDATE organization_members SET status='revoked',authorization_version=authorization_version+1 WHERE organization_id=$1 AND user_id=$2", [org, actor]);
    for (let i = 0; i < 2; i++) {
      const app = await launch({ action: 'worker', key, queueName, deploymentId: deployment.id, org });
      const result = await app.start(); assert.equal(result.workerReady, true, JSON.stringify(result));
      const exited = new Promise(resolve => app.child.once('exit', resolve)); app.child.send({ stop: true }); assert.equal(await exited, 0);
      assert.equal(result.deploymentState, 'failed');
    }
    assert.equal((await pool.query('SELECT * FROM deployment_job_attempts WHERE deployment_id=$1', [deployment.id])).rowCount, 0);
    const cleanup = new (require('bullmq').Queue)(queueName, { connection: { url: 'redis://127.0.0.1:56379' } });
    await cleanup.obliterate({ force: true }); await cleanup.close();
  });
  it('approval resumption commits exactly one deployment, quota reservation, usage event and outbox effect', async () => {
    Object.assign(s.repo, { usageLedger: s.usage, quotaManager: s.quota, entitlements: s.plans });
    const store = new PostgresDeploymentStore(s.repo, pool);
    const input = { projectId: project, serviceId: service, repositoryId, branch: 'main', commitSha: 'a'.repeat(40), environment: 'production', initialState: 'waiting_for_approval', configurationSnapshot: {} };
    const { deployment } = await store.create(actor, org, input, uid());
    const approver = (await s.repo.upsertUser({ subject: uid() })).id;
    await pool.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'approver')", [org, approver]);
    await s.approvals.setPolicy(actor, org, { action: 'deployment.production', eligibleRoles: ['approver'] });
    const snapshot = require('../../src/approvals/canonical').deploymentSnapshot({ ...input, organizationId: org, requestingActorId: actor });
    const { approval } = await s.approvals.request(actor, org, { action: 'deployment.production', resourceType: 'deployment', resourceId: deployment.id }, snapshot, uid());
    await s.approvals.decide(approver, org, approval.id, { decision: 'approve' });
    const result = await processes([0,1].map(i => ({ action: 'resume', key, actor, org, id: approval.id, snapshot, deploymentId: deployment.id, executionKey: `resume-${i}` })));
    assert.equal(result.filter(x => x.result).length, 1, JSON.stringify(result));
    assert.equal((await s.approvals.get(actor, org, approval.id)).state, 'consumed');
    assert.equal((await store.getInternal(deployment.id, org)).currentState, 'queued');
    for (const table of ['deployments','protected_action_executions','quota_reservations','usage_events','deployment_outbox']) {
      assert.equal((await pool.query(`SELECT * FROM ${table} WHERE organization_id=$1`, [org])).rowCount, 1, table);
    }
    assert.deepEqual(await s.usage.aggregate(org), { 'deployment_count:v1': 1 });
    assert.equal((await s.audit.search(actor, org, { action: 'approval.consumed' })).items.length, 1);
    assert.equal((await s.audit.verify(actor, org)).valid, true);
    await revalidateDeployment(s.repo, await store.getInternal(deployment.id, org));
    await pool.query("UPDATE organization_members SET authorization_version=authorization_version+1 WHERE user_id=$1 AND organization_id=$2", [approver, org]);
    await assert.rejects(revalidateDeployment(s.repo, await store.getInternal(deployment.id, org)), { code: 'APPROVER_AUTHORIZATION_CHANGED' });
  });
  it('worker rejects revoked secrets, detached references and rotated target credentials', async () => {
    const { PostgresSecretReferenceStore } = require('../../src/secrets/postgres-store');
    const environment = uid();
    await pool.query("INSERT INTO environment_references(id,organization_id,project_id,name,type) VALUES($1,$2,$3,'staging','staging')", [environment, org, project]);
    const secrets = new PostgresSecretReferenceStore(s.repo, { providers: { aws_secrets_manager: {} } });
    const ref = await secrets.create(actor, org, { projectId: project, environmentId: environment, displayName: 'worker', providerType: 'aws_secrets_manager', externalIdentifier: 'synthetic-reference', injectionKey: 'CONFIG' });
    await pool.query("UPDATE secret_references SET status='active' WHERE id=$1", [ref.id]);
    await secrets.attach(actor, org, service, [ref.id], 0);
    const d = { organizationId: org, triggeringUserId: actor, projectId: project, serviceId: service, repositoryId, environment: 'staging', configurationSnapshot: { secretReferences: [{ id: ref.id, referenceVersion: 1 }] } };
    await revalidateDeployment(s.repo, d);
    await secrets.attach(actor, org, service, [], 1);
    await assert.rejects(revalidateDeployment(s.repo, d), { code: 'SECRET_REFERENCE_CHANGED' });
    await secrets.attach(actor, org, service, [ref.id], 2);
    await secrets.lifecycle(actor, org, ref.id, 'revoke', 1);
    await assert.rejects(revalidateDeployment(s.repo, d), { code: 'SECRET_REFERENCE_CHANGED' });
    const byoc = new PostgresByocStore(s.repo, { encryptionKey: key });
    const { target } = await byoc.createKubernetesTarget(actor, org, { name: uid(), apiServerOrigin: 'https://cluster.example.test', allowedNamespaces: ['team'], allowedEnvironments: ['staging'], authenticationMethod: 'service_account_token', serviceAccountToken: 'synthetic-token' }, uid());
    await pool.query("UPDATE deployment_targets SET status='active',permission_validation='passed' WHERE id=$1", [target.id]);
    d.configurationSnapshot = { deploymentTargetId: target.id, targetCredentialVersion: 1, targetNamespace: 'team' };
    await revalidateDeployment(s.repo, d);
    await byoc.rotateTargetCredential(actor, org, target.id, 'synthetic-rotated-token', 1);
    await assert.rejects(revalidateDeployment(s.repo, d), { code: 'TARGET_NOT_USABLE' });
    await assert.rejects(revalidateDeployment(s.repo, { ...d, organizationId: other }));
  });
  it('queued authorization revocation prevents worker business effects and releases its reservation', async () => {
    Object.assign(s.repo, { usageLedger: s.usage, quotaManager: s.quota, entitlements: s.plans });
    const store = new PostgresDeploymentStore(s.repo, pool);
    const { deployment } = await store.create(actor, org, { projectId: project, serviceId: service, repositoryId, branch: 'main', commitSha: 'a'.repeat(40), environment: 'staging', configurationSnapshot: {} }, uid());
    await pool.query("UPDATE organization_members SET status='revoked',authorization_version=authorization_version+1 WHERE organization_id=$1 AND user_id=$2", [org, actor]);
    let external = false;
    const pipeline = new (require('../../src/worker/pipeline').DeploymentPipeline)({ repository: s.repo, store, workspaceFactory: async () => { external = true; }, gitProvider: {}, buildExecutor: {} });
    await assert.rejects(pipeline.execute(deployment.id, { organizationId: org }), { code: 'PERMISSION_DENIED' });
    assert.equal(external, false);
    assert.equal((await store.getInternal(deployment.id, org)).currentState, 'failed');
    assert.equal((await pool.query("SELECT * FROM quota_reservations WHERE organization_id=$1 AND status IN ('active','consumed')", [org])).rowCount, 0);
    assert.equal((await pool.query('SELECT * FROM deployment_job_attempts WHERE deployment_id=$1', [deployment.id])).rowCount, 0);
  });
  it('application approval audit supports internal events without a request ID', async () => {
    const { createApplication } = require('../../src/server');
    const { MemoryDeploymentQueue } = require('../../src/queue/deployment-queue');
    const app = createApplication({ pool, env: { NODE_ENV: 'test', AUTH_MODE: 'test', CONTROL_PLANE_STORAGE: 'postgres', AUDIT_INTEGRITY_KEY: key, CREDENTIAL_ENCRYPTION_KEY: key }, deploymentQueue: new MemoryDeploymentQueue() });
    await app.approvalStore.setPolicy(actor, org, { action: 'deployment.production', eligibleRoles: ['owner'], separationOfDuties: false });
    const result = await app.approvalStore.request(actor, org, { action: 'deployment.production', resourceType: 'deployment' }, { test: 'audit' }, uid());
    assert.equal(result.state, 'pending');
    assert.equal((await app.auditService.search(actor, org, { action: 'approval.requested' })).items.length, 1);
    assert.equal((await pool.query("SELECT * FROM audit_events WHERE organization_id=$1 AND action='approval.requested'", [org])).rowCount, 1);
  });
  it('durable system audit accepts pre-organization authentication events', async () => {
    const result = await s.audit.append({ ...auditInput(uid()), organizationId: '00000000-0000-0000-0000-000000000000', action: 'auth.login' });
    assert.ok(result.id);
    assert.equal((await pool.query('SELECT * FROM audit_outbox WHERE audit_event_id=$1', [result.id])).rowCount, 1);
  });
  it('audit accepts the existing base64 integrity-key contract across service instances', async () => {
    const { PostgresAuditService } = require('../../src/audit/postgres-service');
    await new PostgresAuditService(s.repo, { integrityKeys: { 1: key } }).append(auditInput(uid()));
    assert.equal((await s.audit.verify(actor, org)).valid, true);
  });
  it('worker revalidates the current emergency override authority', async () => {
    const store = new PostgresDeploymentStore(s.repo, pool);
    const input = { projectId: project, serviceId: service, repositoryId, branch: 'main', commitSha: 'a'.repeat(40), environment: 'production', initialState: 'waiting_for_approval', configurationSnapshot: {} };
    const { deployment } = await store.create(actor, org, input, uid());
    const operator = (await s.repo.upsertUser({ subject: uid() })).id;
    await pool.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'owner')", [org, operator]);
    await s.approvals.setPolicy(actor, org, { action: 'deployment.production', eligibleRoles: ['owner'] });
    const snapshot = require('../../src/approvals/canonical').deploymentSnapshot({ ...input, organizationId: org, requestingActorId: actor });
    const { approval } = await s.approvals.request(actor, org, { action: 'deployment.production', resourceType: 'deployment', resourceId: deployment.id }, snapshot, uid());
    await s.approvals.override(operator, org, approval.id, 'Emergency fixture approval');
    await s.approvals.beginExecution(actor, org, approval.id, snapshot, uid()); await s.approvals.finishExecution(approval.id, true, org);
    await revalidateDeployment(s.repo, deployment);
    await pool.query("UPDATE organization_members SET status='revoked',authorization_version=authorization_version+1 WHERE organization_id=$1 AND user_id=$2", [org, operator]);
    await assert.rejects(revalidateDeployment(s.repo, deployment), { code: 'PERMISSION_DENIED' });
  });
});
