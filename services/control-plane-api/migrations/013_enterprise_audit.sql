BEGIN;

CREATE TABLE IF NOT EXISTS audit_chain_heads (
  organization_id UUID PRIMARY KEY,
  last_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  last_hash CHAR(64) NOT NULL,
  key_version INTEGER NOT NULL CHECK (key_version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enterprise_audit_events (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  schema_version VARCHAR(16) NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL,
  event_payload JSONB NOT NULL,
  previous_hash CHAR(64) NOT NULL,
  event_hash CHAR(64) NOT NULL,
  key_version INTEGER NOT NULL CHECK (key_version > 0),
  idempotency_key VARCHAR(256) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, sequence),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS enterprise_audit_events_org_time_idx
  ON enterprise_audit_events(organization_id, event_timestamp DESC, sequence DESC);
CREATE INDEX IF NOT EXISTS enterprise_audit_events_org_action_idx
  ON enterprise_audit_events(organization_id, (event_payload->>'action'), sequence DESC);
CREATE INDEX IF NOT EXISTS enterprise_audit_events_org_correlation_idx
  ON enterprise_audit_events(organization_id, (event_payload->>'correlationId'));

CREATE TABLE IF NOT EXISTS audit_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  audit_event_id UUID NOT NULL REFERENCES enterprise_audit_events(id) ON DELETE RESTRICT,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  idempotency_key VARCHAR(256) NOT NULL UNIQUE,
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  last_error_code VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_outbox_pending_idx
  ON audit_outbox(available_at) WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_exports (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  state VARCHAR(24) NOT NULL CHECK (state IN ('queued','running','completed','failed','expired')),
  format VARCHAR(32) NOT NULL,
  filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  object_reference TEXT,
  content_sha256 CHAR(64),
  event_count BIGINT,
  download_token_hash CHAR(64),
  download_expires_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ,
  idempotency_key VARCHAR(256) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS audit_exports_org_created_idx
  ON audit_exports(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_retention_policies (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
  retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 30 AND 2555),
  version BIGINT NOT NULL DEFAULT 1,
  updated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_operator_access_grants (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  operator_actor_id VARCHAR(128) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_operator_grants_org_expiry_idx
  ON platform_operator_access_grants(organization_id, expires_at);

-- Application roles cannot mutate history. A separately controlled retention worker may
-- set this transaction-local flag; database owners can bypass triggers and are in the
-- documented trust boundary, so this is tamper-evident rather than immutable storage.
CREATE OR REPLACE FUNCTION prevent_enterprise_audit_mutation() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.audit_retention_worker', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'enterprise audit events are append-only';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enterprise_audit_events_append_only ON enterprise_audit_events;
CREATE TRIGGER enterprise_audit_events_append_only
  BEFORE UPDATE OR DELETE ON enterprise_audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_enterprise_audit_mutation();

COMMIT;
