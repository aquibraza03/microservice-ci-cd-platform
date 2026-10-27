BEGIN;

UPDATE organization_members SET role = 'viewer' WHERE role = 'member';

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_organization_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE repository_references ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE environment_references ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_current_organization_fk FOREIGN KEY (current_organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check CHECK (role IN ('owner','admin','developer','operator','viewer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_jti_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_members_user_status_idx ON organization_members(user_id, status, organization_id);
CREATE INDEX IF NOT EXISTS organization_members_org_role_idx ON organization_members(organization_id, role, user_id);
CREATE INDEX IF NOT EXISTS repository_references_org_project_idx ON repository_references(organization_id, project_id);
CREATE INDEX IF NOT EXISTS environment_references_org_project_idx ON environment_references(organization_id, project_id);
CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx ON user_sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx ON audit_events(actor_user_id, created_at DESC);

COMMIT;
