const fs = require("fs");
const path = require("path");
const assert = require("assert");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "001_control_plane_foundation.sql"),
  "utf8",
);
const identityMigration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "migrations",
    "002_identity_organizations_rbac.sql",
  ),
  "utf8",
);
const gitMigration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "migrations",
    "003_github_repository_onboarding.sql",
  ),
  "utf8",
);
const deploymentMigration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "004_deployment_pipeline.sql"),
  "utf8",
);
const deliveryMigration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "005_registry_kubernetes.sql"),
  "utf8",
);
const previewMigration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "008_previews_domains_tls.sql"),
  "utf8",
);
const rollbackMigration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "009_safe_rollback.sql"),
  "utf8",
);
const byocMigration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "010_byoc_foundation.sql"),
  "utf8",
);
const rbacSecretsMigration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "migrations",
    "011_enterprise_rbac_managed_secrets.sql",
  ),
  "utf8",
);
const governanceMigration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "migrations",
    "012_approval_policy_kyverno_drift.sql",
  ),
  "utf8",
);
const auditMigration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "013_enterprise_audit.sql"),
  "utf8",
);
const billingMigration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "014_usage_billing_quotas.sql"),
  "utf8",
);
for (const table of [
  "organizations",
  "users",
  "organization_members",
  "teams",
  "team_members",
  "projects",
  "project_members",
  "repository_references",
  "environment_references",
  "audit_events",
]) {
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.match(migration, /BEGIN;/);
assert.match(migration, /COMMIT;/);
assert.match(identityMigration, /CREATE TABLE IF NOT EXISTS user_sessions/);
assert.match(identityMigration, /organization_members_role_check/);
assert.match(identityMigration, /version BIGINT NOT NULL DEFAULT 1/);
assert.doesNotMatch(identityMigration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
for (const table of [
  "git_provider_installations",
  "git_webhook_deliveries",
  "git_events",
])
  assert.match(gitMigration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.match(gitMigration, /UNIQUE\(provider, provider_installation_id\)/);
assert.match(gitMigration, /UNIQUE\(provider, delivery_id\)/);
assert.doesNotMatch(gitMigration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
for (const table of [
  "services",
  "deployments",
  "deployment_stages",
  "deployment_events",
  "deployment_job_attempts",
  "deployment_log_chunks",
  "deployment_artifacts",
  "deployment_images",
  "deployment_cancellation_requests",
])
  assert.match(
    deploymentMigration,
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
assert.match(
  deploymentMigration,
  /UNIQUE\(organization_id,idempotency_key_hash\)/,
);
assert.match(deploymentMigration, /UNIQUE\(deployment_id,sequence\)/);
assert.doesNotMatch(deploymentMigration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
for (const column of [
  "endpoint",
  "registry",
  "repository",
  "tags",
  "published",
  "scan_status",
  "sbom_reference",
  "provenance_reference",
  "signature_status",
  "verified_at",
])
  assert.match(
    deliveryMigration,
    new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`),
  );
assert.doesNotMatch(deliveryMigration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
for (const table of [
  "preview_policies",
  "preview_instances",
  "preview_revisions",
  "platform_routes",
  "custom_domains",
  "domain_verification_challenges",
  "preview_cleanup_jobs",
])
  assert.match(
    previewMigration,
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
assert.match(previewMigration, /hostname_ascii VARCHAR\(253\) NOT NULL UNIQUE/);
assert.doesNotMatch(previewMigration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
for (const table of [
  "rollback_policies",
  "rollback_approvals",
  "deployment_operation_locks",
  "rollback_audit_events",
])
  assert.match(
    rollbackMigration,
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
assert.match(rollbackMigration, /rollback_metadata JSONB/);
assert.doesNotMatch(rollbackMigration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
for (const table of [
  "provider_connections",
  "deployment_targets",
  "connection_capabilities",
  "connection_validation_attempts",
  "credential_versions",
])
  assert.match(
    byocMigration,
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
assert.match(byocMigration, /BEGIN;/);
assert.match(byocMigration, /COMMIT;/);
assert.doesNotMatch(byocMigration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
for (const table of [
  "role_assignments",
  "organization_invitations",
  "secret_references",
  "service_secret_references",
])
  assert.match(
    rbacSecretsMigration,
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
assert.match(rbacSecretsMigration, /BEGIN;/);
assert.match(rbacSecretsMigration, /COMMIT;/);
assert.doesNotMatch(rbacSecretsMigration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
assert.doesNotMatch(
  rbacSecretsMigration,
  /secret_plaintext|secret_value|plaintext_value/i,
);
for (const table of [
  "meter_definitions",
  "usage_events",
  "usage_period_aggregates",
  "usage_reconciliations",
  "plan_definitions",
  "organization_subscriptions",
  "entitlement_overrides",
  "quota_reservations",
]) assert.match(billingMigration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.match(billingMigration, /UNIQUE \(organization_id, meter_id, meter_version, idempotency_key\)/);
assert.match(billingMigration, /BEGIN;/);
assert.match(billingMigration, /COMMIT;/);
assert.doesNotMatch(billingMigration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
for (const table of [
  "approval_policies",
  "approval_requests",
  "approval_decisions",
  "protected_action_executions",
  "kubernetes_policy_assignments",
  "policy_exceptions",
  "deployment_drift_reports",
])
  assert.match(
    governanceMigration,
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
assert.match(governanceMigration, /BEGIN;/);
assert.match(governanceMigration, /COMMIT;/);
assert.match(governanceMigration, /snapshot_digest CHAR\(64\)/);
assert.match(governanceMigration, /UNIQUE\(approval_request_id\)/);
assert.doesNotMatch(
  governanceMigration,
  /secret_plaintext|secret_value|temporary_credentials/i,
);
for (const table of [
  "enterprise_audit_events",
  "audit_chain_heads",
  "audit_outbox",
  "audit_exports",
  "audit_retention_policies",
  "platform_operator_access_grants",
])
  assert.match(
    auditMigration,
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
assert.match(auditMigration, /FOR UPDATE|append-only/);
assert.match(auditMigration, /UNIQUE \(organization_id, idempotency_key\)/);
assert.match(auditMigration, /BEGIN;/);
assert.match(auditMigration, /COMMIT;/);
assert.doesNotMatch(
  auditMigration,
  /secret_plaintext|access_token|refresh_token|kubeconfig/i,
);
console.log("migration contract checks passed");
