BEGIN;
CREATE TABLE IF NOT EXISTS preview_policies (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), service_id UUID NOT NULL REFERENCES services(id), repository_id UUID NOT NULL REFERENCES repository_references(id),
 enabled BOOLEAN NOT NULL DEFAULT TRUE, ttl_seconds INTEGER NOT NULL DEFAULT 86400 CHECK(ttl_seconds BETWEEN 300 AND 604800), max_cpu_millicores INTEGER NOT NULL DEFAULT 500, max_memory_mebibytes INTEGER NOT NULL DEFAULT 512, max_storage_mebibytes INTEGER NOT NULL DEFAULT 1024,
 allow_fork_previews BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(organization_id,project_id,service_id)
);
CREATE TABLE IF NOT EXISTS preview_instances (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), service_id UUID NOT NULL REFERENCES services(id), repository_id UUID NOT NULL REFERENCES repository_references(id), pull_request_number INTEGER, isolation_key VARCHAR(63) NOT NULL, generated_hostname VARCHAR(253) NOT NULL,
 lifecycle_status VARCHAR(24) NOT NULL, cleanup_status VARCHAR(24) NOT NULL DEFAULT 'not_requested', active_revision_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(organization_id,service_id,pull_request_number), UNIQUE(generated_hostname)
);
CREATE TABLE IF NOT EXISTS preview_revisions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), preview_id UUID NOT NULL REFERENCES preview_instances(id) ON DELETE CASCADE, organization_id UUID NOT NULL REFERENCES organizations(id), deployment_id UUID REFERENCES deployments(id), commit_sha VARCHAR(64) NOT NULL CHECK(commit_sha ~ '^[a-f0-9]{40,64}$'), provider_delivery_id VARCHAR(128), trust_level VARCHAR(24) NOT NULL, protected_secrets_allowed BOOLEAN NOT NULL DEFAULT FALSE,
 status VARCHAR(24) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(preview_id,commit_sha), UNIQUE(provider_delivery_id)
);
DO $$ BEGIN ALTER TABLE preview_instances ADD CONSTRAINT preview_instances_active_revision_id_fkey FOREIGN KEY(active_revision_id) REFERENCES preview_revisions(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS platform_routes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), service_id UUID NOT NULL REFERENCES services(id), preview_id UUID REFERENCES preview_instances(id) ON DELETE CASCADE, hostname VARCHAR(253) NOT NULL UNIQUE, route_kind VARCHAR(24) NOT NULL DEFAULT 'ingress', namespace VARCHAR(63) NOT NULL, resource_name VARCHAR(63) NOT NULL, backend_service VARCHAR(63) NOT NULL, backend_port INTEGER NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'requested', tls_required BOOLEAN NOT NULL DEFAULT TRUE, certificate_status VARCHAR(24) NOT NULL DEFAULT 'requested', certificate_expires_at TIMESTAMPTZ, last_verified_at TIMESTAMPTZ, verification_scope VARCHAR(16), failure_code VARCHAR(64), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS custom_domains (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id), project_id UUID NOT NULL REFERENCES projects(id), service_id UUID NOT NULL REFERENCES services(id), hostname_ascii VARCHAR(253) NOT NULL UNIQUE, hostname_display VARCHAR(253) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'pending_verification', route_id UUID REFERENCES platform_routes(id), created_by UUID NOT NULL REFERENCES users(id), removed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS domain_verification_challenges (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), custom_domain_id UUID NOT NULL REFERENCES custom_domains(id) ON DELETE CASCADE, token_hash VARCHAR(64) NOT NULL, dns_record_name VARCHAR(253) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, verified_at TIMESTAMPTZ, attempts INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS preview_cleanup_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), preview_id UUID NOT NULL REFERENCES preview_instances(id) ON DELETE CASCADE, organization_id UUID NOT NULL REFERENCES organizations(id), status VARCHAR(24) NOT NULL DEFAULT 'pending', attempt INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finalizer_deadline TIMESTAMPTZ NOT NULL, owned_resource_ids JSONB NOT NULL, last_error VARCHAR(500), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(preview_id)
);
CREATE INDEX IF NOT EXISTS idx_preview_expiration ON preview_instances(lifecycle_status,expires_at);
CREATE INDEX IF NOT EXISTS idx_cleanup_due ON preview_cleanup_jobs(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_certificate_expiry ON platform_routes(certificate_status,certificate_expires_at);
COMMIT;
