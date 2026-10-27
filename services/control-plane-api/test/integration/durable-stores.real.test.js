const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');
const { Pool } = require('pg');
const { PostgresRepository } = require('../../src/domain/postgres-repository');
const { PostgresPreviewStore } = require('../../src/previews/postgres-store');
const { PostgresByocStore } = require('../../src/byoc/postgres-store');
const { PostgresSecretReferenceStore } = require('../../src/secrets/postgres-store');
const { PostgresApprovalStore } = require('../../src/approvals/postgres-store');
const { PostgresPolicyExceptionStore } = require('../../src/policy/postgres-exceptions');
const { AwsCloudAccountProvider } = require('../../src/byoc/aws-provider');
const { createApplication } = require('../../src/server');
const { MemoryDeploymentQueue } = require('../../src/queue/deployment-queue');

const uuid = () => crypto.randomUUID();
const rejects = (work, code) => assert.rejects(work, e => e.code === code);
describe('Part 1 durable stores (real PostgreSQL)', function () {
  let pool, repo, actor, approver, org, other, project, service, repositoryId, environment;
  let byocOptions, secretOptions;
  const preview = () => new PostgresPreviewStore(new PostgresRepository(pool));
  const byoc = () => new PostgresByocStore(new PostgresRepository(pool), byocOptions);
  const secrets = () => new PostgresSecretReferenceStore(new PostgresRepository(pool), { ...secretOptions, byocStore: byoc() });
  const approvals = options => new PostgresApprovalStore(new PostgresRepository(pool), options);
  const exceptions = options => new PostgresPolicyExceptionStore(new PostgresRepository(pool), options);
  const awsInput = { displayName: 'AWS test', roleArn: 'arn:aws:iam::123456789012:role/platform', expectedAccountId: '123456789012', permittedRegions: ['us-east-1'] };
  const targetInput = () => ({ name: uuid(), apiServerOrigin: 'https://cluster.example.test:6443', allowedNamespaces: ['team'], allowedEnvironments: ['staging'], authenticationMethod: 'service_account_token', serviceAccountToken: 'synthetic-test-credential' });
  const previewInput = () => ({ projectId: project, serviceId: service, repositoryId, commitSha: 'a'.repeat(40), pullRequestNumber: 1 });
  const secretInput = () => ({ projectId: project, environmentId: environment, displayName: uuid(), providerType: 'aws_secrets_manager', externalIdentifier: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:synthetic', injectionKey: 'APP_CONFIG', protected: true });
  const policyInput = () => ({ action: 'deployment.production', projectId: project, eligibleRoles: ['approver'], resourceType: 'deployment', environment: 'production' });
  const context = () => ({ action: 'deployment.production', projectId: project, resourceType: 'deployment', environment: 'production', resourceVersion: 1 });
  const snapshot = { commitSha: 'a'.repeat(40) };

  before(async () => {
    assert.match(process.env.DURABILITY_DISPOSABLE_DATABASE || '', /^cp_part1_test_\d+_\d+$/);
    assert.equal(new URL(process.env.DATABASE_URL).pathname.slice(1), process.env.DURABILITY_DISPOSABLE_DATABASE);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    repo = new PostgresRepository(pool);
    byocOptions = {
      encryptionKey: crypto.randomBytes(32).toString('base64'),
      awsProvider: new AwsCloudAccountProvider({ platformPrincipalArn: 'arn:aws:iam::999999999999:role/platform', sts: { assumeRoleAndGetIdentity: async () => ({ accountId: '123456789012', principalArn: 'arn:aws:sts::123456789012:assumed-role/platform/test' }) } }),
      kubernetesProvider: { capabilities: () => [{ id: 'deploy', supportLevel: 'beta', enabled: true, evidence: 'test' }], validateTarget: async (_target, credential) => {
        assert.equal(credential, 'synthetic-test-credential');
        return { clusterFingerprint: uuid(), kubernetesVersion: 'v1.30', permissionValidation: 'passed', connectionHealth: 'healthy', capabilityResults: { deploy: true } };
      } },
    };
    secretOptions = { providers: { aws_secrets_manager: { validateReference: async () => ({ status: 'active', category: 'verified', checkedAt: new Date().toISOString() }) } } };
  });
  after(async () => { if (pool) await pool.end(); });
  beforeEach(async () => {
    actor = (await repo.upsertUser({ subject: uuid() })).id;
    approver = (await repo.upsertUser({ subject: uuid() })).id;
    org = (await repo.createOrganization(actor, { name: 'A', slug: `a-${uuid()}` })).id;
    other = (await repo.createOrganization(actor, { name: 'B', slug: `b-${uuid()}` })).id;
    await pool.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'approver')", [org, approver]);
    project = (await repo.createProject(actor, org, { name: 'Test', slug: `p-${uuid()}` })).id;
    repositoryId = uuid(); service = uuid(); environment = uuid();
    await pool.query(`INSERT INTO repository_references(id,organization_id,project_id,provider,external_id,name,default_branch,visibility) VALUES($1,$2,$3,'github',$4,'test','main','private')`, [repositoryId, org, project, uuid()]);
    await pool.query("INSERT INTO services(id,organization_id,project_id,repository_id,name) VALUES($1,$2,$3,$4,'test')", [service, org, project, repositoryId]);
    await pool.query("INSERT INTO environment_references(id,organization_id,project_id,name,type) VALUES($1,$2,$3,'staging','staging')", [environment, org, project]);
  });

  it('preview policy, revision, readiness and cleanup survive fresh instances', async () => {
    await preview().policy(actor, org, { ...previewInput(), configurationSnapshot: { replicas: 1 } });
    assert.equal((await preview().getPolicy(org, service)).createdBy, actor);
    const created = await preview().create(actor, org, previewInput(), 'preview-one');
    assert.equal((await preview().create(actor, org, previewInput(), 'preview-one')).created, false);
    assert.equal((await preview().get(actor, org, created.preview.id)).revision.commitSha, 'a'.repeat(40));
    const route = await preview().route(actor, org, { previewId: created.preview.id, namespace: 'team', resourceName: 'test', backendService: 'test', backendPort: 3000 });
    await rejects(() => preview().markReady(created.preview.id, { organizationId: org, routeId: route.id, deploymentHealthy: true, httpVerified: true }), 'PREVIEW_NOT_VERIFIED');
    await preview().updateRoute(org, route.id, { status: 'ready', certificateStatus: 'ready', organizationId: other });
    await preview().markReady(created.preview.id, { organizationId: org, routeId: route.id, deploymentHealthy: true, httpVerified: true });
    await preview().setDeploymentResource(org, created.preview.id, { namespace: 'team' });
    assert.equal((await preview().get(actor, org, created.preview.id)).lifecycleStatus, 'ready');
    const job = await preview().scheduleCleanup(created.preview.id, 'manual', org);
    assert.equal((await preview().due(org))[0].id, job.id);
    await preview().cleanupFailed(job, new Error('must not persist provider credentials'));
    assert.equal((await pool.query('SELECT last_error FROM preview_cleanup_jobs WHERE id=$1', [job.id])).rows[0].last_error, 'PREVIEW_CLEANUP_FAILED');
    await preview().cleanupComplete(job);
    assert.equal((await preview().get(actor, org, created.preview.id)).lifecycleStatus, 'removed');
    const recreated = await preview().create(actor, org, { ...previewInput(), commitSha: 'b'.repeat(40) }, 'new-preview');
    assert.notEqual(recreated.preview.id, created.preview.id);
  });
  it('preview tenant isolation covers reads, writes, routes, cleanup and related resources', async () => {
    await preview().policy(actor, org, previewInput());
    const { preview: p } = await preview().create(actor, org, previewInput(), 'p');
    const route = await preview().route(actor, org, { previewId: p.id, namespace: 'team', resourceName: 'test', backendService: 'test', backendPort: 3000 });
    await rejects(() => preview().get(actor, other, p.id), 'PREVIEW_NOT_FOUND');
    await rejects(() => preview().updateRoute(other, route.id, { status: 'ready' }), 'ROUTE_NOT_FOUND');
    await rejects(() => preview().scheduleCleanup(p.id, 'manual', other), 'PREVIEW_NOT_FOUND');
    await rejects(() => preview().policy(actor, other, previewInput()), 'PROJECT_NOT_FOUND');
    assert.deepEqual(await preview().list(actor, other), []);
    assert.deepEqual(await preview().due(other), []);
  });
  it('preview validation and a failed second write leave no partial instance', async () => {
    await preview().policy(actor, org, previewInput());
    await rejects(() => preview().create(actor, org, { ...previewInput(), commitSha: 'bad' }, 'bad'), 'COMMIT_SHA_INVALID');
    await rejects(() => preview().create(actor, org, { ...previewInput(), forked: true }, 'fork'), 'FORK_TRUST_UNVERIFIED');
    // Force a constraint failure on the revision insert after the instance insert.
    await rejects(() => preview().create(actor, org, { ...previewInput(), providerDeliveryId: 'x'.repeat(129) }, 'too-long'), '22001');
    assert.equal((await preview().list(actor, org)).length, 0);
  });
  it('domain challenges, failed attempts, activation and removal are durable and tenant scoped', async () => {
    const input = { projectId: project, serviceId: service, hostname: `${uuid()}.example.test` };
    const { domain, instructions } = await preview().requestDomain(actor, org, input);
    const db = (await pool.query('SELECT token_hash FROM domain_verification_challenges WHERE custom_domain_id=$1', [domain.id])).rows[0];
    assert.notEqual(db.token_hash, instructions.value);
    await rejects(() => preview().requestDomain(actor, org, input), 'DOMAIN_ALREADY_CLAIMED');
    await rejects(() => preview().verifyDomain(actor, other, domain.id, { token: 'bad' }), 'DOMAIN_NOT_FOUND');
    await rejects(() => preview().verifyDomain(actor, org, domain.id, { token: 'bad' }), 'DOMAIN_VERIFICATION_FAILED');
    assert.equal((await pool.query('SELECT attempts FROM domain_verification_challenges WHERE custom_domain_id=$1', [domain.id])).rows[0].attempts, 1);
    await preview().verifyDomain(actor, org, domain.id, { dnsValues: [instructions.value] });
    await preview().activateDomain(actor, org, domain.id, { namespace: 'team', resourceName: 'domain', backendService: 'test', backendPort: 3000 });
    assert.equal((await preview().listDomains(actor, org))[0].status, 'activating');
    await preview().removeDomain(actor, org, domain.id);
    assert.deepEqual(await preview().listDomains(actor, org), []);
    assert.equal((await pool.query('SELECT * FROM domain_verification_challenges WHERE custom_domain_id=$1', [domain.id])).rowCount, 0);
    assert.ok((await preview().requestDomain(actor, org, input)).domain.id);
  });
  it('BYOC AWS creation, encrypted identity, validation and versions persist', async () => {
    const { connection: c } = await byoc().createAws(actor, org, awsInput, 'aws');
    assert.equal((await byoc().createAws(actor, org, awsInput, 'aws')).created, false);
    assert.equal((await byoc().listConnections(actor, org))[0].id, c.id);
    const stored = (await pool.query('SELECT external_id_ciphertext FROM provider_connections WHERE id=$1', [c.id])).rows[0];
    assert.ok(JSON.parse(stored.external_id_ciphertext.toString()).ciphertext);
    assert.equal((await byoc().validateAws(actor, org, c.id, 1)).status, 'active');
    assert.equal((await byoc().connection(actor, org, c.id)).version, 3);
    assert.equal((await pool.query('SELECT * FROM connection_capabilities WHERE provider_connection_id=$1', [c.id])).rowCount, 3);
    await rejects(() => byoc().updateAws(actor, org, c.id, {}, 1), 'VERSION_CONFLICT');
    const updated = await byoc().updateAws(actor, org, c.id, {}, 3);
    assert.equal(updated.configurationVersion, 2);
    await byoc().lifecycle(actor, org, c.id, 'revoke', 4);
    await rejects(() => byoc().validateAws(actor, org, c.id, 5), 'CONNECTION_NOT_USABLE');
    await rejects(() => byoc().connection(actor, other, c.id), 'PROVIDER_CONNECTION_NOT_FOUND');
    await rejects(() => byoc().lifecycle(actor, other, c.id, 'revoke', 5), 'PROVIDER_CONNECTION_NOT_FOUND');
  });
  it('BYOC target credentials rotate atomically and never appear in metadata', async () => {
    const { target: t } = await byoc().createKubernetesTarget(actor, org, targetInput(), 'target');
    assert.equal((await byoc().createKubernetesTarget(actor, org, targetInput(), 'target')).created, false);
    await byoc().validateTarget(actor, org, t.id, 1);
    assert.equal((await byoc().assertTargetUsable(actor, org, t.id, { environment: 'staging', namespace: 'team' })).status, 'active');
    await rejects(() => byoc().assertTargetUsable(actor, org, t.id, { environment: 'production', namespace: 'team' }), 'TARGET_ENVIRONMENT_NOT_ALLOWED');
    await byoc().rotateTargetCredential(actor, org, t.id, 'synthetic-test-credential', 3);
    const versions = (await pool.query('SELECT * FROM credential_versions WHERE deployment_target_id=$1 ORDER BY version', [t.id])).rows;
    assert.equal(versions.length, 2); assert.ok(versions[0].revoked_at); assert.equal(versions[1].revoked_at, null);
    assert.ok(!versions[1].encrypted_payload.toString().includes('synthetic-test-credential'));
    assert.ok(!JSON.stringify(await byoc().target(actor, org, t.id)).includes('ciphertext'));
    await byoc().targetLifecycle(actor, org, t.id, 'revoke', 4);
    await rejects(() => byoc().rotateTargetCredential(actor, org, t.id, 'unused', 5), 'TARGET_REVOKED');
    await rejects(() => byoc().target(actor, other, t.id), 'DEPLOYMENT_TARGET_NOT_FOUND');
    await rejects(() => byoc().rotateTargetCredential(actor, other, t.id, 'unused', 5), 'DEPLOYMENT_TARGET_NOT_FOUND');
  });
  it('BYOC failed validation persists terminal attempt and safe failure category', async () => {
    const { connection: c } = await byoc().createAws(actor, org, awsInput, 'aws');
    const failing = new PostgresByocStore(repo, { ...byocOptions, awsProvider: { ...byocOptions.awsProvider, validateIdentity: async () => { throw Object.assign(new Error('private provider message'), { code: 'AWS_ACCOUNT_MISMATCH' }); } } });
    await rejects(() => failing.validateAws(actor, org, c.id, 1), 'AWS_ACCOUNT_MISMATCH');
    assert.equal((await byoc().connection(actor, org, c.id)).status, 'invalid');
    assert.equal((await pool.query('SELECT status FROM connection_validation_attempts WHERE provider_connection_id=$1', [c.id])).rows[0].status, 'failed');
  });
  it('secret references persist with masking, validation, rotation and durable empty attachments', async () => {
    const s = await secrets().create(actor, org, secretInput());
    assert.ok(s.externalIdentifier.startsWith('***'));
    assert.equal((await secrets().get(actor, org, s.id)).version, 1);
    await secrets().validate(actor, org, s.id, 1);
    assert.equal((await secrets().list(actor, org))[0].status, 'active');
    await secrets().attach(actor, org, service, [s.id], 0);
    const refs = await secrets().deploymentReferences(actor, org, { projectId: project, serviceId: service, environmentId: environment });
    assert.equal(refs[0].id, s.id);
    await rejects(() => secrets().deploymentReferences(actor, org, { projectId: project, serviceId: service, environmentId: environment, isPreview: true }), 'PROTECTED_SECRET_PREVIEW_DENIED');
    await secrets().attach(actor, org, service, [], 1);
    await rejects(() => secrets().attach(actor, org, service, [s.id], 0), 'VERSION_CONFLICT');
    assert.equal((await secrets().attach(actor, org, service, [s.id], 2)).version, 3);
    assert.equal((await secrets().rotate(actor, org, s.id, { versionSelector: 'v2' }, 2)).referenceVersion, 2);
    await secrets().lifecycle(actor, org, s.id, 'revoke', 3);
    assert.equal((await secrets().get(actor, org, s.id)).externalIdentifier, 'revoked');
    await rejects(() => secrets().rotate(actor, org, s.id, {}, 4), 'SECRET_REFERENCE_REVOKED');
  });
  it('secret tenant and related-owner checks prevent cross-organization references', async () => {
    const s = await secrets().create(actor, org, secretInput());
    await rejects(() => secrets().get(actor, other, s.id), 'SECRET_REFERENCE_NOT_FOUND');
    await rejects(() => secrets().rotate(actor, other, s.id, {}, 1), 'SECRET_REFERENCE_NOT_FOUND');
    assert.deepEqual(await secrets().list(actor, other), []);
    const foreign = (await byoc().createAws(actor, other, awsInput, 'foreign')).connection;
    await rejects(() => secrets().create(actor, org, { ...secretInput(), providerConnectionId: foreign.id }), 'PROVIDER_CONNECTION_NOT_FOUND');
    await rejects(() => secrets().create(actor, org, { ...secretInput(), environmentId: uuid() }), 'ENVIRONMENT_NOT_FOUND');
    await rejects(() => secrets().attach(actor, other, service, [s.id]), 'SERVICE_NOT_FOUND');
  });
  it('secret provider failures persist invalid state and optimistic conflicts preserve data', async () => {
    const s = await secrets().create(actor, org, secretInput());
    const failing = new PostgresSecretReferenceStore(repo, { byocStore: byoc(), providers: { aws_secrets_manager: { validateReference: async () => { throw Object.assign(new Error('safe'), { code: 'REFERENCE_INVALID' }); } } } });
    await rejects(() => failing.validate(actor, org, s.id, 1), 'REFERENCE_INVALID');
    assert.equal((await secrets().get(actor, org, s.id)).status, 'invalid');
    await rejects(() => secrets().rotate(actor, org, s.id, {}, 1), 'VERSION_CONFLICT');
    await rejects(() => secrets().create(actor, org, { ...secretInput(), displayName: s.displayName }), '23505');
  });
  it('approval policies, votes and exactly-once execution records survive fresh instances', async () => {
    await approvals().setPolicy(actor, org, policyInput());
    const a = (await approvals().request(actor, org, context(), snapshot, 'request')).approval;
    assert.equal((await approvals().request(actor, org, context(), snapshot, 'request')).approval.id, a.id);
    await rejects(() => approvals().decide(actor, org, a.id, { decision: 'approve' }), 'SELF_APPROVAL_DENIED');
    await approvals().decide(approver, org, a.id, { decision: 'approve' });
    assert.equal((await approvals().get(actor, org, a.id)).approvals[0].actorId, approver);
    await approvals().beginExecution(actor, org, a.id, snapshot, 'execute');
    await approvals().finishExecution(a.id, true, org);
    assert.equal((await approvals().get(actor, org, a.id)).state, 'consumed');
    assert.equal((await pool.query('SELECT state FROM protected_action_executions WHERE approval_request_id=$1', [a.id])).rows[0].state, 'consumed');
    await rejects(() => approvals().beginExecution(actor, org, a.id, snapshot, 'execute'), 'APPROVAL_NOT_EXECUTABLE');
  });
  it('approval scope, version, invalidation and override metadata remain durable', async () => {
    const p = await approvals().setPolicy(actor, org, policyInput());
    await rejects(() => approvals().setPolicy(actor, org, policyInput(), 0), 'POLICY_VERSION_CONFLICT');
    assert.equal((await approvals().setPolicy(actor, org, policyInput(), p.version)).version, 2);
    const a = (await approvals().request(actor, org, context(), snapshot, 'a')).approval;
    await rejects(() => approvals().get(actor, other, a.id), 'APPROVAL_NOT_FOUND');
    await rejects(() => approvals().cancel(actor, other, a.id), 'APPROVAL_NOT_FOUND');
    await rejects(() => approvals().finishExecution(a.id, true, other), 'APPROVAL_NOT_FOUND');
    assert.deepEqual(await approvals().listPolicies(actor, other), []);
    await approvals().override(actor, org, a.id, 'Emergency approved for test');
    assert.equal((await approvals().get(actor, org, a.id)).override.actorId, actor);
    await rejects(() => approvals().beginExecution(actor, org, a.id, { changed: true }, 'x'), 'APPROVAL_SNAPSHOT_CHANGED');
    assert.equal((await approvals().get(actor, org, a.id)).state, 'invalidated');
  });
  it('approval expiration and rejection survive new stores', async () => {
    await approvals().setPolicy(actor, org, policyInput());
    const a = (await approvals().request(actor, org, context(), snapshot, 'a')).approval;
    await approvals().decide(approver, org, a.id, { decision: 'reject', reason: 'Change requires revision' });
    assert.equal((await approvals().get(actor, org, a.id)).rejectionReason, 'Change requires revision');
    const b = (await approvals().request(actor, org, context(), snapshot, 'b')).approval;
    assert.equal((await approvals({ clock: () => new Date(Date.now() + 86400000) }).get(actor, org, b.id)).state, 'expired');
    assert.equal((await approvals().get(actor, org, b.id)).state, 'expired');
  });
  it('policy exceptions persist narrow scope, activation, expiration and revocation', async () => {
    const target = (await byoc().createKubernetesTarget(actor, org, targetInput(), 't')).target;
    await approvals().setPolicy(actor, org, policyInput());
    const a = (await approvals().request(actor, org, context(), snapshot, 'a')).approval;
    const input = { projectId: project, serviceId: service, environment: 'production', targetId: target.id, policyId: 'policy', justification: 'Test justification', compensatingControl: 'Manual review', policyVersion: 1, resourceVersion: 1, approvalId: a.id, expiresAt: new Date(Date.now() + 3600000).toISOString() };
    const x = await exceptions().request(actor, org, input);
    await rejects(() => exceptions().get(actor, other, x.id), 'POLICY_EXCEPTION_NOT_FOUND');
    await rejects(() => exceptions().revoke(actor, other, x.id), 'POLICY_EXCEPTION_NOT_FOUND');
    await rejects(() => exceptions().approve(actor, org, x.id, input), 'SELF_APPROVAL_DENIED');
    // Security administrators can approve exceptions.
    await pool.query("UPDATE organization_members SET role='security_admin' WHERE organization_id=$1 AND user_id=$2", [org, approver]);
    await exceptions().approve(approver, org, x.id, input);
    assert.equal(await exceptions().applies(org, input), true);
    assert.equal(await exceptions().applies(other, input), false);
    assert.equal((await exceptions({ clock: () => new Date(Date.now() + 7200000) }).get(actor, org, x.id)).status, 'expired');
    assert.equal((await exceptions().get(actor, org, x.id)).status, 'expired');
    const y = await exceptions().request(actor, org, input);
    await exceptions().revoke(actor, org, y.id);
    assert.equal((await exceptions().get(actor, org, y.id)).status, 'revoked');
    await rejects(() => exceptions().request(actor, other, input), 'PROJECT_NOT_FOUND');
    await rejects(() => exceptions().request(actor, org, { ...input, expiresAt: 'invalid' }), 'POLICY_EXCEPTION_EXPIRY_INVALID');
  });
  it('database constraints reject foreign keys and duplicate credential versions', async () => {
    const { target } = await byoc().createKubernetesTarget(actor, org, targetInput(), 't');
    await rejects(() => pool.query(`INSERT INTO credential_versions(id,organization_id,deployment_target_id,version,encryption_algorithm,encrypted_payload,nonce,authentication_tag)
      SELECT $1,organization_id,deployment_target_id,version,encryption_algorithm,encrypted_payload,nonce,authentication_tag FROM credential_versions WHERE deployment_target_id=$2`, [uuid(), target.id]), '23505');
    await rejects(() => pool.query('UPDATE deployment_targets SET provider_connection_id=$2 WHERE id=$1', [target.id, uuid()]), '23503');
    const constraints = await pool.query("SELECT conname FROM pg_constraint WHERE conrelid='secret_references'::regclass AND contype='f'");
    assert.ok(constraints.rows.some(x => x.conname === 'secret_environment_fk'));
    const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE tablename='preview_revisions'");
    assert.ok(indexes.rows.some(x => x.indexname === 'preview_revision_idempotency_idx'));
  });
  it('database outages propagate instead of silently falling back to memory', async () => {
    const broken = { query: async () => { throw Object.assign(new Error('unavailable'), { code: '08006' }); } };
    const authorized = { pool: broken, requireAccess: async () => {} };
    await rejects(() => new PostgresPreviewStore(authorized).list(actor, org), '08006');
    await rejects(() => new PostgresByocStore(authorized, byocOptions).listConnections(actor, org), '08006');
    await rejects(() => new PostgresSecretReferenceStore(authorized, secretOptions).list(actor, org), '08006');
    await rejects(() => new PostgresApprovalStore(authorized).list(actor, org), '08006');
    await rejects(() => new PostgresPolicyExceptionStore(authorized).list(actor, org), '08006');
  });
  it('server composition selects all five PostgreSQL stores', async () => {
    const app = createApplication({ env: { NODE_ENV: 'test', AUTH_MODE: 'test', CONTROL_PLANE_STORAGE: 'postgres', DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: 'redis://127.0.0.1:56379', DEPLOYMENT_TARGET: 'test' }, pool, repository: repo, deploymentQueue: new MemoryDeploymentQueue() });
    assert.ok(app.previewStore instanceof PostgresPreviewStore);
    assert.ok(app.byocStore instanceof PostgresByocStore);
    assert.ok(app.secretStore instanceof PostgresSecretReferenceStore);
    assert.ok(app.approvalStore instanceof PostgresApprovalStore);
    assert.ok(app.policyExceptionStore instanceof PostgresPolicyExceptionStore);
  });
  it('HTTP routes await durable reads and mutations and reject foreign tenant IDs', async () => {
    const identity = await repo.getCurrentUser(actor);
    const app = createApplication({ env: { NODE_ENV: 'test', AUTH_MODE: 'test', CONTROL_PLANE_STORAGE: 'postgres', DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: 'redis://127.0.0.1:56379', DEPLOYMENT_TARGET: 'test' }, pool, repository: repo, testIdentity: { subject: identity.externalSubject }, deploymentQueue: new MemoryDeploymentQueue() });
    const server = http.createServer(app.handle);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const call = async (tenant, path, method = 'GET', body) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/organizations/${tenant}/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, body: await response.json() };
    };
    try {
      const s = await secrets().create(actor, org, secretInput());
      await byoc().createAws(actor, org, awsInput, 'aws');
      await preview().policy(actor, org, previewInput());
      const p = (await preview().create(actor, org, previewInput(), 'p')).preview;
      await approvals().setPolicy(actor, org, policyInput());
      const a = (await approvals().request(actor, org, context(), snapshot, 'a')).approval;
      for (const path of ['secret-references', 'provider-connections', 'previews', 'approval-policies', 'approvals']) {
        const response = await call(org, path);
        assert.equal(response.status, 200, path);
        assert.equal(response.body.items.length, 1, path);
        assert.equal((await call(other, path)).body.items.length, 0, path);
      }
      assert.equal((await call(other, `previews/${p.id}`)).status, 404);
      assert.equal((await call(other, `approvals/${a.id}`)).status, 404);
      assert.equal((await call(other, `secret-references/${s.id}/rotate`, 'POST', { expectedVersion: 1, versionSelector: 'v2' })).status, 404);
      const changed = await call(org, `secret-references/${s.id}/rotate`, 'POST', { expectedVersion: 1, versionSelector: 'v2' });
      assert.equal(changed.status, 200);
      assert.equal((await secrets().get(actor, org, s.id)).referenceVersion, 2);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  it('credential rotation rolls back its parent update when the credential insert fails', async () => {
    const { target: t } = await byoc().createKubernetesTarget(actor, org, targetInput(), 't');
    // Duplicate the next version to force a real unique-constraint failure at the second write.
    await pool.query(`INSERT INTO credential_versions(id,organization_id,deployment_target_id,version,encryption_algorithm,encrypted_payload,nonce,authentication_tag)
      SELECT $1,organization_id,deployment_target_id,2,encryption_algorithm,encrypted_payload,nonce,authentication_tag FROM credential_versions WHERE deployment_target_id=$2`, [uuid(), t.id]);
    await rejects(() => byoc().rotateTargetCredential(actor, org, t.id, 'synthetic-test-credential', 1), '23505');
    assert.equal((await byoc().target(actor, org, t.id)).credentialVersion, 1);
    assert.equal((await pool.query('SELECT revoked_at FROM credential_versions WHERE deployment_target_id=$1 AND version=1', [t.id])).rows[0].revoked_at, null);
  });
  it('all five stores await authorization before reading a tenant', async () => {
    const outsider = (await repo.upsertUser({ subject: uuid() })).id;
    for (const read of [
      () => preview().list(outsider, org),
      () => byoc().listConnections(outsider, org),
      () => secrets().list(outsider, org),
      () => approvals().list(outsider, org),
      () => exceptions().list(outsider, org),
    ]) await rejects(read, 'PERMISSION_DENIED');
  });
  it('approval validation, duplicate voters and pending membership guards retain their contract', async () => {
    await rejects(() => approvals().setPolicy(actor, org, { ...policyInput(), action: 'not-an-action' }), 'APPROVAL_ACTION_INVALID');
    await rejects(() => approvals().setPolicy(actor, org, { ...policyInput(), requiredCount: 11 }), 'APPROVAL_COUNT_INVALID');
    await rejects(() => approvals().setPolicy(actor, org, { ...policyInput(), requiredCount: 2 }), 'APPROVAL_POLICY_UNSATISFIABLE');
    const second = (await repo.upsertUser({ subject: uuid() })).id;
    await pool.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'approver')", [org, second]);
    await approvals().setPolicy(actor, org, { ...policyInput(), requiredCount: 2 });
    const a = (await approvals().request(actor, org, context(), snapshot, 'a')).approval;
    await rejects(() => approvals().assertApproverChangeSafe(org, second), 'FINAL_ELIGIBLE_APPROVER_REQUIRED');
    await approvals().decide(approver, org, a.id, { decision: 'approve' });
    await rejects(() => approvals().decide(approver, org, a.id, { decision: 'approve' }), 'DUPLICATE_APPROVER');
    assert.equal((await approvals().get(actor, org, a.id)).approvals.length, 1);
    await approvals().cancel(actor, org, a.id);
    assert.equal((await approvals().get(actor, org, a.id)).state, 'cancelled');
  });
  it('preview, secret, approval and exception foreign keys reject nonexistent parents', async () => {
    await preview().policy(actor, org, previewInput());
    const p = (await preview().create(actor, org, previewInput(), 'p')).preview;
    await rejects(() => pool.query('UPDATE preview_instances SET service_id=$2 WHERE id=$1', [p.id, uuid()]), '23503');
    const s = await secrets().create(actor, org, secretInput());
    await rejects(() => pool.query('UPDATE secret_references SET environment_id=$2 WHERE id=$1', [s.id, uuid()]), '23503');
    await approvals().setPolicy(actor, org, policyInput());
    const a = (await approvals().request(actor, org, context(), snapshot, 'a')).approval;
    await rejects(() => pool.query('UPDATE approval_requests SET policy_id=$2 WHERE id=$1', [a.id, uuid()]), '23503');
    const t = (await byoc().createKubernetesTarget(actor, org, targetInput(), 't')).target;
    const x = await exceptions().request(actor, org, { projectId: project, serviceId: service, environment: 'staging', targetId: t.id, policyId: 'policy', justification: 'Test', compensatingControl: 'Review', policyVersion: 1, resourceVersion: 1, expiresAt: new Date(Date.now() + 3600000).toISOString() });
    await rejects(() => pool.query('UPDATE policy_exceptions SET deployment_target_id=$2 WHERE id=$1', [x.id, uuid()]), '23503');
  });
});
