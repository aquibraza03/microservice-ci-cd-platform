# Phase 3 Part 1 handoff

## Outcome

This checkpoint adds the provider-neutral BYOC foundation and keeps cloud-account connections separate from runtime deployment targets. AWS account access and customer Kubernetes targets are exposed as **beta**. Azure and GCP remain **planned** and cannot be connected.

The implementation is functionally and integration tested with deterministic provider doubles. It was not verified against a live AWS account, LocalStack, Kind, or an external customer cluster in this environment. It must not be represented as production-verified.

## Architecture implemented

- Capability-oriented `CloudAccountProvider` and `DeploymentTargetProvider` contracts; DNS, registry, and secret capabilities remain separate existing concerns.
- A backend-owned capability catalog drives API and dashboard availability. There are no connectable placeholder Azure/GCP integrations.
- AWS connection configuration uses a role ARN, expected account ID, platform principal, and unique external ID. Validation assumes the role through an injected STS adapter, obtains caller identity, and rejects account substitution.
- Customer Kubernetes targets store normalized endpoint and scope metadata. Service-account tokens are an explicitly temporary fallback encrypted with AES-256-GCM and an explicit 32-byte key. OIDC/workload identity is preferred.
- Kubernetes validation resolves the API host on every validation, rejects redirects by client contract, applies scheme/host/port/address rules, validates cluster identity, namespace existence, API version, and minimum namespaced permissions, and records Kyverno/External Secrets discovery as capabilities only.
- Deployment creation accepts a target only when its persisted state is active, its successful validation is fresh, and the requested environment and namespace are in scope. The immutable configuration snapshot records target ID, credential version, cluster fingerprint, and namespace.

The HTTP server accepts real provider adapters through dependency injection. This repository does not bundle platform AWS credentials or customer credentials.

## Schema changes

Migration `010_byoc_foundation.sql` adds:

- `provider_connections`
- `deployment_targets`
- `connection_capabilities`
- `connection_validation_attempts`
- `credential_versions`

All tables are organization-scoped. Constraints cover lifecycle values, provider/target types, idempotency, scope JSON shapes, external-ID hash uniqueness, and resource ownership. Credential payload columns are encrypted material only. The migration is additive and transactional.

Forward recovery is preferred: disable the affected record and create a new configuration/credential version. Revoked resources are terminal and cannot be reactivated.

Important persistence limitation: the migration is production-shaped, but this checkpoint's BYOC API repository is currently the in-process `MemoryByocStore`. PostgreSQL persistence for BYOC records and validation-job recovery remains required before production use. This limitation is why provider support is beta.

## Lifecycle

`draft -> validating -> active | invalid | degraded`

Active, degraded, invalid, or disabled resources may be revalidated where legal. Any non-revoked resource may be disabled or revoked according to the transition map. `revoked` is terminal. Sensitive updates use expected-version checks. Concurrent validation returns a conflict.

Disabled or revoked resources cannot validate or start deployments. Credential rotation creates a new version, revokes the prior version metadata, returns the target to draft, and never returns the token.

## Provider capability matrix

| Resource | Provider | Support | Connectable | Verified capabilities |
| --- | --- | --- | --- | --- |
| Cloud connection | AWS | beta | yes | Validate configuration, AssumeRole identity check, account match, permitted regions, disable/revoke |
| Deployment target | Kubernetes | beta | yes | Endpoint safety, cluster fingerprint, namespace scope, minimum permission review, version and optional-controller discovery |
| Cloud connection | Azure | planned | no | None |
| Cloud connection | GCP | planned | no | None |

No provider or capability is labelled production.

## Security decisions

- AWS permanent customer access keys are neither requested nor stored.
- External IDs are generated with 256 bits of randomness, omitted from ordinary API metadata/logs, and represented by a deterministic hash for database uniqueness.
- Trust policy generation pins the platform-controlled principal and exact external ID; wildcard principals are not generated.
- Actual STS account identity must equal the configured account ID.
- Kubernetes credentials use authenticated encryption. Production startup requires `CREDENTIAL_ENCRYPTION_KEY`; there is no production fallback.
- Raw kubeconfigs are not accepted or stored. Tokens are write-only and rotatable.
- Production Kubernetes endpoints require HTTPS. User-info, query strings, fragments, non-root paths, metadata/loopback/special addresses, and unsafe ports are rejected. Private targets require an explicit non-production policy in this checkpoint.
- Redirects are disabled at the Kubernetes client boundary; resolved addresses are supplied for connection pinning to limit DNS rebinding.
- Organization scope is derived from the authenticated route context and rechecked in the repository. Cross-tenant lookups return not found.
- Safe provider error categories reach the browser; provider credentials and SDK payloads do not.
- The bootstrap Role is namespace-scoped and grants no cluster-admin, Secret reads, cross-namespace access, or RBAC mutation.

## API and dashboard

Added authenticated organization-scoped endpoints for provider catalog, AWS connection creation/list/update/validate/disable/revoke, and Kubernetes target creation/list/validate/credential rotation/disable/revoke. Sensitive mutations use idempotency keys or expected versions and emit the existing safe audit events.

The `/cloud-connections` dashboard reads backend capability data, creates AWS trust policies, displays persisted validation status, creates scoped Kubernetes targets, shows capability/permission results, and supports validation, token rotation, disabling, and revocation. HTTP 200 alone is not presented as successful validation.

## Files changed

- `README.md`, `.env.example`, `services/control-plane-api/.env.example`
- `services/control-plane-api/migrations/010_byoc_foundation.sql`
- `services/control-plane-api/openapi.yaml`
- `services/control-plane-api/src/config.js`
- `services/control-plane-api/src/server.js`
- `services/control-plane-api/src/byoc/*`
- `services/control-plane-api/src/providers/contracts.js`
- `services/control-plane-api/src/providers/deployment-target.js`
- `services/control-plane-api/src/worker/pipeline.js`
- `services/control-plane-api/test/byoc/phase3-part1.test.js`
- `services/control-plane-api/test/migration.test.js`
- `services/control-plane-api/package.json`
- `deploy/k8s/byoc-target-bootstrap.yaml`
- `frontend/packages/types/src/control-plane.ts`
- `frontend/packages/services/src/services/control-plane.service.ts`
- `frontend/apps/web/src/app/(app)/cloud-connections/page.tsx`
- `frontend/apps/web/src/components/byoc/cloud-connections-view.tsx`

## Commands executed and results

Baseline before Phase 3 edits:

- Backend existing suites: 115 passing; migration contract and lint passed.
- Frontend: 94 tests in 14 files; formatting, lint, type-check, and production build passed.

Final verification:

- `npm run test:all` (control-plane): passed. Suites reported 13 unit, 1 HTTP, 46 deployment, 9 detection/configuration, 22 preview, 19 BYOC (includes 8 shared deployment tests), and 24 security tests.
- `npm run lint` (control-plane): passed.
- `npm run test:migration:contract`: passed.
- OpenAPI YAML parse and Node syntax checks: passed.
- `npm run verify` (frontend): passed; 94 tests and 23 generated pages. ESLint emitted 46 non-blocking warnings, mostly pre-existing Fast Refresh warnings.
- `npm audit --audit-level=high` (control-plane): failed with two high, one moderate, and one low development-tool dependency advisories involving `mocha`/`diff`/`serialize-javascript` and `js-yaml`. The suggested complete fix requires a breaking Mocha upgrade and was not forced into this scoped checkpoint.
- Real PostgreSQL/Redis/Kind tests were not rerun because those services were not available in the execution environment.

## Verification classification

| Feature | Classification | Evidence/blocker |
| --- | --- | --- |
| Provider contracts and support levels | Unit-tested | Contract and unsupported-provider tests pass |
| AWS identity validation | Unit-tested | STS adapter double covers account match/mismatch, timeout/error normalization paths; no AWS credentials supplied |
| AWS trust policy/external ID | Unit-tested | Uniqueness, redaction, exact principal/condition tests pass |
| Kubernetes target validation | Unit-tested | Deterministic client double covers identity, namespace, API version, permissions, optional capabilities |
| Credential encryption/rotation | Unit-tested | AES-GCM round-trip, tamper rejection, rotation/redaction tests pass |
| SSRF and redirect controls | Unit-tested | Scheme, port, private/special IP, DNS re-resolution, and redirect client-contract tests pass |
| API authorization and tenant isolation | Unit-tested/integration-tested in-process | Existing RBAC plus BYOC cross-tenant tests pass |
| Dashboard | Locally build-verified | Type-check, tests, and production build pass; browser E2E not run |
| PostgreSQL BYOC persistence | Partially implemented | Additive migration exists; runtime BYOC store is in-memory |
| AWS | Not verified against live infrastructure | No customer role/platform AWS identity supplied |
| Kubernetes | Not tested using a local cluster or live infrastructure | No reachable Kind/customer cluster supplied |
| End-to-end deployment through a customer target | Partially implemented | Target selection/snapshot/namespace rendering is wired; worker-side dynamic credential/client resolution is not complete |

## Known limitations

1. Replace `MemoryByocStore` with a transactional PostgreSQL implementation using migration 010, including abandoned-validation recovery.
2. Supply and verify a concrete AWS SDK STS adapter in the production composition root.
3. Resolve encrypted target credentials by credential version in the worker and construct a per-target Kubernetes client with pinned DNS addresses and redirects disabled. Current worker uses the existing configured Kubernetes provider.
4. Add background validation scheduling, rate-limit retry metrics, and persisted cancellation/timeout recovery.
5. Validate with LocalStack where meaningful, a real AWS role, Kind, and an external namespace-scoped cluster before raising support levels.
6. Upgrade affected development dependencies in a dedicated compatibility change.

Because items 1–3 are incomplete, the Phase 3 Part 1 production completion gate is **not fully met**. The foundation, contracts, API/UI, migration, security controls, and unit/in-process integration tests are delivered without overstating production readiness.

## Exact prerequisites for Part 2

- Complete and migrate the PostgreSQL BYOC repository; prove restart durability and concurrent transition behavior.
- Install/configure the production STS adapter and validate one real role using a non-secret test account ID kept outside documentation.
- Complete worker target-client resolution and pass a Kind golden path using the namespace-scoped bootstrap Role.
- Decide the enterprise permission names and ownership model while preserving organization-scoped authorization.
- Establish validation-job/credential-rotation operational metrics and alert thresholds.
- Resolve the development dependency advisories or formally accept them with expiry.

