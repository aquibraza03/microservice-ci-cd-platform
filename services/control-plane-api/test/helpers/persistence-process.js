const { Pool } = require('pg');
const { bindTransactions } = require('../../src/database/transaction');
const { PostgresRepository } = require('../../src/domain/postgres-repository');
const { PostgresAuditService } = require('../../src/audit/postgres-service');
const { PostgresUsageLedger, PostgresQuotaManager, PostgresEntitlementService } = require('../../src/billing/postgres');
const { PostgresApprovalStore } = require('../../src/approvals/postgres-store');
const { PostgresByocStore } = require('../../src/byoc/postgres-store');
const { PostgresPreviewStore } = require('../../src/previews/postgres-store');
const { PostgresSecretReferenceStore } = require('../../src/secrets/postgres-store');
const { PostgresPolicyExceptionStore } = require('../../src/policy/postgres-exceptions');

function services(pool, key) {
  bindTransactions(pool);
  const repo = new PostgresRepository(pool);
  const audit = new PostgresAuditService(repo, { integrityKeys: { 1: Buffer.from(key, 'base64') } });
  repo.auditService = audit;
  return { repo, audit, usage: new PostgresUsageLedger(pool), quota: new PostgresQuotaManager(pool), plans: new PostgresEntitlementService(pool),
    approvals: new PostgresApprovalStore(repo, { eventSink: e => audit.append({ ...e, actorId: e.actorUserId, result: 'success', sourceCategory: 'approval', idempotencyKey: `${e.action}:${e.resourceId}` }) }) };
}
if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  process.send({ ready: true });
  process.once('message', async input => {
    try {
      const s = services(pool, input.key); let result;
      if (input.action === 'serve') {
        const { createApplication } = require('../../src/server');
        const { MemoryDeploymentQueue } = require('../../src/queue/deployment-queue');
        const app = createApplication({ pool, env: { NODE_ENV: 'test', AUTH_MODE: 'test', CONTROL_PLANE_STORAGE: 'postgres', CREDENTIAL_ENCRYPTION_KEY: input.key, AUDIT_INTEGRITY_KEY: input.key, DEPLOYMENT_TARGET: 'test' }, deploymentQueue: new MemoryDeploymentQueue(), testIdentity: { subject: input.subject } });
        const server = require('http').createServer(app.handle);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        process.send({ listening: server.address().port });
        await new Promise(resolve => process.once('message', resolve));
        await new Promise(resolve => server.close(resolve));
        result = { stopped: true };
      }
      if (input.action === 'usage') result = await Promise.all(input.items.map(x => s.usage.append(x)));
      if (input.action === 'quota') result = await s.quota.reserve(input.reservation);
      if (input.action === 'audit') result = await Promise.all(input.items.map(x => s.audit.append(x)));
      if (input.action === 'approval') result = await s.approvals.beginExecution(input.actor, input.org, input.id, input.snapshot, input.executionKey);
      if (input.action === 'resume') {
        const { withTransaction } = require('../../src/database/transaction');
        const { PostgresDeploymentStore } = require('../../src/deployments/postgres-store');
        Object.assign(s.repo, { usageLedger: s.usage, quotaManager: s.quota, entitlements: s.plans });
        const store = new PostgresDeploymentStore(s.repo, pool);
        result = await withTransaction(pool, async () => {
          const d = await store.getInternal(input.deploymentId, input.org);
          await s.approvals.beginExecution(input.actor, input.org, input.id, input.snapshot, input.executionKey);
          const queued = await store.transition(d.id, 'queued', { expectedVersion: d.stateVersion, commandId: `approval:${input.id}` });
          await s.approvals.finishExecution(input.id, true, input.org);
          return queued;
        });
      }
      if (input.action === 'read') result = { usage: await s.usage.aggregate(input.org), plan: await s.plans.effective(input.org), audit: await s.audit.verify(input.actor, input.org), quota: (await pool.query('SELECT * FROM quota_reservations WHERE organization_id=$1', [input.org])).rows };
      if (input.action === 'read-part1') result = {
        preview: await new PostgresPreviewStore(s.repo).get(input.actor, input.org, input.previewId),
        secret: await new PostgresSecretReferenceStore(s.repo, {}).get(input.actor, input.org, input.secretId),
        approval: await s.approvals.get(input.actor, input.org, input.approvalId),
        exceptions: await new PostgresPolicyExceptionStore(s.repo).list(input.actor, input.org),
        connection: await new PostgresByocStore(s.repo, {}).connection(input.actor, input.org, input.connectionId),
      };
      if (input.action === 'seed-part1') {
        const previews = new PostgresPreviewStore(s.repo);
        const previewInput = { projectId: input.project, serviceId: input.service, repositoryId: input.repositoryId, commitSha: 'a'.repeat(40), pullRequestNumber: 1 };
        await previews.policy(input.actor, input.org, previewInput);
        const preview = await previews.create(input.actor, input.org, previewInput, 'restart-preview');
        const byoc = new PostgresByocStore(s.repo, { encryptionKey: input.key, awsProvider: new (require('../../src/byoc/aws-provider').AwsCloudAccountProvider)({ platformPrincipalArn: 'arn:aws:iam::999999999999:role/platform' }) });
        const { connection } = await byoc.createAws(input.actor, input.org, { displayName: 'restart', roleArn: 'arn:aws:iam::123456789012:role/platform', expectedAccountId: '123456789012', permittedRegions: ['us-east-1'] }, 'restart-connection');
        const { target } = await byoc.createKubernetesTarget(input.actor, input.org, { name: 'restart', apiServerOrigin: 'https://cluster.example.test', allowedNamespaces: ['team'], allowedEnvironments: ['production'], authenticationMethod: 'service_account_token', serviceAccountToken: 'synthetic-test-token' }, 'restart-target');
        const secrets = new PostgresSecretReferenceStore(s.repo, { byocStore: byoc, providers: { aws_secrets_manager: {} } });
        const secret = await secrets.create(input.actor, input.org, { projectId: input.project, environmentId: input.environment, displayName: 'restart', providerType: 'aws_secrets_manager', externalIdentifier: 'synthetic-reference', injectionKey: 'CONFIG' });
        await s.approvals.setPolicy(input.actor, input.org, { action: 'deployment.production', eligibleRoles: ['owner'], separationOfDuties: false });
        const { approval } = await s.approvals.request(input.actor, input.org, { action: 'deployment.production', resourceType: 'deployment' }, { value: 'restart' }, 'restart-approval');
        const exception = await new PostgresPolicyExceptionStore(s.repo).request(input.actor, input.org, { projectId: input.project, serviceId: input.service, targetId: target.id, environment: 'production', policyId: 'policy', justification: 'Restart fixture justification', compensatingControl: 'Manual review', policyVersion: 1, resourceVersion: 1, approvalId: approval.id, expiresAt: new Date(Date.now() + 3600000).toISOString() });
        result = { previewId: preview.preview.id, connectionId: connection.id, secretId: secret.id, approvalId: approval.id, exceptionId: exception.id };
      }
      if (input.action === 'worker') {
        process.env.WORKER_HEALTH_PORT = '0';
        const { startWorker } = require('../../src/worker/main');
        const worker = await startWorker({ env: { NODE_ENV: 'test', AUTH_MODE: 'test', CONTROL_PLANE_STORAGE: 'postgres', DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: 'redis://127.0.0.1:56379', DEPLOYMENT_QUEUE_NAME: input.queueName, AUDIT_INTEGRITY_KEY: input.key, CREDENTIAL_ENCRYPTION_KEY: input.key, REGISTRY_PROVIDER: 'test', DEPLOYMENT_TARGET: 'test', SUPPLY_CHAIN_MODE: 'test' }, gitProvider: {} });
        await worker.worker.waitUntilReady();
        let deploymentState;
        if (input.deploymentId) {
          const deadline = Date.now() + 10000;
          do {
            deploymentState = (await pool.query('SELECT current_state FROM deployments WHERE id=$1 AND organization_id=$2', [input.deploymentId, input.org])).rows[0]?.current_state;
            if (deploymentState === 'failed') break;
            await new Promise(resolve => setTimeout(resolve, 25));
          } while (Date.now() < deadline);
        }
        process.send({ workerReady: true, deploymentState });
        await new Promise(resolve => process.once('message', resolve));
        await worker.shutdown(); result = { stopped: true };
      }
      if (input.action === 'interrupt-byoc') {
        const store = new PostgresByocStore(s.repo, { encryptionKey: input.key, awsProvider: { validateIdentity: async () => { process.send({ validating: true }); await new Promise(() => {}); } } });
        await store.validateAws(input.actor, input.org, input.id, input.version);
      }
      if (input.action === 'recover-byoc') result = await new PostgresByocStore(s.repo, {}).recoverInterruptedValidations();
      process.send({ result });
    } catch (e) { process.send({ error: { code: e.code, message: e.message } }); }
    finally { await pool.end(); process.disconnect(); }
  });
}
module.exports = { services };
