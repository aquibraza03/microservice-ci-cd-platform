BEGIN;

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS authorization_version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check
  CHECK(role IN ('owner','admin','security_admin','platform_engineer','developer','operator','approver','auditor','viewer'));

CREATE TABLE IF NOT EXISTS role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(40) NOT NULL,
  scope_type VARCHAR(40) NOT NULL,
  scope_id UUID NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,user_id,role,scope_type,scope_id),
  CHECK(role IN ('owner','admin','security_admin','platform_engineer','developer','operator','approver','auditor','viewer')),
  CHECK(scope_type IN ('organization','project','environment','cloud_connection','deployment_target','deployment','secret_reference','domain','policy'))
);
CREATE INDEX IF NOT EXISTS idx_role_assignments_actor ON role_assignments(organization_id,user_id,scope_type,scope_id);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email_normalized VARCHAR(320) NOT NULL,
  role VARCHAR(40) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(status IN ('pending','accepted','revoked','expired'))
);
CREATE INDEX IF NOT EXISTS idx_invitations_org_status ON organization_invitations(organization_id,status,expires_at);

CREATE TABLE IF NOT EXISTS secret_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  environment_id UUID NOT NULL,
  provider_connection_id UUID REFERENCES provider_connections(id),
  deployment_target_id UUID REFERENCES deployment_targets(id),
  display_name VARCHAR(160) NOT NULL,
  provider_type VARCHAR(48) NOT NULL,
  external_identifier VARCHAR(2048) NOT NULL,
  version_selector VARCHAR(512),
  injection_key VARCHAR(253) NOT NULL,
  destination VARCHAR(40) NOT NULL,
  protected BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  validation_category VARCHAR(80),
  last_validation_at TIMESTAMPTZ,
  reference_version BIGINT NOT NULL DEFAULT 1,
  version BIGINT NOT NULL DEFAULT 1,
  disabled_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(provider_type IN ('aws_secrets_manager','kubernetes_external_secret')),
  CHECK(destination IN ('environment','file')),
  CHECK(status IN ('draft','active','invalid','disabled','revoked')),
  UNIQUE(organization_id,project_id,environment_id,display_name)
);
CREATE INDEX IF NOT EXISTS idx_secret_references_scope ON secret_references(organization_id,project_id,environment_id,status);

CREATE TABLE IF NOT EXISTS service_secret_references (
  organization_id UUID NOT NULL REFERENCES organizations(id),
  service_id UUID NOT NULL,
  secret_reference_id UUID NOT NULL REFERENCES secret_references(id),
  reference_version BIGINT NOT NULL,
  attachment_version BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(service_id,secret_reference_id)
);

COMMIT;

-- Forward recovery: disable or revoke affected references/assignments and
-- increment authorization/reference versions. No plaintext secret column exists.
