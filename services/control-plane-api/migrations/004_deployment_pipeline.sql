BEGIN;
CREATE TABLE IF NOT EXISTS services (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
 name VARCHAR(120) NOT NULL, service_path VARCHAR(512) NOT NULL DEFAULT '.', version BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(project_id,name)
);
CREATE TABLE IF NOT EXISTS deployments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), service_id UUID NOT NULL REFERENCES services(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
 branch VARCHAR(255) NOT NULL, commit_sha VARCHAR(64) NOT NULL, trigger_source VARCHAR(32) NOT NULL, triggering_user_id UUID REFERENCES users(id), environment VARCHAR(64) NOT NULL, provider VARCHAR(32) NOT NULL,
 current_state VARCHAR(32) NOT NULL DEFAULT 'queued', state_version BIGINT NOT NULL DEFAULT 1, configuration_snapshot JSONB NOT NULL, image_tag VARCHAR(255), image_digest VARCHAR(255), attempt_count INTEGER NOT NULL DEFAULT 0,
 failure_code VARCHAR(64), failure_message VARCHAR(500), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, previous_successful_deployment_id UUID REFERENCES deployments(id), rollback_target_id UUID REFERENCES deployments(id),
 idempotency_key_hash VARCHAR(64), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(organization_id,idempotency_key_hash), CHECK(octet_length(configuration_snapshot::text)<=65536),
 CHECK(current_state IN ('queued','validating','testing','scanning','building','build_complete','pushing','deploying','verifying','ready','failed','cancel_requested','cancelled','rollback_queued','rolling_back','rolled_back'))
);
CREATE INDEX IF NOT EXISTS idx_deployments_org_created ON deployments(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_state_created ON deployments(current_state,created_at);
CREATE TABLE IF NOT EXISTS deployment_stages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), name VARCHAR(64) NOT NULL, state VARCHAR(32) NOT NULL, attempt INTEGER NOT NULL, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, duration_ms BIGINT, safe_message VARCHAR(500), UNIQUE(deployment_id,name,attempt));
CREATE TABLE IF NOT EXISTS deployment_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), organization_id UUID NOT NULL REFERENCES organizations(id), sequence BIGINT NOT NULL, event_type VARCHAR(64) NOT NULL, state VARCHAR(32), safe_message VARCHAR(2000), metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(deployment_id,sequence), CHECK(octet_length(metadata::text)<=65536));
CREATE INDEX IF NOT EXISTS idx_deployment_events_replay ON deployment_events(deployment_id,sequence);
CREATE TABLE IF NOT EXISTS deployment_job_attempts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), attempt INTEGER NOT NULL, worker_id VARCHAR(255), status VARCHAR(32) NOT NULL, heartbeat_at TIMESTAMPTZ, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ, failure_code VARCHAR(64), UNIQUE(deployment_id,attempt));
CREATE TABLE IF NOT EXISTS deployment_log_chunks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), organization_id UUID NOT NULL REFERENCES organizations(id), sequence BIGINT NOT NULL, stage VARCHAR(64), content TEXT NOT NULL, byte_size INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, UNIQUE(deployment_id,sequence), CHECK(byte_size<=65536));
CREATE TABLE IF NOT EXISTS deployment_artifacts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), kind VARCHAR(64) NOT NULL, uri TEXT, byte_size BIGINT NOT NULL, sha256 VARCHAR(64), metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS deployment_images (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL UNIQUE REFERENCES deployments(id), local_reference VARCHAR(255) NOT NULL, image_tag VARCHAR(255) NOT NULL, digest VARCHAR(255), platform VARCHAR(64), byte_size BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS deployment_cancellation_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES deployments(id), requested_by UUID NOT NULL REFERENCES users(id), reason VARCHAR(500), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), acknowledged_at TIMESTAMPTZ);
COMMIT;
