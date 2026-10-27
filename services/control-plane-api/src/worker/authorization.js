const { PERMISSIONS } = require('../auth/rbac');
const { ControlPlaneError } = require('../errors');
const { snapshotDigest } = require('../approvals/canonical');

async function revalidateDeployment(repository, d) {
  const actor = d.rollbackActorId || d.triggeringUserId;
  await repository.requireAccess(actor, d.organizationId, d.triggerSource === 'rollback' ? PERMISSIONS.ROLLBACK : PERMISSIONS.DEPLOYMENT_CREATE);
  if (d.environment === 'production') await repository.requireAccess(actor, d.organizationId, PERMISSIONS.DEPLOYMENT_PRODUCTION);
  const service = await repository.getService(actor, d.organizationId, d.serviceId);
  const project = await repository.getProject(actor, d.organizationId, d.projectId);
  if (service.projectId !== d.projectId || service.repositoryId !== d.repositoryId || project.status !== 'active')
    throw new ControlPlaneError(403, 'DEPLOYMENT_RESOURCE_CHANGED', 'Deployment resource ownership or lifecycle changed');
  if (!repository.pool) return;
  const config = d.configurationSnapshot || {};
  if (config.deploymentTargetId) {
    const r = await repository.pool.query(`SELECT 1 FROM deployment_targets t LEFT JOIN provider_connections p ON p.id=t.provider_connection_id AND p.organization_id=t.organization_id
      WHERE t.id=$1 AND t.organization_id=$2 AND t.status='active' AND t.permission_validation='passed' AND t.allowed_environments ? $3 AND t.allowed_namespaces ? $4
      AND t.credential_version=$5 AND t.cluster_fingerprint IS NOT DISTINCT FROM $6 AND (t.provider_connection_id IS NULL OR p.status='active')`, [config.deploymentTargetId, d.organizationId, d.environment, config.targetNamespace, config.targetCredentialVersion, config.targetClusterFingerprint || null]);
    if (!r.rowCount) throw new ControlPlaneError(403, 'TARGET_NOT_USABLE', 'Deployment target is no longer usable');
  }
  for (const ref of config.secretReferences || []) {
    await repository.requireAccess(actor, d.organizationId, PERMISSIONS.SECRET_USE);
    const r = await repository.pool.query(`SELECT 1 FROM secret_references s JOIN service_secret_references a ON a.secret_reference_id=s.id AND a.organization_id=s.organization_id
      JOIN environment_references e ON e.id=s.environment_id AND e.organization_id=s.organization_id
      LEFT JOIN provider_connections p ON p.id=s.provider_connection_id AND p.organization_id=s.organization_id
      WHERE s.id=$1 AND s.organization_id=$2 AND s.status='active' AND s.reference_version=$3 AND s.project_id=$4 AND a.service_id=$5 AND (s.provider_connection_id IS NULL OR p.status='active')
      AND (e.type=$6 OR e.name=$6) AND (NOT $7 OR NOT s.protected)`, [ref.id, d.organizationId, ref.referenceVersion, d.projectId, d.serviceId, d.environment, d.environment === 'preview' || Boolean(config.preview?.untrusted)]);
    if (!r.rowCount) throw new ControlPlaneError(403, 'SECRET_REFERENCE_CHANGED', 'Secret reference is no longer usable');
  }
  const approvals = await repository.pool.query(`SELECT a.* FROM approval_requests a WHERE a.organization_id=$1 AND a.resource_id=$2`, [d.organizationId, d.id]);
  if (d.environment === 'production') {
    const policy = await repository.pool.query("SELECT 1 FROM approval_policies WHERE organization_id=$1 AND enabled AND action='deployment.production' AND (project_id IS NULL OR project_id=$2) AND (environment IS NULL OR environment=$3)", [d.organizationId, d.projectId, d.environment]);
    if (policy.rowCount && !approvals.rowCount) throw new ControlPlaneError(403, 'APPROVAL_REQUIRED', 'Current policy requires approval');
  }
  for (const a of approvals.rows) {
    if (a.override?.actorId) await repository.requireAccess(a.override.actorId, d.organizationId, PERMISSIONS.APPROVAL_OVERRIDE);
    if (a.state !== 'consumed') throw new ControlPlaneError(403, 'APPROVAL_NOT_EXECUTABLE', 'Deployment approval is not consumed');
    if (a.snapshot.sourceCommitSha !== d.commitSha || a.snapshot.configurationSnapshotHash !== snapshotDigest(config))
      throw new ControlPlaneError(403, 'APPROVAL_SNAPSHOT_CHANGED', 'Approved deployment changed');
    const policy = await repository.pool.query('SELECT 1 FROM approval_policies WHERE id=$1 AND organization_id=$2 AND version=$3 AND enabled', [a.policy_id, d.organizationId, a.policy_version]);
    const revoked = await repository.pool.query(`SELECT 1 FROM approval_decisions v LEFT JOIN organization_members m ON m.user_id=v.actor_user_id AND m.organization_id=$2
      WHERE v.approval_request_id=$1 AND v.decision='approved' AND (m.user_id IS NULL OR m.status<>'active' OR m.authorization_version<>v.authorization_version)`, [a.id, d.organizationId]);
    if (!policy.rowCount || revoked.rowCount) throw new ControlPlaneError(403, 'APPROVER_AUTHORIZATION_CHANGED', 'Approval authorization changed');
  }
}
module.exports = { revalidateDeployment };
