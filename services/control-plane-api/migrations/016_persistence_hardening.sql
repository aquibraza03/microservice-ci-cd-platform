BEGIN;
ALTER TABLE audit_exports ADD COLUMN IF NOT EXISTS export_body text;
CREATE TABLE IF NOT EXISTS quota_limits (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  resource_type text NOT NULL,
  limit_value bigint NOT NULL CHECK(limit_value >= 0),
  PRIMARY KEY(organization_id,resource_type)
);
CREATE TABLE IF NOT EXISTS deployment_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL REFERENCES deployments(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  state_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE(deployment_id,state_version)
);
CREATE INDEX IF NOT EXISTS deployment_outbox_pending_idx ON deployment_outbox(created_at) WHERE delivered_at IS NULL;
COMMIT;
