# Checkpoint 2 verification report

**Observed:** 2026-09-13 UTC  
**Scope:** platform-user authentication, organizations, centralized RBAC, tenant isolation, additive PostgreSQL migrations and PostgreSQL CI. Git repository onboarding, build workers, registry publishing and Kubernetes deployment were not implemented.

## Implemented

- GitHub OAuth Authorization Code adapter with one-time state, constant-time state-cookie comparison and PKCE S256.
- Application JWT issuance and Bearer verification with asymmetric algorithm allow-listing, JWKS `kid` selection/rotation, issuer, audience, expiration and not-before validation.
- Separate demo, test, JWT and GitHub modes; production rejects demo/test, memory persistence, incomplete JWT/OAuth configuration, missing CORS and optional session validation.
- Stable verified-subject user provisioning and claim mapping for email, display name and avatar.
- SHA-256-hashed session identifiers, expiration checks and logout revocation.
- Users, organizations, owner creation, memberships, role assignment with optimistic versions, current-organization selection and audit events.
- Central roles/permissions module used by both memory and PostgreSQL repositories.
- Tenant membership/permission enforcement before all implemented organization, project, repository-reference and environment-reference operations.
- Ordered checksum-protected migration runner and additive migration 002.
- Pinned PostgreSQL 16.4 Alpine CI service, readiness wait and separated test commands.
- Updated OpenAPI contract and authentication/organization operations documentation.

## Database changes

Migration `002_identity_organizations_rbac.sql`:

- Converts legacy `member` roles to `viewer` before installing the role constraint.
- Adds optimistic `version` fields to users, organizations, memberships, projects, repository references and environment references.
- Adds `users.current_organization_id` with a foreign key using `ON DELETE SET NULL`.
- Adds the `user_sessions` table with user foreign key, unique hashed JWT ID, expiry and revocation timestamps.
- Adds membership, tenant-resource, active-session and audit indexes.
- Contains no drop, truncate or destructive column operation.

The migration runner applies numbered SQL files in order, records SHA-256 checksums, skips matching applied migrations and fails if an applied file changes. Applied migrations must never be edited; corrections use a new forward migration.

## Tests executed successfully

| Command | Result |
| --- | --- |
| Frontend `npm ci` | Pass |
| Frontend `npm audit --omit=dev` | Pass; 0 vulnerabilities |
| Frontend lint | Pass; 0 errors and 41 pre-existing warnings |
| Frontend typecheck | Pass |
| Frontend unit tests | Pass; 92 tests |
| Frontend production build | Pass |
| `auth-service` install, lint, `test:all`, production audit | Pass; audit 0 vulnerabilities |
| `platform-smoke-test` install, lint, `test:all`, production audit | Pass; audit 0 vulnerabilities |
| Control-plane `npm ci` | Pass |
| Control-plane lint | Pass |
| Control-plane unit suite | Pass; 13 tests |
| Control-plane HTTP integration | Pass; 1 test |
| Control-plane security suite | Pass; 18 tests |
| Migration contract | Pass |
| Control-plane production audit | Pass; 0 vulnerabilities |
| JavaScript syntax checks for server/auth/repository/tests | Pass |

Security tests cover missing authorization, malformed Bearer input, invalid signature, wrong issuer, wrong audience, expiry, future not-before, unknown key ID, valid tokens, key rotation, production-mode rejection, OAuth state/PKCE, end-to-end injected GitHub login, user provisioning, session tracking and logout invalidation. Unit tests cover all role boundaries, organization creation, membership enforcement, duplicates, optimistic conflict, current-organization checks, cross-tenant rejection and transaction rollback. Real PostgreSQL tests add cross-tenant cases for organizations, memberships, projects, repository references and environment references.

## Executed but not passed in this runtime

| Command | Observed result |
| --- | --- |
| `npm run test:postgres` | Failed before tests: `ECONNREFUSED 127.0.0.1:5432` |
| `npm run test:migration:database` | Failed in setup: `ECONNREFUSED 127.0.0.1:5432` |
| `npm run test:ci` | Failed immediately because `DATABASE_URL` was not supplied |

Docker, Compose and a PostgreSQL server are unavailable in this execution environment. Therefore the new migration and PostgreSQL repository suite were not claimed as locally passed. GitHub Actions was updated to provide its own clean PostgreSQL service, URLs and readiness check, but the hosted workflow was not executed here.

## Security decisions

- Bearer tokens are never logged and authentication errors omit validation details.
- Only configured asymmetric algorithms are accepted; `alg=none` and symmetric downgrade are excluded.
- JWKS keys require unique key IDs and production GitHub session signing must match an active public key.
- Production requires database-backed session validation; a valid but unknown or revoked `jti` fails closed.
- Only hashed JWT IDs are stored; audit events do not record tokens or JWT IDs.
- OAuth uses an HTTP-only, SameSite=Lax, callback-scoped, short-lived state cookie with Secure enabled in production.
- API mutations use Bearer authorization, not ambient session cookies; OAuth state protects its cookie-bound callback.
- Rate limiting is an injected interface. The process-local default is suitable only for one local instance.
- Current-organization selection is presentation state and never substitutes for membership authorization.

## External configuration and verification remaining

1. Register a GitHub OAuth App with an exact HTTPS callback URL.
2. Supply a managed GitHub client secret, private signing JWK and matching public JWKS.
3. Configure managed PostgreSQL, TLS, backups, least-privilege roles and secret storage.
4. Replace process-local OAuth state and rate-limit adapters before horizontally scaling.
5. Run `npm run test:ci` in the updated GitHub workflow or locally with Docker Compose.
6. Run the hosted GitHub Actions workflow to verify the PostgreSQL service image and all real-database tests.
7. No GitHub repository onboarding, build-worker, registry or Kubernetes deployment behavior exists from this checkpoint.

## Reproduce with local PostgreSQL

From the repository root:

```bash
cp .env.example .env.local
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml up -d --wait

cd services/control-plane-api
npm ci
docker compose --env-file ../../.env.local -f ../../docker/docker-compose.local-dependencies.yml exec postgres createdb -U platform_local control_plane_test
export DATABASE_URL=postgres://platform_local:local_dev_pg_7f3c_change_me@localhost:55432/control_plane_test
export POSTGRES_ADMIN_URL=postgres://platform_local:local_dev_pg_7f3c_change_me@localhost:55432/postgres
npm run test:ci
```
