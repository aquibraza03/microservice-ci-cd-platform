# Phase 11A Control Plane Foundation Report

**Date:** 2026-08-24

## 1. Architecture

Added `services/control-plane-api` as a production-oriented, versioned control-plane boundary. The service separates HTTP handling, configuration, authentication adapters, validation, domain repositories, PostgreSQL infrastructure, errors, migrations, and OpenAPI documentation. The existing `auth-service` remains untouched and remains a development/test stub.

Request flow:

```text
HTTP request
  -> request ID / CORS / rate-limit boundary
  -> replaceable identity provider
  -> tenant-scoped application/repository operations
  -> PostgreSQL in production or explicit memory adapter in tests
  -> structured response/error
```

## 2. Service structure

- `src/server.js`: versioned HTTP application, request IDs, CORS, rate limiting, routing, safe errors, graceful shutdown.
- `src/config.js`: validated environment configuration and production safety checks.
- `src/auth/provider.js`: demo-only identity provider and replaceable JWT adapter boundary.
- `src/domain/repositories.js`: explicit in-memory test/development repository.
- `src/domain/postgres-repository.js`: parameterized PostgreSQL data-access implementation.
- `src/database/pool.js`: PostgreSQL pool and readiness check.
- `src/database/transaction.js`: transaction helper.
- `src/database/migrate.js`: explicit migration runner; startup does not mutate schema.
- `src/validation/schemas.js`: Zod request validation.
- `src/errors.js`: structured error envelope without internal details.

## 3. Database architecture

Added PostgreSQL support through `pg` with environment-based `DATABASE_URL`, bounded pool configuration, parameterized queries, and transaction support. Production automatically selects `PostgresRepository` when `DATABASE_URL` is configured. Tests and local development can use the explicit in-memory adapter.

## 4. Domain models

Migration `001_control_plane_foundation.sql` establishes:

- Organizations
- Users
- Organization members
- Teams
- Team members
- Projects
- Project members
- Repository references
- Environment references
- Audit events

All resource tables carry organization/project ownership boundaries where applicable, unique organization-scoped slugs, timestamps, and foreign keys.

## 5. Authentication abstraction

Production APIs do not trust or depend on `auth-service`. The service exposes an identity-provider adapter boundary with demo and JWT adapter implementations. Demo mode is rejected when `NODE_ENV=production`. The JWT adapter intentionally remains a replaceable integration point for an approved OIDC/OAuth/JWT verifier and does not implement unsafe homemade token verification.

## 6. Authorization model

Organization membership is checked server-side for organization/project access. Project writes require owner/admin membership in the PostgreSQL adapter. Resource queries include organization predicates to prevent cross-tenant access. Frontend permissions are not trusted as a security boundary.

## 7. Multi-tenancy model

Organizations are the tenant boundary. Users receive organization memberships, and projects belong to organizations. Organization listing is membership-scoped. Project detail/list operations verify both membership and organization ownership. Cross-tenant project access returns a safe not-found/forbidden response instead of leaking resource existence.

## 8. API conventions

Implemented versioned endpoints:

- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/version`
- `GET /api/v1/organizations`
- `POST /api/v1/organizations`
- `GET /api/v1/organizations/:organizationId`
- `GET /api/v1/organizations/:organizationId/projects`
- `POST /api/v1/organizations/:organizationId/projects`
- `GET /api/v1/organizations/:organizationId/projects/:projectId`

Project list requests support bounded `page`, `pageSize`, `search`, and `status` query parameters. Responses use the standard pagination envelope. OpenAPI is provided in `services/control-plane-api/openapi.yaml`.

## 9. Error handling

Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "requestId": "..."
  }
}
```

Validation maps to 400, authentication to 401, authorization to 403, not found to 404, conflicts to 409, rate limiting to 429, dependency failures to 503, and unexpected failures to a generic 500 response. Stack traces, SQL errors, credentials, and secrets are not returned.

## 10. Observability

Every response includes `X-Request-ID`; incoming `X-Request-ID` is preserved when supplied. Audit events record actor, organization/project, action, resource, request ID, timestamp, and non-sensitive metadata. Structured startup/server/migration logs avoid request credentials and secret values.

## 11. Security

- Production rejects `AUTH_MODE=demo`.
- Production requires identity issuer/audience, `DATABASE_URL`, and explicit CORS origins.
- CORS does not use wildcard origins.
- Security headers include `X-Content-Type-Options`, `X-Frame-Options`, and no-store caching.
- SQL uses parameterized queries.
- Rate limiting is applied per remote address as a foundation; distributed production limiting remains infrastructure work.
- No password authentication, credential storage, provider OAuth integration, Kubernetes credentials, cloud keys, or secrets were added.
- The existing demo auth service was not modified or trusted.

## 12. OpenAPI

`services/control-plane-api/openapi.yaml` documents the versioned health, readiness, version, organization, and project endpoints, bearer security scheme, parameters, request schemas, and structured errors. It intentionally does not document nonexistent pipeline, deployment, Kubernetes, Terraform, search, notification, or execution APIs.

## 13. Migrations

Added deterministic transactional migration `001_control_plane_foundation.sql` and explicit `npm run migrate`. Application startup never runs migrations automatically. Migration contract checks verify all required tables and transaction markers without requiring a live database.

## 14. Testing

Added:

- Unit tests for versioned health, request IDs, structured errors, validation, pagination, organization/project flows, production demo-auth rejection, and tenant access behavior.
- HTTP integration test for versioned health and configured CORS.
- Migration contract test.
- Production configuration/security test.

## 15. CI integration

Added a dedicated `control-plane-foundation` CI job running npm install, lint, and `npm run test:all`. Added pinned Hadolint validation for the control-plane Dockerfile. Existing service detection automatically sees the new service manifest/package/Dockerfile.

## 16. Docker/Kubernetes integration

Added a pinned Node 20 Alpine multi-stage Dockerfile with a non-root runtime user, minimal production dependencies, healthcheck, migrations, and OpenAPI. Added `service.yml` with Kubernetes deployment type and `/api/v1/health` healthcheck. Kubernetes deployment requires the repository's existing environment, ingress, secret, and network policy configuration to be supplied safely.

## 17. Files created

- `services/control-plane-api/package.json`
- `services/control-plane-api/package-lock.json`
- `services/control-plane-api/.env.example`
- `services/control-plane-api/service.yml`
- `services/control-plane-api/Dockerfile`
- `services/control-plane-api/eslint.config.mjs`
- `services/control-plane-api/openapi.yaml`
- `services/control-plane-api/migrations/001_control_plane_foundation.sql`
- `services/control-plane-api/src/config.js`
- `services/control-plane-api/src/errors.js`
- `services/control-plane-api/src/server.js`
- `services/control-plane-api/src/auth/provider.js`
- `services/control-plane-api/src/database/pool.js`
- `services/control-plane-api/src/database/transaction.js`
- `services/control-plane-api/src/database/migrate.js`
- `services/control-plane-api/src/domain/repositories.js`
- `services/control-plane-api/src/domain/postgres-repository.js`
- `services/control-plane-api/src/validation/schemas.js`
- `services/control-plane-api/test/unit/server.test.js`
- `services/control-plane-api/test/integration/http.test.js`
- `services/control-plane-api/test/security/config.test.js`
- `services/control-plane-api/test/migration.test.js`
- `PHASE-11A-CONTROL-PLANE-REPORT.md`

## 18. Files modified

- `.github/workflows/ci.yml`

No existing frontend files or `services/auth-service` files were modified for Phase 11A.

## 19. Validation results

Executed from the correct repository/service directories:

- `npm install`: passed; generated lockfile. npm reported 3 dependency vulnerabilities in the test/toolchain dependency graph.
- `npm run lint`: passed.
- `npm test`: passed, 5 tests.
- `npm run test:integration`: passed, 1 test.
- `npm run test:migration`: passed.
- `npm run test:security`: passed, 1 test.
- `npm run test:all`: passed.
- `git diff --check`: passed.
- `docker build -t control-plane-api:phase11a services/control-plane-api`: passed.
- Container health validation in explicit test mode: `/api/v1/health` and `/api/v1/ready` passed.
- `bash ci/validate-service.sh control-plane-api`: not runnable in this Windows environment because `/bin/bash` is unavailable.

No live PostgreSQL migration/integration run was claimed because no database infrastructure was configured.

## 20. Known limitations

- JWT/OIDC signature verification is a replaceable adapter placeholder and requires a real approved identity-provider library/configuration.
- PostgreSQL migrations and queries were not executed against a live database in this environment.
- Domain CRUD is intentionally limited to organization/project foundation.
- No pipeline engine, workers, logs, artifacts, deployment execution, Docker registry operations, Kubernetes operations, Terraform execution, search, notifications, or AI features were implemented.
- Rate limiting is process-local and must move to a shared gateway/store for horizontally scaled deployments.
- Audit event persistence is implemented in the schema and memory foundation; full PostgreSQL audit write/read service integration remains follow-up work.
- Existing repository CI has unrelated historical workflow/infrastructure findings documented by prior audits.

## 21. Missing production infrastructure

- Production OIDC/OAuth/JWT identity provider and verifier configuration.
- PostgreSQL instance, TLS, credentials via secret manager, backup, pooling policy, and migration runner.
- API gateway/ingress with distributed rate limiting, TLS, and trusted tenant context.
- Distributed queue/workers and event bus for future execution domains.
- Object storage for future logs/artifacts.
- Central logging/metrics/tracing backend.
- Production CORS origin configuration.
- Kubernetes secrets, network policy allowances, resource profiles, and deployment environment values.

## 22. Next implementation phase

Phase 11A stops at the control-plane foundation. The recommended next phase is a separately planned API contract implementation for dashboard/projects against PostgreSQL and the production identity provider, followed by pipeline definition/run contracts. Phase 11B was not started automatically.
