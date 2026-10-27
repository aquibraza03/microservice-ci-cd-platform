# Authentication, organizations and RBAC

## Identity modes

The control-plane identity system is independent of the reference `services/auth-service` workload.

| Mode | Intended use | Behavior |
| --- | --- | --- |
| `demo` | Local development only | Fixed non-production identity; configuration rejects it in production |
| `test` | Dependency-injected unit tests only | Cannot be constructed outside `NODE_ENV=test` |
| `jwt` | Production-compatible API access | Verifies application JWT signature and registered claims against configured JWKS |
| `github` | GitHub OAuth login plus verified application JWT | Uses Authorization Code flow, state, PKCE S256 and a tracked revocable session |

JWT verification requires an exact issuer, audience, expiration, not-before time, allowed asymmetric algorithm and known `kid`. `JWT_JWKS` accepts multiple public keys so old and new signing keys can overlap during rotation. Authentication failures return safe 401 codes without cryptographic detail.

## GitHub OAuth setup

Create a GitHub OAuth App with the exact callback configured in `GITHUB_OAUTH_CALLBACK_URL`. Store the client secret and the private session-signing JWK in a managed secret service. Never place either in source control.

Required production values:

```text
NODE_ENV=production
AUTH_MODE=github
CONTROL_PLANE_STORAGE=postgres
DATABASE_URL=<managed PostgreSQL URL>
JWT_ISSUER=https://platform.example.com
JWT_AUDIENCE=microservice-platform-control-plane
JWT_ALGORITHMS=RS256
JWT_JWKS={"keys":[<public verification JWKs with unique kid values>]}
JWT_SIGNING_JWK=<private RS256 signing JWK matching an active public key>
SESSION_VALIDATION=required
GITHUB_OAUTH_CLIENT_ID=<OAuth App client ID>
GITHUB_OAUTH_CLIENT_SECRET=<managed secret>
GITHUB_OAUTH_CALLBACK_URL=https://platform.example.com/api/v1/auth/github/callback
CORS_ALLOWED_ORIGINS=https://app.example.com
```

Start login with `GET /api/v1/auth/github/login`. The callback validates the state cookie in constant time, consumes the state once, uses the PKCE verifier during code exchange, provisions the stable user, stores only a SHA-256 hash of the JWT ID and returns a short-lived Bearer token. `POST /api/v1/logout` revokes that tracked session. Production requires session validation, so a cryptographically valid but unknown/revoked session fails closed.

The state cookie is `HttpOnly`, `SameSite=Lax`, callback-path scoped, ten-minute limited and `Secure` in production. API mutations use Authorization Bearer tokens rather than ambient authentication cookies, so they are not susceptible to cookie-based CSRF. CORS remains an explicit allow-list.

## Organization model

A verified subject provisions one durable user. Creating an organization and its initial owner membership is one database transaction. A user may belong to multiple organizations and explicitly select a current organization, but the selection never grants access: each request rechecks active membership and permission. Tenant-owned lookup queries include `organization_id`, and cross-tenant resources return a safe denial or not-found response.

Duplicate memberships are prevented by the existing composite primary key. Membership role updates require the current `version`, providing optimistic concurrency protection.

## Permission matrix

| Permission | Owner | Admin | Developer | Operator | Viewer |
| --- | :---: | :---: | :---: | :---: | :---: |
| Organization administration | ✓ | ✓ |  |  |  |
| Repository management | ✓ | ✓ | ✓ |  |  |
| Environment management | ✓ | ✓ | ✓ |  |  |
| Deployment creation | ✓ | ✓ | ✓ | ✓ |  |
| Production deployment | ✓ | ✓ |  | ✓ |  |
| Rollback | ✓ | ✓ |  | ✓ |  |
| Secret management | ✓ | ✓ |  |  |  |
| Read-only observation | ✓ | ✓ | ✓ | ✓ | ✓ |

Permissions are defined only in `src/auth/rbac.js`. Resource repositories request permissions; they do not compare role strings themselves.

## PostgreSQL and migrations

Start local PostgreSQL using `docker/docker-compose.local-dependencies.yml`, then:

```bash
cd services/control-plane-api
npm ci
DATABASE_URL=postgres://platform_local:local_dev_pg_7f3c_change_me@localhost:55432/platform_control_plane npm run migrate
```

The ordered runner records filename and SHA-256 checksum in `schema_migrations`. It skips an already applied matching migration and fails if an applied file was modified. Migrations are additive. Never edit an applied migration; create a new numbered forward-fix. Production rollback means deploying compatible application code or applying a reviewed compensating forward migration—automatic destructive down migrations are not used.

## Test commands

```bash
npm test                         # unit tests
npm run test:http                # HTTP integration without external IdP
npm run test:postgres            # real PostgreSQL repository tests
npm run test:migration:contract  # static additive-migration contract
npm run test:migration:database  # empty-database and repeat-run test
npm run test:security            # JWT, OAuth state and logout tests
npm run test:ci                  # migrations and complete CI suite
```

The PostgreSQL commands use `DATABASE_URL`/`POSTGRES_ADMIN_URL` supplied by CI and do not use a developer database. GitHub Actions starts the pinned `postgres:16.4-alpine` service and waits for readiness.

For the complete local CI suite, create and use a disposable `control_plane_test` database; repository tests truncate their configured database:

```bash
docker compose --env-file ../../.env.local -f ../../docker/docker-compose.local-dependencies.yml exec postgres createdb -U platform_local control_plane_test
export DATABASE_URL=postgres://platform_local:local_dev_pg_7f3c_change_me@localhost:55432/control_plane_test
export POSTGRES_ADMIN_URL=postgres://platform_local:local_dev_pg_7f3c_change_me@localhost:55432/postgres
npm run test:ci
```

## Production considerations

- Keep OAuth, signing and database credentials in a managed secret provider and rotate them.
- Publish overlapping public keys during signing-key rotation and remove retired keys only after token expiry.
- Replace the in-process rate-limiter and OAuth state-store adapters with shared implementations before horizontally scaling the API.
- Terminate TLS at a trusted ingress; never expose PostgreSQL directly.
- Do not log Authorization headers, OAuth codes, access tokens, signing keys or session JWT IDs.
- Monitor failed logins, rate limits, membership/role audit events and revoked-session checks.
