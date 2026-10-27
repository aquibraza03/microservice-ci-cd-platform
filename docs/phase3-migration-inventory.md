# Phase 3 migration inventory

The repository contains 17 ordered migrations. 015 adds Phase 1 durable component state; 016 and 017 are existing Phase 1 hardening migrations. None is relabeled as a new Phase 3 migration. No existing SQL file was modified.

Runner: services/control-plane-api/src/database/migrate.js. Tracking: schema_migrations(name primary key, checksum SHA-256, applied_at). Lexicographic filename order is the supported order; applied checksums must match and applied files are skipped. Explicit transaction wrappers exist except in 006 and 007. The Phase 3 runner serializes the entire chain with one session advisory lock and commits each migration together with its tracking row on one connection. Database default isolation is measured in the acceptance evidence. There is no down-migration, out-of-order, or automatic retry contract.

DDL takes relation locks, including ACCESS EXCLUSIVE for ALTER TABLE, held until each migration transaction commits. Index builds are ordinary, not concurrent. Existing-row constraint checks, index creation and the 015 backfill require rollout planning on large datasets; local timings do not certify zero downtime. No CREATE EXTENSION exists in this chain; gen_random_uuid is supplied by the tested PostgreSQL server.

## 001_control_plane_foundation.sql

Purpose: control plane foundation. Existing schema history; not a new Phase 3 migration.

- Creates tables: organizations, users, organization_members, teams, team_members, projects, project_members, repository_references, environment_references, audit_events.
- Alters tables: none.
- Explicit prior-table dependencies: none; foundational schema.
- Indexes: projects_organization_id_idx, audit_events_organization_id_created_at_idx.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: a14b3a0286bb836d0fd5433202145c429be2a5646f007c9c290e57a848551b94.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
  id UUID PRIMARY KEY,
  slug VARCHAR(64) NOT NULL UNIQUE,
  external_subject VARCHAR(255) NOT NULL UNIQUE,
  PRIMARY KEY (organization_id, user_id)
  UNIQUE (organization_id, slug)
  PRIMARY KEY (team_id, user_id)
  PRIMARY KEY (project_id, user_id)
  UNIQUE (provider, external_id)
  UNIQUE (project_id, name)
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
CREATE TABLE IF NOT EXISTS repository_references (
CREATE TABLE IF NOT EXISTS environment_references (
  actor_user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id),
```

Lock-sensitive operations:

```sql
CREATE INDEX IF NOT EXISTS projects_organization_id_idx ON projects(organization_id);
CREATE INDEX IF NOT EXISTS audit_events_organization_id_created_at_idx ON audit_events(organization_id, created_at DESC);
```

## 002_identity_organizations_rbac.sql

Purpose: identity organizations rbac. Existing schema history; not a new Phase 3 migration.

- Creates tables: user_sessions.
- Alters tables: users, organizations, organization_members, projects, repository_references, environment_references.
- Explicit prior-table dependencies: 001_control_plane_foundation.sql.
- Indexes: organization_members_user_status_idx, organization_members_org_role_idx, repository_references_org_project_idx, environment_references_org_project_idx, user_sessions_user_active_idx, audit_events_actor_created_idx.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: 46017034b14cbc47a60f7f0e896c4fe47f5366d3a73749fe007667c9d57dfaf3.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
  ALTER TABLE users ADD CONSTRAINT users_current_organization_fk FOREIGN KEY (current_organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
  ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check CHECK (role IN ('owner','admin','developer','operator','viewer'));
  id UUID PRIMARY KEY,
  token_jti_hash CHAR(64) NOT NULL UNIQUE,
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE environment_references ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
CREATE INDEX IF NOT EXISTS repository_references_org_project_idx ON repository_references(organization_id, project_id);
CREATE INDEX IF NOT EXISTS environment_references_org_project_idx ON environment_references(organization_id, project_id);
```

Lock-sensitive operations:

```sql
UPDATE organization_members SET role = 'viewer' WHERE role = 'member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_organization_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE environment_references ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
  ALTER TABLE users ADD CONSTRAINT users_current_organization_fk FOREIGN KEY (current_organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
  ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check CHECK (role IN ('owner','admin','developer','operator','viewer'));
CREATE INDEX IF NOT EXISTS organization_members_user_status_idx ON organization_members(user_id, status, organization_id);
CREATE INDEX IF NOT EXISTS organization_members_org_role_idx ON organization_members(organization_id, role, user_id);
CREATE INDEX IF NOT EXISTS repository_references_org_project_idx ON repository_references(organization_id, project_id);
CREATE INDEX IF NOT EXISTS environment_references_org_project_idx ON environment_references(organization_id, project_id);
CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx ON user_sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx ON audit_events(actor_user_id, created_at DESC);
```

## 003_github_repository_onboarding.sql

Purpose: github repository onboarding. Existing schema history; not a new Phase 3 migration.

- Creates tables: git_provider_installations, git_webhook_deliveries, git_events.
- Alters tables: repository_references.
- Explicit prior-table dependencies: 001_control_plane_foundation.sql.
- Indexes: idx_git_installations_org_state, idx_repository_references_installation, idx_git_deliveries_org_received, idx_git_events_org_repo_created.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: d50b4e0d7f7136790d7092252bdd0b09d2b03826d9d693ecd2681e7a610895c8.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), provider VARCHAR(32) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_installation_id), CHECK(connection_state IN ('active','suspended','revoked','disconnected'))
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider VARCHAR(32) NOT NULL, delivery_id VARCHAR(128) NOT NULL, event_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ, UNIQUE(provider, delivery_id)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
  delivery_id UUID NOT NULL UNIQUE REFERENCES git_webhook_deliveries(id), event_type VARCHAR(64) NOT NULL, branch VARCHAR(255), commit_sha VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(octet_length(metadata::text) <= 65536)
  repository_selection VARCHAR(32) NOT NULL, connection_state VARCHAR(32) NOT NULL DEFAULT 'active', created_by UUID NOT NULL REFERENCES users(id),
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS installation_id UUID REFERENCES git_provider_installations(id);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS repository_owner VARCHAR(255);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS repository_name VARCHAR(255);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS selected_branch VARCHAR(255);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS connected_by UUID REFERENCES users(id);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_repository_references_installation ON repository_references(installation_id);
  installation_id UUID REFERENCES git_provider_installations(id), repository_id UUID REFERENCES repository_references(id), organization_id UUID REFERENCES organizations(id),
```

Lock-sensitive operations:

```sql
CREATE INDEX IF NOT EXISTS idx_git_installations_org_state ON git_provider_installations(organization_id, connection_state);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS installation_id UUID REFERENCES git_provider_installations(id);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS repository_owner VARCHAR(255);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS repository_name VARCHAR(255);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS selected_branch VARCHAR(255);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS connected_by UUID REFERENCES users(id);
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_repository_references_installation ON repository_references(installation_id);
CREATE INDEX IF NOT EXISTS idx_git_deliveries_org_received ON git_webhook_deliveries(organization_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_git_events_org_repo_created ON git_events(organization_id, repository_id, created_at DESC);
```

## 004_deployment_pipeline.sql

Purpose: deployment pipeline. Existing schema history; not a new Phase 3 migration.

- Creates tables: services, deployments, deployment_stages, deployment_events, deployment_job_attempts, deployment_log_chunks, deployment_artifacts, deployment_images, deployment_cancellation_requests.
- Alters tables: none.
- Explicit prior-table dependencies: 001_control_plane_foundation.sql.
- Indexes: idx_deployments_org_created, idx_deployments_state_created, idx_deployment_events_replay.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: 76f24a750de11706d666753a5b605612fb3e5358226e0b833dcca9678dacc73b.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
 name VARCHAR(120) NOT NULL, service_path VARCHAR(512) NOT NULL DEFAULT '.', version BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(project_id,name)
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), service_id UUID NOT NULL REFERENCES services(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
 UNIQUE(organization_id,idempotency_key_hash), CHECK(octet_length(configuration_snapshot::text)<=65536),
 CHECK(current_state IN ('queued','validating','testing','scanning','building','build_complete','pushing','deploying','verifying','ready','failed','cancel_requested','cancelled','rollback_queued','rolling_back','rolled_back'))
CREATE TABLE IF NOT EXISTS deployment_stages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), name VARCHAR(64) NOT NULL, state VARCHAR(32) NOT NULL, attempt INTEGER NOT NULL, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, duration_ms BIGINT, safe_message VARCHAR(500), UNIQUE(deployment_id,name,attempt));
CREATE TABLE IF NOT EXISTS deployment_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), organization_id UUID NOT NULL REFERENCES organizations(id), sequence BIGINT NOT NULL, event_type VARCHAR(64) NOT NULL, state VARCHAR(32), safe_message VARCHAR(2000), metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(deployment_id,sequence), CHECK(octet_length(metadata::text)<=65536));
CREATE TABLE IF NOT EXISTS deployment_job_attempts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), attempt INTEGER NOT NULL, worker_id VARCHAR(255), status VARCHAR(32) NOT NULL, heartbeat_at TIMESTAMPTZ, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ, failure_code VARCHAR(64), UNIQUE(deployment_id,attempt));
CREATE TABLE IF NOT EXISTS deployment_log_chunks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), organization_id UUID NOT NULL REFERENCES organizations(id), sequence BIGINT NOT NULL, stage VARCHAR(64), content TEXT NOT NULL, byte_size INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, UNIQUE(deployment_id,sequence), CHECK(byte_size<=65536));
CREATE TABLE IF NOT EXISTS deployment_artifacts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), kind VARCHAR(64) NOT NULL, uri TEXT, byte_size BIGINT NOT NULL, sha256 VARCHAR(64), metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS deployment_images (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL UNIQUE REFERENCES deployments(id), local_reference VARCHAR(255) NOT NULL, image_tag VARCHAR(255) NOT NULL, digest VARCHAR(255), platform VARCHAR(64), byte_size BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS deployment_cancellation_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), requested_by UUID NOT NULL REFERENCES users(id), reason VARCHAR(500), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), acknowledged_at TIMESTAMPTZ);
 branch VARCHAR(255) NOT NULL, commit_sha VARCHAR(64) NOT NULL, trigger_source VARCHAR(32) NOT NULL, triggering_user_id UUID REFERENCES users(id), environment VARCHAR(64) NOT NULL, provider VARCHAR(32) NOT NULL,
 failure_code VARCHAR(64), failure_message VARCHAR(500), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, previous_successful_deployment_id UUID REFERENCES deployments(id), rollback_target_id UUID REFERENCES deployments(id),
```

Lock-sensitive operations:

```sql
CREATE INDEX IF NOT EXISTS idx_deployments_org_created ON deployments(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_state_created ON deployments(current_state,created_at);
CREATE INDEX IF NOT EXISTS idx_deployment_events_replay ON deployment_events(deployment_id,sequence);
```

## 005_registry_kubernetes.sql

Purpose: registry kubernetes. Existing schema history; not a new Phase 3 migration.

- Creates tables: none.
- Alters tables: deployments, deployment_images.
- Explicit prior-table dependencies: 004_deployment_pipeline.sql.
- Indexes: idx_deployment_images_digest, idx_deployments_rollback_target.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: ebdc3fac18667774ebc43e784d8cfb5f0254e92b33486cf76c544d9ae5cedf93.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
-- none
```

Lock-sensitive operations:

```sql
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS endpoint VARCHAR(2048);
ALTER TABLE deployment_images ADD COLUMN IF NOT EXISTS registry VARCHAR(255);
ALTER TABLE deployment_images ADD COLUMN IF NOT EXISTS repository VARCHAR(512);
ALTER TABLE deployment_images ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE deployment_images ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE deployment_images ADD COLUMN IF NOT EXISTS scan_status VARCHAR(32);
ALTER TABLE deployment_images ADD COLUMN IF NOT EXISTS scan_summary JSONB;
ALTER TABLE deployment_images ADD COLUMN IF NOT EXISTS sbom_reference VARCHAR(2048);
ALTER TABLE deployment_images ADD COLUMN IF NOT EXISTS provenance_reference VARCHAR(2048);
ALTER TABLE deployment_images ADD COLUMN IF NOT EXISTS signature_status VARCHAR(32);
ALTER TABLE deployment_images ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_deployment_images_digest ON deployment_images(digest) WHERE digest IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deployments_rollback_target ON deployments(rollback_target_id) WHERE rollback_target_id IS NOT NULL;
```

## 006_service_detection_configuration.sql

Purpose: service detection configuration. Existing schema history; not a new Phase 3 migration.

- Creates tables: repository_detection_runs, service_configuration_drafts, service_configurations.
- Alters tables: none.
- Explicit prior-table dependencies: 001_control_plane_foundation.sql.
- Indexes: idx_detection_tenant_project, idx_config_drafts_tenant, idx_service_configs_tenant.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: none; runner supplies transaction.
- SHA-256: 8eb6516da9bdc337b5023ad486ab50707c3e13e57d89fae0686b687c70855a7d.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
  commit_sha VARCHAR(64) NOT NULL CHECK (commit_sha ~ '^[a-f0-9]{40,64}$'), engine_version VARCHAR(32) NOT NULL, status VARCHAR(24) NOT NULL CHECK(status IN ('completed','failed')),
  UNIQUE(organization_id,repository_id,commit_sha,idempotency_key)
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), user_id UUID NOT NULL REFERENCES users(id),
  repository_id UUID NOT NULL REFERENCES repository_references(id), commit_sha VARCHAR(64) NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40,64}$'), candidate_id VARCHAR(80) NOT NULL,
  configuration JSONB NOT NULL, validation JSONB, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,project_id,user_id)
  commit_sha VARCHAR(64) NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40,64}$'), candidate_id VARCHAR(80) NOT NULL, configuration JSONB NOT NULL,
  generated_service_yaml TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  result JSONB NOT NULL, created_by UUID NOT NULL REFERENCES users(id), idempotency_key VARCHAR(128) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
```

Lock-sensitive operations:

```sql
CREATE INDEX IF NOT EXISTS idx_detection_tenant_project ON repository_detection_runs(organization_id,project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_drafts_tenant ON service_configuration_drafts(organization_id,project_id,user_id);
CREATE INDEX IF NOT EXISTS idx_service_configs_tenant ON service_configurations(organization_id,project_id,created_at DESC);
```

## 007_deployment_observability.sql

Purpose: deployment observability. Existing schema history; not a new Phase 3 migration.

- Creates tables: none.
- Alters tables: deployment_events.
- Explicit prior-table dependencies: 004_deployment_pipeline.sql.
- Indexes: idx_deployment_events_filters, idx_deployment_events_retention.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: none; runner supplies transaction.
- SHA-256: cd569623a2ca42d5a0e4ce61044845eabfc5c64a320dfa628fc314401152a1f1.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
DO $$ BEGIN ALTER TABLE deployment_events ADD CONSTRAINT deployment_events_level_check CHECK(level IN ('debug','info','warn','error')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

Lock-sensitive operations:

```sql
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS schema_version VARCHAR(32) NOT NULL DEFAULT 'deployment-event.v1';
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS stage VARCHAR(64);
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS state_version BIGINT;
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS level VARCHAR(16) NOT NULL DEFAULT 'info';
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS source VARCHAR(64) NOT NULL DEFAULT 'control-plane';
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 0;
DO $$ BEGIN ALTER TABLE deployment_events ADD CONSTRAINT deployment_events_level_check CHECK(level IN ('debug','info','warn','error')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_deployment_events_filters ON deployment_events(deployment_id,stage,level,created_at,sequence);
CREATE INDEX IF NOT EXISTS idx_deployment_events_retention ON deployment_events(created_at);
```

## 008_previews_domains_tls.sql

Purpose: previews domains tls. Existing schema history; not a new Phase 3 migration.

- Creates tables: preview_policies, preview_instances, preview_revisions, platform_routes, custom_domains, domain_verification_challenges, preview_cleanup_jobs.
- Alters tables: preview_instances.
- Explicit prior-table dependencies: 001_control_plane_foundation.sql, 004_deployment_pipeline.sql.
- Indexes: idx_preview_expiration, idx_cleanup_due, idx_certificate_expiry.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: a64290f54a2fe99e0e5b548c412292da4f9b7d06b872657ed30848eb06d90059.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), service_id UUID NOT NULL REFERENCES services(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
 enabled BOOLEAN NOT NULL DEFAULT TRUE, ttl_seconds INTEGER NOT NULL DEFAULT 86400 CHECK(ttl_seconds BETWEEN 300 AND 604800), max_cpu_millicores INTEGER NOT NULL DEFAULT 500, max_memory_mebibytes INTEGER NOT NULL DEFAULT 512, max_storage_mebibytes INTEGER NOT NULL DEFAULT 1024,
 allow_fork_previews BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(organization_id,project_id,service_id)
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), service_id UUID NOT NULL REFERENCES services(id), repository_id UUID NOT NULL REFERENCES repository_references(id), pull_request_number INTEGER, isolation_key VARCHAR(63) NOT NULL, generated_hostname VARCHAR(253) NOT NULL,
 lifecycle_status VARCHAR(24) NOT NULL, cleanup_status VARCHAR(24) NOT NULL DEFAULT 'not_requested', active_revision_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(organization_id,service_id,pull_request_number), UNIQUE(generated_hostname)
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), preview_id UUID NOT NULL REFERENCES preview_instances(id) ON DELETE CASCADE, organization_id UUID NOT NULL REFERENCES organizations(id), deployment_id UUID REFERENCES deployments(id), commit_sha VARCHAR(64) NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40,64}$'), provider_delivery_id VARCHAR(128), trust_level VARCHAR(24) NOT NULL, protected_secrets_allowed BOOLEAN NOT NULL DEFAULT FALSE,
 status VARCHAR(24) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(preview_id,commit_sha), UNIQUE(provider_delivery_id)
DO $$ BEGIN ALTER TABLE preview_instances ADD CONSTRAINT preview_instances_active_revision_id_fkey FOREIGN KEY(active_revision_id) REFERENCES preview_revisions(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), service_id UUID NOT NULL REFERENCES services(id), preview_id UUID REFERENCES preview_instances(id) ON DELETE CASCADE, hostname VARCHAR(253) NOT NULL UNIQUE, route_kind VARCHAR(24) NOT NULL DEFAULT 'ingress', namespace VARCHAR(63) NOT NULL, resource_name VARCHAR(63) NOT NULL, backend_service VARCHAR(63) NOT NULL, backend_port INTEGER NOT NULL,
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), service_id UUID NOT NULL REFERENCES services(id), hostname_ascii VARCHAR(253) NOT NULL UNIQUE, hostname_display VARCHAR(253) NOT NULL,
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), custom_domain_id UUID NOT NULL REFERENCES custom_domains(id) ON DELETE CASCADE, token_hash VARCHAR(64) NOT NULL, dns_record_name VARCHAR(253) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, verified_at TIMESTAMPTZ, attempts INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), preview_id UUID NOT NULL REFERENCES preview_instances(id) ON DELETE CASCADE, organization_id UUID NOT NULL REFERENCES organizations(id), status VARCHAR(24) NOT NULL DEFAULT 'pending', attempt INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finalizer_deadline TIMESTAMPTZ NOT NULL, owned_resource_ids JSONB NOT NULL, last_error VARCHAR(500), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(preview_id)
 status VARCHAR(24) NOT NULL DEFAULT 'pending_verification', route_id UUID REFERENCES platform_routes(id), created_by UUID NOT NULL REFERENCES users(id), removed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Lock-sensitive operations:

```sql
DO $$ BEGIN ALTER TABLE preview_instances ADD CONSTRAINT preview_instances_active_revision_id_fkey FOREIGN KEY(active_revision_id) REFERENCES preview_revisions(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_preview_expiration ON preview_instances(lifecycle_status,expires_at);
CREATE INDEX IF NOT EXISTS idx_cleanup_due ON preview_cleanup_jobs(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_certificate_expiry ON platform_routes(certificate_status,certificate_expires_at);
```

## 009_safe_rollback.sql

Purpose: safe rollback. Existing schema history; not a new Phase 3 migration.

- Creates tables: rollback_policies, rollback_approvals, deployment_operation_locks, rollback_audit_events.
- Alters tables: deployments.
- Explicit prior-table dependencies: 004_deployment_pipeline.sql, 001_control_plane_foundation.sql.
- Indexes: idx_rollback_audit_org_created, idx_rollback_audit_deployment.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: 3957623355b87e5fead8061e00613bf8f0925a3b24cb6a14f5e18ce55db51247.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
    CHECK (database_compatibility_mode IN ('warn','block')),
  lock_timeout_seconds INTEGER NOT NULL DEFAULT 900 CHECK (lock_timeout_seconds BETWEEN 30 AND 3600),
  PRIMARY KEY (organization_id, environment)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(16) NOT NULL CHECK (status IN ('approved','revoked','used')),
  UNIQUE (organization_id, source_deployment_id, target_deployment_id, id)
    ADD CONSTRAINT deployments_rollback_approval_fk
  operation VARCHAR(32) NOT NULL CHECK (operation IN ('deployment','rollback')),
  PRIMARY KEY (organization_id, service_id, environment)
  CHECK (octet_length(metadata::text) <= 65536)
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_actor_id UUID REFERENCES users(id);
  organization_id UUID NOT NULL REFERENCES organizations(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  source_deployment_id UUID NOT NULL REFERENCES deployments(id),
  target_deployment_id UUID NOT NULL REFERENCES deployments(id),
  approved_by UUID NOT NULL REFERENCES users(id),
    FOREIGN KEY (rollback_approval_id) REFERENCES rollback_approvals(id);
  service_id UUID NOT NULL REFERENCES services(id),
  deployment_id UUID NOT NULL REFERENCES deployments(id),
  rollback_deployment_id UUID REFERENCES deployments(id),
  actor_user_id UUID NOT NULL REFERENCES users(id),
  approval_id UUID REFERENCES rollback_approvals(id),
```

Lock-sensitive operations:

```sql
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_reason VARCHAR(1000);
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_approval_id UUID;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_actor_id UUID REFERENCES users(id);
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_requested_at TIMESTAMPTZ;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE deployments
CREATE INDEX IF NOT EXISTS idx_rollback_audit_org_created
CREATE INDEX IF NOT EXISTS idx_rollback_audit_deployment
```

## 010_byoc_foundation.sql

Purpose: byoc foundation. Existing schema history; not a new Phase 3 migration.

- Creates tables: provider_connections, deployment_targets, connection_capabilities, connection_validation_attempts, credential_versions.
- Alters tables: none.
- Explicit prior-table dependencies: 001_control_plane_foundation.sql.
- Indexes: idx_provider_connections_org_status, idx_deployment_targets_org_status, idx_connection_validation_running.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: b9b1ecf109920b5faa9116d112b2eef6448e0bf033e455010b5b6a3f55599b09.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), display_name VARCHAR(160) NOT NULL,
 UNIQUE(organization_id,idempotency_key_hash), UNIQUE(external_id_hash),
 CHECK(provider_type IN ('aws')), CHECK(status IN ('draft','validating','active','degraded','invalid','disabled','revoked')),
 CHECK(jsonb_typeof(permitted_regions)='array'), CHECK(jsonb_typeof(enabled_capabilities)='array')
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), provider_connection_id UUID REFERENCES provider_connections(id),
 UNIQUE(organization_id,name), UNIQUE(organization_id,idempotency_key_hash), UNIQUE(organization_id,cluster_fingerprint),
 CHECK(target_type='kubernetes'), CHECK(status IN ('draft','validating','active','degraded','invalid','disabled','revoked')),
 CHECK(authentication_method IN ('oidc','workload_identity','service_account_token')),
 CHECK(jsonb_typeof(allowed_namespaces)='array'), CHECK(jsonb_array_length(allowed_namespaces)>0), CHECK(jsonb_typeof(allowed_environments)='array')
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), provider_connection_id UUID REFERENCES provider_connections(id), deployment_target_id UUID REFERENCES deployment_targets(id),
 CHECK((provider_connection_id IS NOT NULL) <> (deployment_target_id IS NOT NULL)), CHECK(support_level IN ('production','beta','experimental','planned','unsupported')),
 UNIQUE(provider_connection_id,deployment_target_id,capability)
 CHECK((provider_connection_id IS NOT NULL) <> (deployment_target_id IS NOT NULL)), CHECK(status IN ('running','passed','failed','cancelled','timed_out'))
 CHECK((provider_connection_id IS NOT NULL) <> (deployment_target_id IS NOT NULL)), UNIQUE(provider_connection_id,deployment_target_id,version)
```

Lock-sensitive operations:

```sql
CREATE INDEX IF NOT EXISTS idx_provider_connections_org_status ON provider_connections(organization_id,status);
CREATE INDEX IF NOT EXISTS idx_deployment_targets_org_status ON deployment_targets(organization_id,status);
CREATE INDEX IF NOT EXISTS idx_connection_validation_running ON connection_validation_attempts(organization_id,status,started_at) WHERE status='running';
```

## 011_enterprise_rbac_managed_secrets.sql

Purpose: enterprise rbac managed secrets. Existing schema history; not a new Phase 3 migration.

- Creates tables: role_assignments, organization_invitations, secret_references, service_secret_references.
- Alters tables: organization_members.
- Explicit prior-table dependencies: 001_control_plane_foundation.sql, 010_byoc_foundation.sql.
- Indexes: idx_role_assignments_actor, idx_invitations_org_status, idx_secret_references_scope.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: c649ee398e970554ff361d1183e3df724246fcfd8ba8c77e8058a3b9d4f4fd4c.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check
  CHECK(role IN ('owner','admin','security_admin','platform_engineer','developer','operator','approver','auditor','viewer'));
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  UNIQUE(organization_id,user_id,role,scope_type,scope_id),
  CHECK(role IN ('owner','admin','security_admin','platform_engineer','developer','operator','approver','auditor','viewer')),
  CHECK(scope_type IN ('organization','project','environment','cloud_connection','deployment_target','deployment','secret_reference','domain','policy'))
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  CHECK(status IN ('pending','accepted','revoked','expired'))
  CHECK(provider_type IN ('aws_secrets_manager','kubernetes_external_secret')),
  CHECK(destination IN ('environment','file')),
  CHECK(status IN ('draft','active','invalid','disabled','revoked')),
  UNIQUE(organization_id,project_id,environment_id,display_name)
  PRIMARY KEY(service_id,secret_reference_id)
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
CREATE TABLE IF NOT EXISTS secret_references (
  project_id UUID NOT NULL REFERENCES projects(id),
  provider_connection_id UUID REFERENCES provider_connections(id),
  deployment_target_id UUID REFERENCES deployment_targets(id),
CREATE INDEX IF NOT EXISTS idx_secret_references_scope ON secret_references(organization_id,project_id,environment_id,status);
CREATE TABLE IF NOT EXISTS service_secret_references (
  secret_reference_id UUID NOT NULL REFERENCES secret_references(id),
-- Forward recovery: disable or revoke affected references/assignments and
```

Lock-sensitive operations:

```sql
ALTER TABLE organization_members
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check
CREATE INDEX IF NOT EXISTS idx_role_assignments_actor ON role_assignments(organization_id,user_id,scope_type,scope_id);
CREATE INDEX IF NOT EXISTS idx_invitations_org_status ON organization_invitations(organization_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_secret_references_scope ON secret_references(organization_id,project_id,environment_id,status);
```

## 012_approval_policy_kyverno_drift.sql

Purpose: approval policy kyverno drift. Existing schema history; not a new Phase 3 migration.

- Creates tables: approval_policies, approval_requests, approval_decisions, protected_action_executions, kubernetes_policy_assignments, policy_exceptions, deployment_drift_reports.
- Alters tables: deployments.
- Explicit prior-table dependencies: 004_deployment_pipeline.sql, 001_control_plane_foundation.sql, 010_byoc_foundation.sql.
- Indexes: approval_policies_lookup_idx, approval_requests_inbox_idx, policy_exceptions_active_idx, deployment_drift_reports_lookup_idx.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: ac6ddc2ef22fa68a87b2a7f9376b40afa3df90d07c313a1151b76872e698d0dd.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_current_state_check;
ALTER TABLE deployments ADD CONSTRAINT deployments_current_state_check CHECK(current_state IN ('waiting_for_approval','queued','validating','testing','scanning','building','build_complete','pushing','deploying','verifying','ready','failed','cancel_requested','cancelled','rollback_queued','rolling_back','rolled_back'));
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id),
  required_count INTEGER NOT NULL CHECK(required_count BETWEEN 1 AND 10), eligible_roles JSONB NOT NULL,
  expires_in_seconds INTEGER NOT NULL CHECK(expires_in_seconds BETWEEN 60 AND 86400), enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(organization_id,scope_type,scope_id,action)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), policy_id UUID NOT NULL REFERENCES approval_policies(id),
  state TEXT NOT NULL CHECK(state IN('pending','approved','rejected','expired','cancelled','invalidated','overridden','executing','consumed','failed')),
  UNIQUE(organization_id,idempotency_key_hash)
  decision TEXT NOT NULL CHECK(decision IN('approved','rejected')), role TEXT NOT NULL, authorization_version INTEGER NOT NULL,
  reason TEXT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(approval_request_id,actor_user_id)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), approval_request_id UUID NOT NULL REFERENCES approval_requests(id),
  execution_key_hash CHAR(64) NOT NULL, state TEXT NOT NULL CHECK(state IN('executing','consumed','failed')),
  UNIQUE(organization_id,execution_key_hash), UNIQUE(approval_request_id)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), deployment_target_id UUID NOT NULL REFERENCES deployment_targets(id),
  policy_id TEXT NOT NULL, policy_version INTEGER NOT NULL, desired_mode TEXT NOT NULL CHECK(desired_mode IN('enforce','audit','disabled')),
  observed_state TEXT NOT NULL CHECK(observed_state IN('enforce','audit','disabled','unsupported','unknown','error')),
  UNIQUE(organization_id,deployment_target_id,policy_id)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id),
  starts_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL CHECK(status IN('pending','approved','active','expired','revoked','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(expires_at > starts_at)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), deployment_id UUID NOT NULL REFERENCES deployments(id),
  project_id UUID NULL REFERENCES projects(id), environment TEXT NULL, scope_type TEXT NOT NULL,
  project_id UUID NULL REFERENCES projects(id), environment TEXT NULL, resource_type TEXT NOT NULL, resource_id TEXT NULL,
  action TEXT NOT NULL, risk_level TEXT NOT NULL, requester_id UUID NOT NULL REFERENCES users(id), policy_version INTEGER NOT NULL,
  approval_request_id UUID NOT NULL REFERENCES approval_requests(id), actor_user_id UUID NOT NULL REFERENCES users(id),
  environment TEXT NOT NULL, deployment_target_id UUID NOT NULL REFERENCES deployment_targets(id), policy_id TEXT NOT NULL,
  service_id UUID NOT NULL REFERENCES services(id), workload_id TEXT NULL, justification TEXT NOT NULL, compensating_control TEXT NOT NULL,
  requester_id UUID NOT NULL REFERENCES users(id), approver_id UUID NULL REFERENCES users(id), approval_request_id UUID NULL REFERENCES approval_requests(id),
  target_id UUID NULL REFERENCES deployment_targets(id), status TEXT NOT NULL, findings JSONB NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), requested_by UUID NOT NULL REFERENCES users(id)
```

Lock-sensitive operations:

```sql
ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_current_state_check;
ALTER TABLE deployments ADD CONSTRAINT deployments_current_state_check CHECK(current_state IN ('waiting_for_approval','queued','validating','testing','scanning','building','build_complete','pushing','deploying','verifying','ready','failed','cancel_requested','cancelled','rollback_queued','rolling_back','rolled_back'));
CREATE INDEX approval_policies_lookup_idx ON approval_policies(organization_id,action,project_id,environment) WHERE enabled;
CREATE INDEX approval_requests_inbox_idx ON approval_requests(organization_id,state,expires_at);
CREATE INDEX policy_exceptions_active_idx ON policy_exceptions(organization_id,deployment_target_id,policy_id,expires_at) WHERE status IN('approved','active');
CREATE INDEX deployment_drift_reports_lookup_idx ON deployment_drift_reports(organization_id,deployment_id,evaluated_at DESC);
```

## 013_enterprise_audit.sql

Purpose: enterprise audit. Existing schema history; not a new Phase 3 migration.

- Creates tables: audit_chain_heads, enterprise_audit_events, audit_outbox, audit_exports, audit_retention_policies, platform_operator_access_grants.
- Alters tables: none.
- Explicit prior-table dependencies: 001_control_plane_foundation.sql.
- Indexes: enterprise_audit_events_org_time_idx, enterprise_audit_events_org_action_idx, enterprise_audit_events_org_correlation_idx, audit_outbox_pending_idx, audit_exports_org_created_idx, platform_operator_grants_org_expiry_idx.
- Functions: prevent_enterprise_audit_mutation; triggers: enterprise_audit_events_append_only; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: 75ec446f1e49a003f91a81a84debb7ee2964ad4ff88afd34fd436466304c7aaf.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
  organization_id UUID PRIMARY KEY,
  last_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  key_version INTEGER NOT NULL CHECK (key_version > 0),
  id UUID PRIMARY KEY,
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  UNIQUE (organization_id, sequence),
  UNIQUE (organization_id, idempotency_key)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(256) NOT NULL UNIQUE,
  state VARCHAR(24) NOT NULL CHECK (state IN ('queued','running','completed','failed','expired')),
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
  retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 30 AND 2555),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  audit_event_id UUID NOT NULL REFERENCES enterprise_audit_events(id) ON DELETE RESTRICT,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
```

Lock-sensitive operations:

```sql
CREATE INDEX IF NOT EXISTS enterprise_audit_events_org_time_idx
CREATE INDEX IF NOT EXISTS enterprise_audit_events_org_action_idx
CREATE INDEX IF NOT EXISTS enterprise_audit_events_org_correlation_idx
CREATE INDEX IF NOT EXISTS audit_outbox_pending_idx
CREATE INDEX IF NOT EXISTS audit_exports_org_created_idx
CREATE INDEX IF NOT EXISTS platform_operator_grants_org_expiry_idx
DROP TRIGGER IF EXISTS enterprise_audit_events_append_only ON enterprise_audit_events;
CREATE TRIGGER enterprise_audit_events_append_only
```

## 014_usage_billing_quotas.sql

Purpose: usage billing quotas. Existing schema history; not a new Phase 3 migration.

- Creates tables: meter_definitions, usage_events, usage_period_aggregates, usage_reconciliations, plan_definitions, organization_subscriptions, entitlement_overrides, quota_reservations.
- Alters tables: none.
- Explicit prior-table dependencies: 001_control_plane_foundation.sql.
- Indexes: usage_events_org_time_idx, active_subscription_org_idx, quota_reservations_active_idx.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: 145a6e2f924bf040cc3bbde1ae195888d55f02432ce5b7b5c37fdd74a794e649.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
  version integer NOT NULL CHECK (version > 0),
  PRIMARY KEY (meter_id, version)
  event_id uuid PRIMARY KEY,
  quantity bigint NOT NULL CHECK (quantity >= 0),
  window_end timestamptz NOT NULL CHECK (window_end >= window_start),
  processing_status text NOT NULL CHECK (processing_status IN ('accepted','late','processed','dead_letter')),
  UNIQUE (organization_id, meter_id, meter_version, idempotency_key)
  status text NOT NULL CHECK (status IN ('estimated','reconciled','finalized')), rebuilt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, meter_id, meter_version, period_start)
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), meter_id text NOT NULL,
  plan_id text NOT NULL, version integer NOT NULL CHECK (version > 0), currency char(3) NOT NULL,
  PRIMARY KEY(plan_id, version)
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), plan_id text NOT NULL, plan_version integer NOT NULL,
  state text NOT NULL CHECK (state IN ('active','grace','suspended','cancelled')), effective_at timestamptz NOT NULL,
CREATE UNIQUE INDEX IF NOT EXISTS active_subscription_org_idx ON organization_subscriptions(organization_id) WHERE ended_at IS NULL;
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), entitlement text NOT NULL,
  value bigint NOT NULL CHECK(value >= 0), reason text NOT NULL, starts_at timestamptz NOT NULL, expires_at timestamptz,
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), resource_type text NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0), owner_operation text NOT NULL, idempotency_key text NOT NULL,
  status text NOT NULL CHECK(status IN ('active','consumed','released','expired')), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(organization_id, resource_type, idempotency_key)
  organization_id uuid NOT NULL REFERENCES organizations(id),
  adjustment_of uuid REFERENCES usage_events(event_id),
  FOREIGN KEY (meter_id, meter_version) REFERENCES meter_definitions(meter_id, version),
  organization_id uuid NOT NULL REFERENCES organizations(id), meter_id text NOT NULL, meter_version integer NOT NULL,
  safe_reason text, correction_event_id uuid REFERENCES usage_events(event_id), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  ended_at timestamptz, version integer NOT NULL DEFAULT 1, FOREIGN KEY(plan_id, plan_version) REFERENCES plan_definitions(plan_id, version)
```

Lock-sensitive operations:

```sql
CREATE INDEX IF NOT EXISTS usage_events_org_time_idx ON usage_events(organization_id, occurred_at DESC, event_id);
CREATE UNIQUE INDEX IF NOT EXISTS active_subscription_org_idx ON organization_subscriptions(organization_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS quota_reservations_active_idx ON quota_reservations(organization_id, resource_type, expires_at) WHERE status='active';
```

## 015_durable_component_state.sql

Purpose: durable component state. Existing Phase 1 persistence implementation.

- Creates tables: none.
- Alters tables: preview_policies, preview_instances, preview_revisions, preview_cleanup_jobs, platform_routes, custom_domains, provider_connections, deployment_targets, services, secret_references, service_secret_references, approval_requests.
- Explicit prior-table dependencies: 008_previews_domains_tls.sql, 010_byoc_foundation.sql, 004_deployment_pipeline.sql, 011_enterprise_rbac_managed_secrets.sql, 012_approval_policy_kyverno_drift.sql, 001_control_plane_foundation.sql.
- Indexes: preview_revision_idempotency_idx, preview_live_pr_idx, preview_live_hostname_idx, routes_live_hostname_idx, domains_live_hostname_idx, preview_instances_org_idx, platform_routes_org_idx, domain_challenge_domain_idx, credential_connection_version_idx, credential_target_version_idx, capability_connection_idx, capability_target_idx.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: 84bf50e9a9171195cbe13b94a1f984f46424bf1fcba3cd801c4c16182e1717d5.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
CREATE UNIQUE INDEX preview_revision_idempotency_idx ON preview_revisions(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE preview_instances DROP CONSTRAINT preview_instances_organization_id_service_id_pull_request_n_key;
ALTER TABLE preview_instances DROP CONSTRAINT preview_instances_generated_hostname_key;
CREATE UNIQUE INDEX preview_live_pr_idx ON preview_instances(organization_id,service_id,pull_request_number) WHERE lifecycle_status <> 'removed';
CREATE UNIQUE INDEX preview_live_hostname_idx ON preview_instances(generated_hostname) WHERE lifecycle_status <> 'removed';
ALTER TABLE platform_routes DROP CONSTRAINT platform_routes_hostname_key;
CREATE UNIQUE INDEX routes_live_hostname_idx ON platform_routes(hostname) WHERE status <> 'removed';
ALTER TABLE custom_domains DROP CONSTRAINT custom_domains_hostname_ascii_key;
CREATE UNIQUE INDEX domains_live_hostname_idx ON custom_domains(hostname_ascii) WHERE status <> 'removed';
CREATE UNIQUE INDEX domain_challenge_domain_idx ON domain_verification_challenges(custom_domain_id);
-- Nullable composite unique constraints do not enforce uniqueness for either owner.
CREATE UNIQUE INDEX credential_connection_version_idx ON credential_versions(provider_connection_id,version) WHERE provider_connection_id IS NOT NULL;
CREATE UNIQUE INDEX credential_target_version_idx ON credential_versions(deployment_target_id,version) WHERE deployment_target_id IS NOT NULL;
CREATE UNIQUE INDEX capability_connection_idx ON connection_capabilities(provider_connection_id,capability) WHERE provider_connection_id IS NOT NULL;
CREATE UNIQUE INDEX capability_target_idx ON connection_capabilities(deployment_target_id,capability) WHERE deployment_target_id IS NOT NULL;
ALTER TABLE secret_references ADD CONSTRAINT secret_environment_fk FOREIGN KEY(environment_id) REFERENCES environment_references(id);
ALTER TABLE service_secret_references ADD CONSTRAINT secret_service_fk FOREIGN KEY(service_id) REFERENCES services(id);
ALTER TABLE preview_policies ADD COLUMN created_by UUID REFERENCES users(id),
```

Lock-sensitive operations:

```sql
ALTER TABLE preview_policies ADD COLUMN created_by UUID REFERENCES users(id),
ALTER TABLE preview_instances ADD COLUMN deployment_resource JSONB;
ALTER TABLE preview_revisions ADD COLUMN idempotency_key TEXT,
CREATE UNIQUE INDEX preview_revision_idempotency_idx ON preview_revisions(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE preview_cleanup_jobs ADD COLUMN reason TEXT NOT NULL DEFAULT 'expired';
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
CREATE UNIQUE INDEX credential_connection_version_idx ON credential_versions(provider_connection_id,version) WHERE provider_connection_id IS NOT NULL;
CREATE UNIQUE INDEX credential_target_version_idx ON credential_versions(deployment_target_id,version) WHERE deployment_target_id IS NOT NULL;
CREATE UNIQUE INDEX capability_connection_idx ON connection_capabilities(provider_connection_id,capability) WHERE provider_connection_id IS NOT NULL;
CREATE UNIQUE INDEX capability_target_idx ON connection_capabilities(deployment_target_id,capability) WHERE deployment_target_id IS NOT NULL;
ALTER TABLE services ADD COLUMN secret_attachment_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE secret_references ADD CONSTRAINT secret_environment_fk FOREIGN KEY(environment_id) REFERENCES environment_references(id);
ALTER TABLE service_secret_references ADD CONSTRAINT secret_service_fk FOREIGN KEY(service_id) REFERENCES services(id);
ALTER TABLE approval_requests ADD COLUMN eligible_roles JSONB NOT NULL DEFAULT '[]',
UPDATE approval_requests r SET eligible_roles=p.eligible_roles,eligible_user_ids=p.eligible_user_ids
```

## 016_persistence_hardening.sql

Purpose: persistence hardening. Existing Phase 1 persistence implementation.

- Creates tables: quota_limits, deployment_outbox.
- Alters tables: audit_exports.
- Explicit prior-table dependencies: 013_enterprise_audit.sql, 001_control_plane_foundation.sql, 004_deployment_pipeline.sql.
- Indexes: deployment_outbox_pending_idx.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: baf247fe07ec298d686a04d7c264f36c46523480caa59a4760beff430b5bb7c9.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
  limit_value bigint NOT NULL CHECK(limit_value >= 0),
  PRIMARY KEY(organization_id,resource_type)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  UNIQUE(deployment_id,state_version)
  organization_id uuid NOT NULL REFERENCES organizations(id),
  deployment_id uuid NOT NULL REFERENCES deployments(id),
```

Lock-sensitive operations:

```sql
ALTER TABLE audit_exports ADD COLUMN IF NOT EXISTS export_body text;
CREATE INDEX IF NOT EXISTS deployment_outbox_pending_idx ON deployment_outbox(created_at) WHERE delivered_at IS NULL;
```

## 017_system_audit_scope.sql

Purpose: system audit scope. Existing Phase 1 persistence implementation.

- Creates tables: none.
- Alters tables: audit_outbox.
- Explicit prior-table dependencies: 013_enterprise_audit.sql.
- Indexes: enterprise_audit_event_scope_idx.
- Functions: none; triggers: none; extensions: none.
- File transaction wrapper: BEGIN/COMMIT.
- SHA-256: 192521ae834a80eefa9f130ca7a8d190a0795ea6c517e70f058e0a2bda24025f.

Constraints and foreign keys (exact declaration lines; complete SQL also in machine-readable inventory):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS enterprise_audit_event_scope_idx ON enterprise_audit_events(id,organization_id);
ALTER TABLE audit_outbox DROP CONSTRAINT IF EXISTS audit_outbox_organization_id_fkey;
ALTER TABLE audit_outbox ADD CONSTRAINT audit_outbox_event_scope_fk
  FOREIGN KEY(audit_event_id,organization_id) REFERENCES enterprise_audit_events(id,organization_id) ON DELETE RESTRICT;
```

Lock-sensitive operations:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS enterprise_audit_event_scope_idx ON enterprise_audit_events(id,organization_id);
ALTER TABLE audit_outbox DROP CONSTRAINT IF EXISTS audit_outbox_organization_id_fkey;
ALTER TABLE audit_outbox ADD CONSTRAINT audit_outbox_event_scope_fk
```
