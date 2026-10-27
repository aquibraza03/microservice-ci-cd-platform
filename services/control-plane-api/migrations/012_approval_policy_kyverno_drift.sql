BEGIN;

ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_current_state_check;
ALTER TABLE deployments ADD CONSTRAINT deployments_current_state_check CHECK(current_state IN ('waiting_for_approval','queued','validating','testing','scanning','building','build_complete','pushing','deploying','verifying','ready','failed','cancel_requested','cancelled','rollback_queued','rolling_back','rolled_back'));

CREATE TABLE IF NOT EXISTS approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID NULL REFERENCES projects(id), environment TEXT NULL, scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL, action TEXT NOT NULL, resource_type TEXT NULL, risk_level TEXT NOT NULL,
  required_count INTEGER NOT NULL CHECK(required_count BETWEEN 1 AND 10), eligible_roles JSONB NOT NULL,
  eligible_user_ids JSONB NOT NULL DEFAULT '[]', separation_of_duties BOOLEAN NOT NULL DEFAULT TRUE,
  expires_in_seconds INTEGER NOT NULL CHECK(expires_in_seconds BETWEEN 60 AND 86400), enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,scope_type,scope_id,action)
);
CREATE INDEX approval_policies_lookup_idx ON approval_policies(organization_id,action,project_id,environment) WHERE enabled;

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), policy_id UUID NOT NULL REFERENCES approval_policies(id),
  project_id UUID NULL REFERENCES projects(id), environment TEXT NULL, resource_type TEXT NOT NULL, resource_id TEXT NULL,
  action TEXT NOT NULL, risk_level TEXT NOT NULL, requester_id UUID NOT NULL REFERENCES users(id), policy_version INTEGER NOT NULL,
  resource_version INTEGER NULL, snapshot JSONB NOT NULL, snapshot_digest CHAR(64) NOT NULL,
  state TEXT NOT NULL CHECK(state IN('pending','approved','rejected','expired','cancelled','invalidated','overridden','executing','consumed','failed')),
  required_count INTEGER NOT NULL, separation_of_duties BOOLEAN NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  idempotency_key_hash CHAR(64) NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,idempotency_key_hash)
);
CREATE INDEX approval_requests_inbox_idx ON approval_requests(organization_id,state,expires_at);

CREATE TABLE IF NOT EXISTS approval_decisions (
  approval_request_id UUID NOT NULL REFERENCES approval_requests(id), actor_user_id UUID NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK(decision IN('approved','rejected')), role TEXT NOT NULL, authorization_version INTEGER NOT NULL,
  reason TEXT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(approval_request_id,actor_user_id)
);

CREATE TABLE IF NOT EXISTS protected_action_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), approval_request_id UUID NOT NULL REFERENCES approval_requests(id),
  execution_key_hash CHAR(64) NOT NULL, state TEXT NOT NULL CHECK(state IN('executing','consumed','failed')),
  queued_at TIMESTAMPTZ NULL, completed_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,execution_key_hash), UNIQUE(approval_request_id)
);

CREATE TABLE IF NOT EXISTS kubernetes_policy_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), deployment_target_id UUID NOT NULL REFERENCES deployment_targets(id),
  policy_id TEXT NOT NULL, policy_version INTEGER NOT NULL, desired_mode TEXT NOT NULL CHECK(desired_mode IN('enforce','audit','disabled')),
  observed_state TEXT NOT NULL CHECK(observed_state IN('enforce','audit','disabled','unsupported','unknown','error')),
  enforcement_source TEXT NOT NULL, safe_violations JSONB NOT NULL DEFAULT '[]', evaluated_at TIMESTAMPTZ NULL,
  version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,deployment_target_id,policy_id)
);

CREATE TABLE IF NOT EXISTS policy_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id),
  environment TEXT NOT NULL, deployment_target_id UUID NOT NULL REFERENCES deployment_targets(id), policy_id TEXT NOT NULL,
  service_id UUID NOT NULL REFERENCES services(id), workload_id TEXT NULL, justification TEXT NOT NULL, compensating_control TEXT NOT NULL,
  requester_id UUID NOT NULL REFERENCES users(id), approver_id UUID NULL REFERENCES users(id), approval_request_id UUID NULL REFERENCES approval_requests(id),
  starts_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL CHECK(status IN('pending','approved','active','expired','revoked','rejected')),
  policy_version INTEGER NOT NULL, resource_version INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(expires_at > starts_at)
);
CREATE INDEX policy_exceptions_active_idx ON policy_exceptions(organization_id,deployment_target_id,policy_id,expires_at) WHERE status IN('approved','active');

CREATE TABLE IF NOT EXISTS deployment_drift_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), deployment_id UUID NOT NULL REFERENCES deployments(id),
  target_id UUID NULL REFERENCES deployment_targets(id), status TEXT NOT NULL, findings JSONB NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), requested_by UUID NOT NULL REFERENCES users(id)
);
CREATE INDEX deployment_drift_reports_lookup_idx ON deployment_drift_reports(organization_id,deployment_id,evaluated_at DESC);

-- Forward recovery: disable a bad policy, invalidate its pending approvals and create a new version.
-- Approval snapshots and decisions are immutable evidence and must never be rewritten during recovery.
COMMIT;
