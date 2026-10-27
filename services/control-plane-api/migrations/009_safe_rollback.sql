BEGIN;

ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_reason VARCHAR(1000);
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_approval_id UUID;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_actor_id UUID REFERENCES users(id);
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_requested_at TIMESTAMPTZ;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS rollback_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS rollback_policies (
  organization_id UUID NOT NULL REFERENCES organizations(id),
  environment VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  database_compatibility_mode VARCHAR(16) NOT NULL DEFAULT 'warn'
    CHECK (database_compatibility_mode IN ('warn','block')),
  lock_timeout_seconds INTEGER NOT NULL DEFAULT 900 CHECK (lock_timeout_seconds BETWEEN 30 AND 3600),
  updated_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, environment)
);

CREATE TABLE IF NOT EXISTS rollback_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  source_deployment_id UUID NOT NULL REFERENCES deployments(id),
  target_deployment_id UUID NOT NULL REFERENCES deployments(id),
  status VARCHAR(16) NOT NULL CHECK (status IN ('approved','revoked','used')),
  approved_by UUID NOT NULL REFERENCES users(id),
  justification VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  UNIQUE (organization_id, source_deployment_id, target_deployment_id, id)
);

DO $$ BEGIN
  ALTER TABLE deployments
    ADD CONSTRAINT deployments_rollback_approval_fk
    FOREIGN KEY (rollback_approval_id) REFERENCES rollback_approvals(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS deployment_operation_locks (
  organization_id UUID NOT NULL REFERENCES organizations(id),
  service_id UUID NOT NULL REFERENCES services(id),
  environment VARCHAR(64) NOT NULL,
  deployment_id UUID NOT NULL REFERENCES deployments(id),
  operation VARCHAR(32) NOT NULL CHECK (operation IN ('deployment','rollback')),
  idempotency_key_hash VARCHAR(64) NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (organization_id, service_id, environment)
);

CREATE TABLE IF NOT EXISTS rollback_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  rollback_deployment_id UUID REFERENCES deployments(id),
  source_deployment_id UUID NOT NULL REFERENCES deployments(id),
  target_deployment_id UUID NOT NULL REFERENCES deployments(id),
  actor_user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(64) NOT NULL,
  reason VARCHAR(1000),
  approval_id UUID REFERENCES rollback_approvals(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (octet_length(metadata::text) <= 65536)
);

CREATE INDEX IF NOT EXISTS idx_rollback_audit_org_created
  ON rollback_audit_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rollback_audit_deployment
  ON rollback_audit_events(rollback_deployment_id, created_at);

COMMIT;
