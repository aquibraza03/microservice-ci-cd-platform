CREATE TABLE IF NOT EXISTS repository_detection_runs (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
  commit_sha VARCHAR(64) NOT NULL CHECK (commit_sha ~ '^[a-f0-9]{40,64}$'), engine_version VARCHAR(32) NOT NULL, status VARCHAR(24) NOT NULL CHECK(status IN ('completed','failed')),
  result JSONB NOT NULL, created_by UUID NOT NULL REFERENCES users(id), idempotency_key VARCHAR(128) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,repository_id,commit_sha,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_detection_tenant_project ON repository_detection_runs(organization_id,project_id,created_at DESC);

CREATE TABLE IF NOT EXISTS service_configuration_drafts (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), user_id UUID NOT NULL REFERENCES users(id),
  repository_id UUID NOT NULL REFERENCES repository_references(id), commit_sha VARCHAR(64) NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40,64}$'), candidate_id VARCHAR(80) NOT NULL,
  configuration JSONB NOT NULL, validation JSONB, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,project_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_config_drafts_tenant ON service_configuration_drafts(organization_id,project_id,user_id);

CREATE TABLE IF NOT EXISTS service_configurations (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
  commit_sha VARCHAR(64) NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40,64}$'), candidate_id VARCHAR(80) NOT NULL, configuration JSONB NOT NULL,
  generated_service_yaml TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_configs_tenant ON service_configurations(organization_id,project_id,created_at DESC);
