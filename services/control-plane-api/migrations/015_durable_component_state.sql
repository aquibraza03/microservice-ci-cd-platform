BEGIN;
-- Fields already used by the application but absent from the original tables.
ALTER TABLE preview_policies ADD COLUMN created_by UUID REFERENCES users(id),
  ADD COLUMN branch TEXT NOT NULL DEFAULT 'main',
  ADD COLUMN configuration_snapshot JSONB NOT NULL DEFAULT '{}';
ALTER TABLE preview_instances ADD COLUMN deployment_resource JSONB;
ALTER TABLE preview_revisions ADD COLUMN idempotency_key TEXT,
  ADD COLUMN secret_profile TEXT NOT NULL DEFAULT 'trusted-preview';
CREATE UNIQUE INDEX preview_revision_idempotency_idx ON preview_revisions(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE preview_cleanup_jobs ADD COLUMN reason TEXT NOT NULL DEFAULT 'expired';
-- Removed resources may be recreated. Live hostnames still have one owner.
ALTER TABLE preview_instances DROP CONSTRAINT preview_instances_organization_id_service_id_pull_request_n_key;
ALTER TABLE preview_instances DROP CONSTRAINT preview_instances_generated_hostname_key;
CREATE UNIQUE INDEX preview_live_pr_idx ON preview_instances(organization_id,service_id,pull_request_number) WHERE lifecycle_status <> 'removed';
CREATE UNIQUE INDEX preview_live_hostname_idx ON preview_instances(generated_hostname) WHERE lifecycle_status <> 'removed';
ALTER TABLE platform_routes DROP CONSTRAINT platform_routes_hostname_key;
CREATE UNIQUE INDEX routes_live_hostname_idx ON platform_routes(hostname) WHERE status <> 'removed';
ALTER TABLE custom_domains DROP CONSTRAINT custom_domains_hostname_ascii_key;
CREATE UNIQUE INDEX domains_live_hostname_idx ON custom_domains(hostname_ascii) WHERE status <> 'removed';
CREATE INDEX preview_instances_org_idx ON preview_instances(organization_id);
CREATE INDEX platform_routes_org_idx ON platform_routes(organization_id);
CREATE UNIQUE INDEX domain_challenge_domain_idx ON domain_verification_challenges(custom_domain_id);
ALTER TABLE provider_connections ADD COLUMN actual_account_id TEXT;
ALTER TABLE deployment_targets ADD COLUMN last_successful_validation_at TIMESTAMPTZ;
-- Nullable composite unique constraints do not enforce uniqueness for either owner.
CREATE UNIQUE INDEX credential_connection_version_idx ON credential_versions(provider_connection_id,version) WHERE provider_connection_id IS NOT NULL;
CREATE UNIQUE INDEX credential_target_version_idx ON credential_versions(deployment_target_id,version) WHERE deployment_target_id IS NOT NULL;
CREATE UNIQUE INDEX capability_connection_idx ON connection_capabilities(provider_connection_id,capability) WHERE provider_connection_id IS NOT NULL;
CREATE UNIQUE INDEX capability_target_idx ON connection_capabilities(deployment_target_id,capability) WHERE deployment_target_id IS NOT NULL;
-- The parent service retains the attachment version even when its set is empty.
ALTER TABLE services ADD COLUMN secret_attachment_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE secret_references ADD CONSTRAINT secret_environment_fk FOREIGN KEY(environment_id) REFERENCES environment_references(id);
ALTER TABLE service_secret_references ADD CONSTRAINT secret_service_fk FOREIGN KEY(service_id) REFERENCES services(id);
ALTER TABLE approval_requests ADD COLUMN eligible_roles JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN eligible_user_ids JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN rejection_reason TEXT, ADD COLUMN override JSONB;
UPDATE approval_requests r SET eligible_roles=p.eligible_roles,eligible_user_ids=p.eligible_user_ids
  FROM approval_policies p WHERE p.id=r.policy_id AND p.organization_id=r.organization_id;
COMMIT;
