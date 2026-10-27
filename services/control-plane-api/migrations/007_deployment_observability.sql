ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS schema_version VARCHAR(32) NOT NULL DEFAULT 'deployment-event.v1';
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS stage VARCHAR(64);
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS state_version BIGINT;
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS level VARCHAR(16) NOT NULL DEFAULT 'info';
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS source VARCHAR(64) NOT NULL DEFAULT 'control-plane';
ALTER TABLE deployment_events ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 0;
DO $$ BEGIN ALTER TABLE deployment_events ADD CONSTRAINT deployment_events_level_check CHECK(level IN ('debug','info','warn','error')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_deployment_events_filters ON deployment_events(deployment_id,stage,level,created_at,sequence);
CREATE INDEX IF NOT EXISTS idx_deployment_events_retention ON deployment_events(created_at);
