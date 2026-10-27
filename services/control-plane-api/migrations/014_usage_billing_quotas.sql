BEGIN;

CREATE TABLE IF NOT EXISTS meter_definitions (
  meter_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  unit text NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (meter_id, version)
);

CREATE TABLE IF NOT EXISTS usage_events (
  event_id uuid PRIMARY KEY,
  schema_version integer NOT NULL DEFAULT 1,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  meter_id text NOT NULL,
  meter_version integer NOT NULL,
  quantity bigint NOT NULL CHECK (quantity >= 0),
  unit text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL CHECK (window_end >= window_start),
  source_resource_type text NOT NULL,
  source_resource_id text NOT NULL,
  source_event_id text,
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processing_status text NOT NULL CHECK (processing_status IN ('accepted','late','processed','dead_letter')),
  adjustment_of uuid REFERENCES usage_events(event_id),
  FOREIGN KEY (meter_id, meter_version) REFERENCES meter_definitions(meter_id, version),
  UNIQUE (organization_id, meter_id, meter_version, idempotency_key)
);
CREATE INDEX IF NOT EXISTS usage_events_org_time_idx ON usage_events(organization_id, occurred_at DESC, event_id);

CREATE TABLE IF NOT EXISTS usage_period_aggregates (
  organization_id uuid NOT NULL REFERENCES organizations(id), meter_id text NOT NULL, meter_version integer NOT NULL,
  period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, quantity bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('estimated','reconciled','finalized')), rebuilt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organization_id, meter_id, meter_version, period_start)
);
CREATE TABLE IF NOT EXISTS usage_reconciliations (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), meter_id text NOT NULL,
  period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, expected_quantity bigint NOT NULL,
  recorded_quantity bigint NOT NULL, difference bigint NOT NULL, status text NOT NULL,
  safe_reason text, correction_event_id uuid REFERENCES usage_events(event_id), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS plan_definitions (
  plan_id text NOT NULL, version integer NOT NULL CHECK (version > 0), currency char(3) NOT NULL,
  entitlements jsonb NOT NULL, pricing jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(plan_id, version)
);
CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), plan_id text NOT NULL, plan_version integer NOT NULL,
  state text NOT NULL CHECK (state IN ('active','grace','suspended','cancelled')), effective_at timestamptz NOT NULL,
  ended_at timestamptz, version integer NOT NULL DEFAULT 1, FOREIGN KEY(plan_id, plan_version) REFERENCES plan_definitions(plan_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS active_subscription_org_idx ON organization_subscriptions(organization_id) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS entitlement_overrides (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), entitlement text NOT NULL,
  value bigint NOT NULL CHECK(value >= 0), reason text NOT NULL, starts_at timestamptz NOT NULL, expires_at timestamptz,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), version integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS quota_reservations (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), resource_type text NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0), owner_operation text NOT NULL, idempotency_key text NOT NULL,
  status text NOT NULL CHECK(status IN ('active','consumed','released','expired')), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL, released_at timestamptz, version integer NOT NULL DEFAULT 1,
  UNIQUE(organization_id, resource_type, idempotency_key)
);
CREATE INDEX IF NOT EXISTS quota_reservations_active_idx ON quota_reservations(organization_id, resource_type, expires_at) WHERE status='active';

COMMIT;
