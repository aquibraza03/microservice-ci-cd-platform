# Phase 3 Part 2 handoff

## Outcome

Phase 3 Part 2 adds a centralized default-deny authorization decision point, nine fixed enterprise roles, scoped role assignments, transactional PostgreSQL owner safety, expiring one-time invitations, provider-neutral managed secret references, and an authorized dashboard/API surface.

The implementation is unit-tested and locally build-verified. AWS Secrets Manager and Kubernetes External Secrets are **beta reference integrations**. No live AWS secret, External Secrets Operator, PostgreSQL service, Redis service, or customer cluster was available. Managed-secret runtime persistence remains in-process, so the production completion gate is not fully met.

## Authorization architecture

`PolicyDecisionPoint.evaluate()` receives actor, action, resource, scope and context and returns:

- `decision`: `allow` or `deny`
- `allowed`
- `reasonCode`
- `matchedRole`
- `authorizationVersion`

Malformed, missing, inactive, cross-organization, stale-version and unmatched requests deny by default. Existing repository `requireAccess` calls now route through this policy decision point, so legacy controllers inherit backend enforcement. Public compatibility errors remain `PERMISSION_DENIED`; the internal decision preserves the precise reason and evaluated policy version.

The memory and PostgreSQL repositories re-read current membership on every authorization request. JWTs do not contain durable roles or permissions. Membership removal is therefore effective on the next backend request. Existing SSE streams recheck access periodically. The bounded permission-removal target is one subsequent API request or the stream recheck interval, whichever applies.

Custom roles are planned. No custom-role API or UI is exposed.

## Action and role matrix

Legend: `Y` allowed at an assigned scope, `—` denied.

| Action | Owner | Admin | Security Admin | Platform Engineer | Developer | Operator | Approver | Auditor | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Organization read | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Organization administration | Y | Y | — | — | — | — | — | — | — |
| Protected ownership | Y | — | — | — | — | — | — | — | — |
| Membership read | Y | Y | Y | — | — | — | — | Y | — |
| Invite/assign/remove member | Y | Y | — | — | — | — | — | — | — |
| Policy read | Y | Y | Y | — | — | — | — | Y | — |
| Security policy manage | Y | — | Y | — | — | — | — | — | — |
| Repository/project manage | Y | Y | — | Y | Y | — | — | — | — |
| Environment manage | Y | Y | — | Y | Y | — | — | — | — |
| Cloud connection read | Y | Y | Y | Y | — | — | — | Y | — |
| Cloud connection manage | Y | — | Y | — | — | — | — | — | — |
| Deployment target read | Y | Y | Y | Y | — | Y | — | Y | — |
| Deployment target manage | Y | — | — | Y | — | — | — | — | — |
| Deployment read | Y | Y | — | Y | Y | Y | Y | Y | Y |
| Non-protected deploy | Y | Y | — | Y | Y | Y | — | — | — |
| Production deploy | Y | Y | — | Y | — | Y | — | — | — |
| Rollback | Y | Y | — | Y | — | Y | — | — | — |
| Emergency rollback | Y | — | — | — | — | — | — | — | — |
| Approval decision | Y | — | — | — | — | — | Y | — | — |
| Secret metadata read | Y | Y | Y | Y | Y | Y | Y | Y | — |
| Secret reference manage | Y | — | Y | — | — | — | — | — | — |
| Attach secret reference | Y | Y | Y | Y | Y | — | — | — | — |
| Use secret at deployment | Y | — | Y | Y | — | Y | — | — | — |
| Domain read | Y | Y | Y | Y | Y | Y | — | Y | Y |
| Domain manage | Y | Y | — | Y | — | — | — | — | — |
| Audit read | Y | Y | Y | — | — | — | — | Y | — |
| General observation | Y | Y | Y | Y | Y | Y | Y | Y | Y |

Administrators cannot perform ownership, secret-management, cloud-credential, emergency rollback, or approval actions merely because they are administrators. Security administrators cannot administer organization ownership or ordinary deployments.

## Scope and inheritance rules

Supported scopes: organization, project, environment, cloud connection, deployment target, deployment, secret reference, domain and policy.

- Organization assignments inherit downward only when the policy context allows organization inheritance.
- Project assignments inherit only to that project's environment, deployment, secret reference and domain resources.
- Project roles never grant access to unrelated projects.
- Exact resource assignments match only their resource type and ID.
- Resource ownership is resolved from server-side records. A browser organization ID is never sufficient.
- Resource organization mismatch denies before role evaluation.

The current membership APIs create organization assignments. The decision engine and migration support narrower assignments, but management APIs for arbitrary project/resource assignments remain a Part 3 prerequisite.

## Membership and session safety

- Fixed server action and role registry; arbitrary permission strings cannot be assigned.
- Only owners can grant owner, admin or security-admin roles.
- Users cannot change their own role.
- The final active owner cannot be removed or demoted.
- PostgreSQL uses one transaction and `FOR UPDATE` locks across target membership and active-owner rows, preventing simultaneous owner removals from leaving zero owners.
- Membership versions provide optimistic concurrency.
- Every successful membership change increments `authorization_version`.
- Invitation tokens use 256-bit randomness, are stored only as SHA-256 hashes, expire after 24 hours, bind to organization and normalized email, and are single-use.
- Removed memberships fail on the next authorization request. No token refresh is required for removal to take effect.
- Service accounts remain outside this checkpoint and therefore cannot receive human roles.

## Secret-provider capability matrix

| Provider | Support | Capability | Verification |
| --- | --- | --- | --- |
| AWS Secrets Manager reference | beta | Validate ARN/account against an active AWS connection; render runtime ESO remote reference | Unit-tested with provider doubles |
| Kubernetes External Secret reference | beta | Validate safe key and detected ESO capability; render `ExternalSecret` | Unit-tested with target doubles |
| Azure Key Vault | planned | None | Not connectable |
| Google Secret Manager | planned | None | Not connectable |
| Build-time secrets | unsupported | None | No unsafe fallback |

## Secret lifecycle and delivery

Lifecycle: `draft -> active | invalid -> draft` on rotation, with terminal `revoked` and reversible operational `disabled` only through a new reference/configuration flow.

The safe data model includes organization, project, environment, provider connection or deployment target, masked display metadata, external identifier, optional provider version selector, injection key/destination, protection flag, validation category, reference version, optimistic version and lifecycle timestamps.

There is no secret plaintext field and no browser plaintext-read endpoint. API responses mask the external identifier. Audit metadata contains provider, environment, status and reference version only.

Deployment snapshots receive only reference ID, reference version, injection key, destination and provider type. Queue jobs retain only deployment and organization IDs. Rotation never changes historical snapshots. Disabled references, revoked connections, invalid versions, scope mismatch, previews/forks with protected secrets, and missing ESO capability fail closed.

Runtime delivery is designed to render an `ExternalSecret` so the cluster controller resolves plaintext. The control plane does not resolve or transport the value. Partial injection is rejected at reference validation. A live controller reconciliation was not available and is not claimed.

## Build-time versus runtime secrets

Runtime references are beta. Build secrets are unsupported. No Docker `ARG`, ordinary environment-variable, file-copy, queue-payload or cache-metadata fallback was implemented. A future implementation must use isolated BuildKit secret mounts with leakage and cache tests before support can change.

## APIs and dashboard

Added backend routes for current effective permissions, member listing/role changes/removal, invitation creation/acceptance, masked secret-reference create/list/validate/rotate/disable/revoke, and service-reference attachment. Existing cloud connection and deployment-target stores now use their explicit capability permissions.

The `/access-security` dashboard shows current effective permissions and role scope, members, invitation creation, role assignment/removal, secret-reference creation, masked identifiers, validation and revocation. UI state never substitutes for backend enforcement.

## Files and migrations changed

- `services/control-plane-api/src/auth/rbac.js`
- `services/control-plane-api/src/domain/repositories.js`
- `services/control-plane-api/src/domain/postgres-repository.js`
- `services/control-plane-api/src/secrets/providers.js`
- `services/control-plane-api/src/secrets/store.js`
- `services/control-plane-api/src/byoc/store.js`
- `services/control-plane-api/src/server.js`
- `services/control-plane-api/src/validation/schemas.js`
- `services/control-plane-api/migrations/011_enterprise_rbac_managed_secrets.sql`
- `services/control-plane-api/openapi.yaml`
- `services/control-plane-api/test/security/phase3-part2.test.js`
- `services/control-plane-api/test/unit/rbac.test.js`
- `services/control-plane-api/test/migration.test.js`
- `frontend/packages/types/src/control-plane.ts`
- `frontend/packages/services/src/services/control-plane.service.ts`
- `frontend/apps/web/src/app/(app)/access-security/page.tsx`
- `frontend/apps/web/src/components/security/access-security-view.tsx`
- `README.md`, `SECURITY.md`, `.env.example`, `services/control-plane-api/.env.example`
- `docs/PHASE3-PART2-AUTHORIZATION-SECRETS.md`

## Commands and test results

Entry baseline:

- Control plane `npm run test:all`, lint and migration contract: passed.
- Frontend `npm run verify`: passed with 94 tests and 23 pages.

Final local verification:

- Control plane `npm run test:all`: passed: 13 unit, 1 HTTP, 46 deployment/rollback/worker, 9 detection/configuration, 22 preview/domain, 19 BYOC and 40 security tests. Some suites intentionally share the eight deployment-state tests.
- Control plane lint and migration contract: passed.
- OpenAPI YAML parse and Node syntax checks: passed.
- Control-plane `npm audit --audit-level=high`: failed on four inherited development-tool dependency advisories (`mocha` dependency chain and `js-yaml`); the complete remediation offered by npm requires a breaking Mocha upgrade and was not applied inside this scoped security feature.
- Frontend `npm run verify`: passed with 94 tests and 24 pages, including `/access-security`; 47 non-blocking lint warnings remain, primarily the existing Fast Refresh rule.
- `auth-service`: lint passed, 58 tests passed.
- `platform-smoke-test`: lint passed, 8 tests passed.
- Real migration and PostgreSQL repository tests: blocked by `ECONNREFUSED 127.0.0.1:5432`.
- Real Redis/BullMQ test: blocked by unavailable Redis and timed out after 15 seconds; process was stopped after the test had already failed.

## Canary leakage results

Synthetic canary tests inspect in-memory reference storage, masked response-shaped metadata, deployment snapshot references, queue jobs and log-shaped collections. The canary and external secret identifier were absent from all prohibited outputs. ExternalSecret manifests contain provider reference identifiers by design but no resolved secret value. Repository scanning found synthetic values only in test fixtures/assertions.

## Verification classification

| Feature | Classification | Evidence/blocker |
| --- | --- | --- |
| Policy decision point and fixed roles | Unit-tested | Every role/action, default deny and decision version tested |
| Scope inheritance and tenant boundary | Unit-tested | Project/environment/resource and cross-organization cases tested |
| Membership safety | Unit-tested; structurally implemented for PostgreSQL | Self-escalation, grant restrictions, final-owner and replay tests pass; real PostgreSQL unavailable |
| Immediate permission removal | Unit-tested | Membership is re-read on every request; removed member denied immediately |
| Secret reference lifecycle/redaction | Unit-tested | Authorization, rotation, disabled/revoked, provider revocation and canary tests pass |
| ESO runtime manifest | Unit-tested | Manifest generation tested; no local/live ESO controller available |
| Dashboard | Locally build-verified | Type-check, unit suite and production build pass |
| AWS Secrets Manager live integration | Not verified | No live AWS role/secret supplied |
| Kubernetes External Secrets live integration | Not verified | No reachable ESO-enabled cluster supplied |
| Managed-secret PostgreSQL runtime store | Partially implemented | Schema exists; API composition still uses in-process store |
| Worker-side ESO apply | Partially implemented | Safe renderer and snapshot contract exist; worker resolver/apply wiring is incomplete |

## Known limitations

1. `MemorySecretReferenceStore` must be replaced with a transactional PostgreSQL implementation using migration 011.
2. Worker-side lookup by reference ID/version and ExternalSecret apply/reconciliation must be completed without putting provider identifiers or values in queue messages.
3. Arbitrary project/resource-scoped assignment management APIs are not exposed yet; current membership management creates organization assignments.
4. Real PostgreSQL concurrency, Redis, AWS and ESO-enabled Kubernetes verification remains blocked by unavailable infrastructure.
5. Invitation delivery is one-time-token issuance only; email delivery is not implemented.
6. Part 1's in-process BYOC store and worker target-client limitations still apply.
7. The control-plane development dependency tree has two high-severity npm advisories; dependency upgrades require a separately regression-tested maintenance change.

Because limitations 1–3 affect durability and end-to-end delivery, the Phase 3 Part 2 production completion gate is **not fully met**. The repository does not label structural or mocked behavior as live production verification.

## Exact prerequisites for Part 3

- Implement and migrate the PostgreSQL secret-reference and attachment repository with tenant-scoped transactional queries.
- Complete worker reference resolution and ESO apply/reconciliation by immutable reference version.
- Run owner-concurrency and invitation replay tests against PostgreSQL.
- Run a Kind cluster with External Secrets Operator and a non-production provider/emulator, then execute runtime delivery and rollback tests.
- Add scoped assignment management and service-account identities with an explicit human-only action deny list.
- Complete Part 1 PostgreSQL BYOC and customer-target worker composition prerequisites.
- Configure invitation delivery through an approved transactional email provider without logging tokens.
