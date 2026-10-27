BEGIN;
CREATE TABLE IF NOT EXISTS git_provider_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), provider VARCHAR(32) NOT NULL,
  provider_installation_id BIGINT NOT NULL, account_id BIGINT NOT NULL, account_login VARCHAR(255) NOT NULL, account_type VARCHAR(32) NOT NULL,
  repository_selection VARCHAR(32) NOT NULL, connection_state VARCHAR(32) NOT NULL DEFAULT 'active', created_by UUID NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_installation_id), CHECK(connection_state IN ('active','suspended','revoked','disconnected'))
);
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
CREATE TABLE IF NOT EXISTS git_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider VARCHAR(32) NOT NULL, delivery_id VARCHAR(128) NOT NULL, event_type VARCHAR(64) NOT NULL,
  installation_id UUID REFERENCES git_provider_installations(id), repository_id UUID REFERENCES repository_references(id), organization_id UUID REFERENCES organizations(id),
  status VARCHAR(32) NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ, UNIQUE(provider, delivery_id)
);
CREATE INDEX IF NOT EXISTS idx_git_deliveries_org_received ON git_webhook_deliveries(organization_id, received_at DESC);
CREATE TABLE IF NOT EXISTS git_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
  delivery_id UUID NOT NULL UNIQUE REFERENCES git_webhook_deliveries(id), event_type VARCHAR(64) NOT NULL, branch VARCHAR(255), commit_sha VARCHAR(64),
  sender VARCHAR(255), event_timestamp TIMESTAMPTZ NOT NULL, trigger_source VARCHAR(32) NOT NULL, pull_request_number BIGINT,
  forked_pull_request BOOLEAN NOT NULL DEFAULT FALSE, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(octet_length(metadata::text) <= 65536)
);
CREATE INDEX IF NOT EXISTS idx_git_events_org_repo_created ON git_events(organization_id, repository_id, created_at DESC);
COMMIT;
