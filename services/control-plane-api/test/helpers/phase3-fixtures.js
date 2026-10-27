const { randomUUID } = require('node:crypto');
const { bindTransactions } = require('../../src/database/transaction');
const { PostgresRepository } = require('../../src/domain/postgres-repository');
const { PostgresAuditService } = require('../../src/audit/postgres-service');
const { PostgresUsageLedger, PostgresQuotaManager, PostgresEntitlementService } = require('../../src/billing/postgres');
const { PostgresApprovalStore } = require('../../src/approvals/postgres-store');
const { PostgresPreviewStore } = require('../../src/previews/postgres-store');
const { PostgresByocStore } = require('../../src/byoc/postgres-store');
const { PostgresSecretReferenceStore } = require('../../src/secrets/postgres-store');
const { PostgresPolicyExceptionStore } = require('../../src/policy/postgres-exceptions');
const { AwsCloudAccountProvider } = require('../../src/byoc/aws-provider');
function graph(pool, key, encryptionKey = key) {
  bindTransactions(pool);
  const repo = new PostgresRepository(pool);
  const audit = new PostgresAuditService(repo, { integrityKeys: { 1: key } });
  repo.auditService = audit;
  const sink = event => audit.append({ ...event, actorId: event.actorUserId, result: 'success', sourceCategory: 'phase3' });
  const byoc = new PostgresByocStore(repo, { encryptionKey, awsProvider: new AwsCloudAccountProvider({ platformPrincipalArn: 'arn:aws:iam::999999999999:role/phase3-fixture' }) });
  return { repo, audit, byoc, approvals: new PostgresApprovalStore(repo, { eventSink: sink }), previews: new PostgresPreviewStore(repo), exceptions: new PostgresPolicyExceptionStore(repo, { eventSink: sink }), secrets: new PostgresSecretReferenceStore(repo, { providers: { aws_secrets_manager: {} }, byocStore: byoc }), quota: new PostgresQuotaManager(pool, { auditService: audit }), usage: new PostgresUsageLedger(pool, { auditService: audit }), plans: new PostgresEntitlementService(pool, { auditService: audit }) };
}
async function fixture(pool, s, actor) {
  actor ||= (await s.repo.upsertUser({ subject: randomUUID() })).id;
  const org = (await s.repo.createOrganization(actor, { name: 'Phase 3 tenant', slug: randomUUID() })).id;
  const approver = (await s.repo.upsertUser({ subject: randomUUID() })).id;
  await pool.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'approver')", [org, approver]);
  const project = (await s.repo.createProject(actor, org, { name: 'Phase 3 project', slug: randomUUID() })).id;
  const repositoryId = randomUUID(), service = randomUUID(), environment = randomUUID();
  await pool.query("INSERT INTO repository_references(id,organization_id,project_id,provider,external_id,name,default_branch,visibility) VALUES($1,$2,$3,'github',$4,'fixture','main','private')", [repositoryId, org, project, randomUUID()]);
  await pool.query("INSERT INTO services(id,organization_id,project_id,repository_id,name) VALUES($1,$2,$3,$4,'fixture')", [service, org, project, repositoryId]);
  await pool.query("INSERT INTO environment_references(id,organization_id,project_id,name,type) VALUES($1,$2,$3,'staging','staging')", [environment, org, project]);
  return { actor, org, approver, project, repositoryId, service, environment };
}
async function seed(pool, s, f) {
  const input = { projectId: f.project, serviceId: f.service, repositoryId: f.repositoryId, commitSha: 'a'.repeat(40), pullRequestNumber: 1 };
  await s.previews.policy(f.actor, f.org, input);
  const preview = await s.previews.create(f.actor, f.org, input, randomUUID());
  const connection = await s.byoc.createAws(f.actor, f.org, { displayName: 'fixture', roleArn: 'arn:aws:iam::123456789012:role/phase3-fixture', expectedAccountId: '123456789012', permittedRegions: ['us-east-1'] }, randomUUID());
  const target = await s.byoc.createKubernetesTarget(f.actor, f.org, { name: randomUUID(), apiServerOrigin: 'https://phase3.invalid', allowedNamespaces: ['fixture'], allowedEnvironments: ['staging'], authenticationMethod: 'oidc' }, randomUUID());
  const secret = await s.secrets.create(f.actor, f.org, { projectId: f.project, environmentId: f.environment, displayName: 'reference', providerType: 'aws_secrets_manager', externalIdentifier: 'phase3-reference-metadata', injectionKey: 'CONFIG' });
  await s.approvals.setPolicy(f.actor, f.org, { action: 'deployment.production', eligibleRoles: ['approver'] });
  const { approval } = await s.approvals.request(f.actor, f.org, { action: 'deployment.production', resourceType: 'deployment' }, { fixture: true }, randomUUID());
  const exception = await s.exceptions.request(f.actor, f.org, { projectId: f.project, serviceId: f.service, targetId: target.target.id, environment: 'staging', policyId: 'fixture-policy', justification: 'Local database fixture', compensatingControl: 'No external operation', policyVersion: 1, resourceVersion: 1, approvalId: approval.id, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  await s.plans.assign(f.org, 'team');
  await s.quota.setLimit(f.org, 'builds', 1);
  const reservation = await s.quota.reserve({ organizationId: f.org, resourceType: 'builds', quantity: 1, ownerOperation: 'fixture', idempotencyKey: 'fixture' });
  await s.usage.append({ organizationId: f.org, meterId: 'deployment_count', quantity: 1, sourceResourceId: 'fixture', idempotencyKey: 'fixture' });
  return { ...f, preview: preview.preview.id, connection: connection.connection.id, target: target.target.id, secret: secret.id, approval: approval.id, exception: exception.id, reservation: reservation.reservationId };
}
module.exports = { graph, fixture, seed };
