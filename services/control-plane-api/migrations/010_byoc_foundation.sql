BEGIN;
CREATE TABLE IF NOT EXISTS provider_connections (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), display_name VARCHAR(160) NOT NULL,
 provider_type VARCHAR(32) NOT NULL, role_arn VARCHAR(600), expected_account_id VARCHAR(32), external_id_ciphertext BYTEA, external_id_hash VARCHAR(64),
 permitted_regions JSONB NOT NULL DEFAULT '[]', enabled_capabilities JSONB NOT NULL DEFAULT '[]', status VARCHAR(24) NOT NULL DEFAULT 'draft',
 last_validation_at TIMESTAMPTZ, last_successful_validation_at TIMESTAMPTZ, validation_error_category VARCHAR(80), configuration_version BIGINT NOT NULL DEFAULT 1,
 version BIGINT NOT NULL DEFAULT 1, disabled_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, idempotency_key_hash VARCHAR(64) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(organization_id,idempotency_key_hash), UNIQUE(external_id_hash),
 CHECK(provider_type IN ('aws')), CHECK(status IN ('draft','validating','active','degraded','invalid','disabled','revoked')),
 CHECK(jsonb_typeof(permitted_regions)='array'), CHECK(jsonb_typeof(enabled_capabilities)='array')
);
CREATE INDEX IF NOT EXISTS idx_provider_connections_org_status ON provider_connections(organization_id,status);

CREATE TABLE IF NOT EXISTS deployment_targets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), provider_connection_id UUID REFERENCES provider_connections(id),
 name VARCHAR(160) NOT NULL, target_type VARCHAR(32) NOT NULL, cluster_fingerprint VARCHAR(128), api_server_origin VARCHAR(2048) NOT NULL,
 allowed_namespaces JSONB NOT NULL, allowed_environments JSONB NOT NULL, authentication_method VARCHAR(40) NOT NULL,
 kubernetes_version VARCHAR(64), capability_results JSONB NOT NULL DEFAULT '{}', permission_validation VARCHAR(32) NOT NULL DEFAULT 'pending',
 credential_version BIGINT NOT NULL DEFAULT 1, connection_health VARCHAR(32) NOT NULL DEFAULT 'unknown', status VARCHAR(24) NOT NULL DEFAULT 'draft',
 last_validation_at TIMESTAMPTZ, validation_error_category VARCHAR(80), version BIGINT NOT NULL DEFAULT 1, disabled_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
 idempotency_key_hash VARCHAR(64) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(organization_id,name), UNIQUE(organization_id,idempotency_key_hash), UNIQUE(organization_id,cluster_fingerprint),
 CHECK(target_type='kubernetes'), CHECK(status IN ('draft','validating','active','degraded','invalid','disabled','revoked')),
 CHECK(authentication_method IN ('oidc','workload_identity','service_account_token')),
 CHECK(jsonb_typeof(allowed_namespaces)='array'), CHECK(jsonb_array_length(allowed_namespaces)>0), CHECK(jsonb_typeof(allowed_environments)='array')
);
CREATE INDEX IF NOT EXISTS idx_deployment_targets_org_status ON deployment_targets(organization_id,status);

CREATE TABLE IF NOT EXISTS connection_capabilities (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), provider_connection_id UUID REFERENCES provider_connections(id), deployment_target_id UUID REFERENCES deployment_targets(id),
 capability VARCHAR(80) NOT NULL, support_level VARCHAR(24) NOT NULL, enabled BOOLEAN NOT NULL, evidence VARCHAR(80) NOT NULL,
 checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), metadata JSONB NOT NULL DEFAULT '{}',
 CHECK((provider_connection_id IS NOT NULL) <> (deployment_target_id IS NOT NULL)), CHECK(support_level IN ('production','beta','experimental','planned','unsupported')),
 UNIQUE(provider_connection_id,deployment_target_id,capability)
);
CREATE TABLE IF NOT EXISTS connection_validation_attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), provider_connection_id UUID REFERENCES provider_connections(id), deployment_target_id UUID REFERENCES deployment_targets(id),
 status VARCHAR(24) NOT NULL, error_category VARCHAR(80), retryable BOOLEAN, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
 CHECK((provider_connection_id IS NOT NULL) <> (deployment_target_id IS NOT NULL)), CHECK(status IN ('running','passed','failed','cancelled','timed_out'))
);
CREATE INDEX IF NOT EXISTS idx_connection_validation_running ON connection_validation_attempts(organization_id,status,started_at) WHERE status='running';
CREATE TABLE IF NOT EXISTS credential_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), provider_connection_id UUID REFERENCES provider_connections(id), deployment_target_id UUID REFERENCES deployment_targets(id),
 version BIGINT NOT NULL, encryption_algorithm VARCHAR(32) NOT NULL, encrypted_payload BYTEA NOT NULL, nonce BYTEA NOT NULL, authentication_tag BYTEA NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), rotated_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
 CHECK((provider_connection_id IS NOT NULL) <> (deployment_target_id IS NOT NULL)), UNIQUE(provider_connection_id,deployment_target_id,version)
);
COMMIT;

-- Forward recovery: disable the affected connection/target and create a new
-- credential version. This migration intentionally has no destructive down
-- migration and never stores plaintext credentials or temporary AWS sessions.
