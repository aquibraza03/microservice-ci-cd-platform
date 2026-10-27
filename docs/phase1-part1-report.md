# PHASE 1 — PART 1 REPORT

## 1. Status

**PARTIALLY COMPLETE — implementation delivered; full acceptance blocked by two existing PostgreSQL repository test failures.**

All five requested components now have PostgreSQL implementations, selected by `CONTROL_PLANE_STORAGE=postgres`. The new real-database suite passes, as does the complete `test:all` suite on Linux. The separate legacy PostgreSQL repository suite has two failures in unchanged repository behavior, detailed below. This is not overall Phase 1 completion.

Inspection covered the package scripts, all migrations 001–014, pool and transaction helper, memory stores, existing domain/deployment/configuration PostgreSQL stores, configuration, server, preview controller/reconciler, worker composition, and relevant tests. No existing PostgreSQL implementation of these five stores was found. Existing tables were reused.

## 2. Files Changed

The workspace is an extracted directory without `.git`; no Git diff/status or commit is available. The exact authored/modified paths are listed in the file manifest at the end of this report. Generated `*.log`, coverage, and `.nyc_output` artifacts are ignored by the existing `.gitignore`.

## 3. Component Matrix

| Component | Before | After | DB Table(s) | Tests | Status |
|---|---|---|---|---|---|
| Preview | Memory in every composition | PostgreSQL policies, instances, revisions, routes, domains, challenges, cleanup; async controller/reconciler | `preview_policies`, `preview_instances`, `preview_revisions`, `platform_routes`, `custom_domains`, `domain_verification_challenges`, `preview_cleanup_jobs` | Persistence, readiness, cleanup/recreation, domains, tenant isolation, validation, rollback, HTTP | Implemented; focused tests pass |
| BYOC | Memory connections, targets, credentials and attempts | PostgreSQL state, encrypted external IDs and credential versions, capability and validation records | `provider_connections`, `deployment_targets`, `credential_versions`, `connection_capabilities`, `connection_validation_attempts` | Encryption, rotation, rollback, validation failure, versions, uniqueness, tenant isolation | Implemented; focused tests pass |
| Secret references | Memory references and attachments; synchronous access to environment map | PostgreSQL reference metadata and attachments; empty attachment sets retain version on service | `secret_references`, `service_secret_references`, `services.secret_attachment_version` | Fresh-instance reads, masking, validation failure, rotate/revoke, attachment versions, preview protection, foreign ownership, HTTP | Implemented; focused tests pass |
| Approvals | Memory policies, requests, votes and execution keys | PostgreSQL policies, eligibility snapshots, decisions, lifecycle, override details and execution records | `approval_policies`, `approval_requests`, `approval_decisions`, `protected_action_executions` | Fresh-instance votes/execution, policy versions, invalidation, expiration, rejection, duplicate voters, tenant scope, HTTP | Implemented; focused tests pass |
| Policy exceptions | Memory items | PostgreSQL scoped exceptions, approvals, scheduled activation, expiration and revocation | `policy_exceptions` | Fresh-instance lifecycle, scope matching, tenant isolation, parent validation and foreign keys | Implemented; focused tests pass |

## 4. Database Changes

Added only `015_durable_component_state.sql`; migrations 001–014 were not edited. The migration was applied twice through the migration runner on disposable databases (second application is a checksum-verified no-op), then applied to the existing local development database. Local verification found 15 applied migration records, including 015. Existing migration checksums were accepted by the runner.

Required additions:

- Preview policy creator, branch and configuration snapshot; revision idempotency key and secret profile; deployment cleanup resource and cleanup reason.
- Partial unique indexes preserve one live preview/hostname while allowing a removed preview or domain to be recreated. Existing tables and historical rows remain.
- One challenge per domain; indexes for organization-scoped preview and route reads.
- AWS observed account and target successful-validation timestamp.
- Separate unique indexes for connection/target credential versions and capability records, closing the NULL behavior of the old composite uniqueness constraints.
- A service attachment version that survives detaching every secret; missing service/environment foreign keys.
- Approval eligibility snapshots, rejection reason and override metadata. Existing requests are populated from their current policy; historical policy eligibility that was never stored cannot be reconstructed.

No new tables or database frameworks were added. No development database, volume, migration history or unrelated container was deleted. The test runner creates a uniquely named `cp_part1_test_<pid>_<timestamp>` database and drops only that database. The legacy migration test separately creates and drops its own disposable database.

Local post-migration health and readiness both returned HTTP 200. The existing API process was not restarted; new composition was separately exercised by in-process HTTP tests. Migration changes are immediately present in PostgreSQL; an existing Node process loads the new application code on its next normal restart.

## 5. Tenant Isolation

All new stores await authorization before user-facing operations. Tenant-owned reads, updates and deletes include organization scope. Child reads join through scoped parents when the child table has no organization column (approval decisions and domain challenges). Related projects, services, repositories, environments, targets, connections and approval requests are checked before accepting references.

Tests use an actor who belongs to two organizations, so foreign-ID rejection cannot be attributed merely to lack of membership. Each component has cross-organization repository tests; HTTP tests cover scoped lists, preview/approval foreign IDs and foreign secret mutation. Separate tests verify that a nonmember is denied by all five stores.

Internal PostgreSQL preview cleanup/readiness methods and approval execution completion now require the organization argument. Server and controller/reconciler callers supply it. Reconciliation initiated by an organization API request only processes that organization; a future global scheduler must enumerate organizations explicitly.

## 6. Transaction Changes

Uses the existing `withTransaction` helper; no new locking framework or `SELECT FOR UPDATE` was introduced in these stores.

- Preview instance/revision/active pointer; readiness updates; domain/challenge creation and verification; activation/removal; cleanup scheduling/completion.
- BYOC target/credential creation, credential rotation/revocation, validation state/attempt changes, final capability records.
- Secret attachment version increment, old attachment deletion and replacement set insertion.
- Approval request state plus decision insertion; execution-key insertion plus executing state; completion of request plus execution record.

Updates with public versions use compare-and-set predicates. Provider validation uses two short transactions around the external call. A crash between them can leave a running validation attempt; interrupted-operation recovery belongs to Part 2. Tests force actual database constraint failures after earlier writes and verify rollback of preview creation and credential rotation.

Audit emission, deployment queue publication, quotas and cross-component coordination are not made atomic by this work.

## 7. Test Results

Commands below ran from:

`C:\Users\aquib\OneDrive\Desktop\again clone cicd platform\microservice-ci-cd-platform-phase4-part3 (1)\services\control-plane-api`

| Command | Actual result |
|---|---|
| Baseline `npm run test:all` on Windows | Unit 43 passed; HTTP 2 passed; deployment 45 passed / 1 failed because Windows denied creation of a symlink. The sandbox attempt also denied worker subprocesses; rerunning outside the sandbox removed those subprocess errors. |
| Baseline focused `npm run test:previews` | 22 passed |
| Baseline focused `npm run test:byoc` | 19 passed |
| Baseline focused `npm run test:security` | 62 passed |
| Baseline `npm run test:detection` | 8 passed / 1 failed: Windows symlink permission |
| Post-implementation `npm run test:previews`, `npm run test:byoc`, `npm run test:security` | 22, 19 and 62 passed respectively |
| `npm run test:durability` | **22 passed** against a newly created PostgreSQL database, including HTTP and authorization tests |
| `npm run test:durability -- test/integration/postgres-repository.real.test.js test/integration/migrations.real.test.js` | **13 passed / 2 failed**. Empty-database migration/repeatability test passed. Both failures are in legacy repository behavior below. |
| `npm run lint` | Passed, no findings |
| `npm run test:migration:contract` | Passed |
| `node --env-file=.env node_modules/mocha/bin/mocha.js test/integration/redis-queue.real.test.js --timeout 15000 --reporter spec` | 1 passed, using the existing Redis instance and a unique test queue |
| `node --env-file=.env src/database/migrate.js` | Applied 015 locally; existing checksums accepted |
| Complete `npm run test:all` in isolated Linux container, command below | **203 passing test executions**, zero failures: 43 unit + 2 HTTP + 46 deployment + 9 detection/configuration + 22 preview + 19 BYOC + 62 security. Some shared suites are imported more than once. |
| Build / typecheck | No build or typecheck scripts exist for this JavaScript service; none invented. Other service/frontend projects were not modified or built. |

Exact Linux command (uses the already available image, no network, read-only workspace and temporary coverage mounts):

```powershell
docker run --rm --network none --user 0 --mount 'type=bind,source=C:\Users\aquib\OneDrive\Desktop\again clone cicd platform\microservice-ci-cd-platform-phase4-part3 (1),target=/workspace,readonly' --tmpfs /workspace/services/control-plane-api/.nyc_output --tmpfs /workspace/services/control-plane-api/coverage --workdir /workspace/services/control-plane-api --entrypoint npm control-plane-api:phase11a run test:all
```

Local evidence logs: `baseline-part1.log`, `durability-part1.log`, `database-part1.log`, `linux-suite-part1.log`, `lint-part1.log`, `migration-contract-part1.log`, `migration-apply-part1.log`, `redis-part1.log` in the service directory. The first Linux launch failed because the temporary mount directory did not exist; creating the ignored mount directories and rerunning completed successfully. An initial isolated migration run caught an incorrect PostgreSQL-truncated constraint name; it was corrected before the migration was applied locally.

## 8. Remaining Memory Implementations

| Path / implementation | Environments and remaining behavior |
|---|---|
| Five `Memory*Store` implementations in preview/BYOC/secrets/approvals/policy | Retained for development/test/demo memory mode. Default PostgreSQL composition now selects the new stores. Explicit `options.*Store` overrides remain possible in any environment. |
| `MemoryRepository`, `MemoryDeploymentStore`, `MemoryConfigurationStore`, `MemoryDeploymentQueue` in `src/server.js` | Memory storage mode; normal production configuration requires PostgreSQL. Explicit dependency/config overrides remain possible and require Part 2 fail-closed review. |
| `MemoryAuditService` in `src/server.js` | Still the default in every environment, including production/PostgreSQL mode. Existing `PostgresAuditService` is not wired by this part. Audit chain, exports, download grants and retention configuration remain memory-backed. Compatibility audit projection does not replace durable enterprise audit. |
| `UsageLedger`, `EntitlementService`, `QuotaManager` in `src/server.js` | Default in every environment. Usage events, reconciliation, subscriptions/overrides, limits and reservations remain memory-backed. |
| `OAuthStateStore`, `InstallationStateStore` | Default in every environment where corresponding login/install flows are used; handshake state is process-local. |
| GitHub app token cache, local rate limiter, SSE streams/counters, observability state, `securityEvents` | Process-local runtime state in all environments. Some is intentionally transient; distributed limits and durable security-event/audit behavior still need review. |

`DriftDetector` returns a report but does not persist it to `deployment_drift_reports`; this is outside the five Part 1 stores. Its asynchronous authorization handling also needs review. The worker composition already uses PostgreSQL domain/deployment stores and BullMQ; it does not instantiate the five new stores independently.

## 9. Part 2 Required Work

1. Cross-component transactions/outbox coordination for approval consumption, deployment state, queue publication, preview creation and audit emission.
2. Concurrency/race tests for preview create/recreate/idempotency, domains, approvals, credential validation/rotation and secret attachment changes; decide retry/locking semantics where required.
3. Quota correctness and durable reservations, usage/billing, subscriptions and entitlement overrides.
4. Durable enterprise audit composition, chain concurrency, delivery/outbox, exports and retention.
5. Production fail-closed dependency/configuration composition and removal of unintended memory fallbacks/overrides.
6. Full API/worker restart testing across authoritative state, plus recovery of interrupted BYOC validation and other external operations.
7. Multi-process and multi-replica validation, including transient handshake/rate-limit state where necessary.
8. Final Phase 1 security review, including approval/resource authorization revalidation and unrelated drift/audit asynchronous callers.
9. Final Phase 1 acceptance after the outstanding legacy tests have been resolved.

## 10. Risks / Blockers

**Part 1 acceptance blockers (unrelated existing repository behavior; not changed):**

- `test/integration/postgres-repository.real.test.js`: nonmember access expects `ORGANIZATION_ACCESS_DENIED`; unchanged authorization returns `PERMISSION_DENIED`.
- The same suite expects `createProject` to create a `project_members` owner row. The unchanged `PostgresRepository.createProject` only inserts the project; the assertion reads an absent row.

These failures were observed in the legacy database suite after implementation. No claim is made that the legacy database suite passed before this work. Relevant memory/API baseline tests were run before code changes. Fixing the unrelated domain repository or changing its contract tests was not silently added to Part 1.

Other limits:

- Windows lacks the symlink privilege needed by two existing tests; both pass under Linux without changing or disabling them.
- PostgreSQL persistence tests use test providers for external AWS/Kubernetes/reference validation; no live cloud credentials or cloud mutation were used.
- Durable AWS/target credentials require the existing `CREDENTIAL_ENCRYPTION_KEY` configuration. The `.env` and encryption key were not changed.
- Raw database failures propagate to the existing generic HTTP 500 handling; they do not trigger memory fallback. New SQL values are parameterized; identifiers are static except the validated disposable database name in the test runner.
- The schema migration intentionally fails rather than deleting data if a different installation already contains duplicates/orphans that violate its added constraints. It succeeded against this local installation.
- Existing preview policies without a creator must be saved through the policy API before a webhook can act as their creator; 015 does not invent user attribution.
- Legacy approval eligibility cannot be reconstructed exactly when its historical policy changed before snapshot fields existed. Migration uses the current policy; historical-approval invalidation policy should be reviewed in Part 2 before production rollout.

Final source search confirmed one new PostgreSQL implementation per requested component, no direct caller access to their memory maps, organization-scoped SQL for tenant-owned operations, and unchanged applied migrations 001–014. No overall Phase 1 completion claim is made.

## Exact file manifest

- [services/control-plane-api/package.json](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/package.json>)
- [services/control-plane-api/migrations/015_durable_component_state.sql](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/migrations/015_durable_component_state.sql>)
- [services/control-plane-api/src/database/rows.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/database/rows.js>)
- [services/control-plane-api/src/previews/postgres-store.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/previews/postgres-store.js>)
- [services/control-plane-api/src/previews/store.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/previews/store.js>)
- [services/control-plane-api/src/previews/controller.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/previews/controller.js>)
- [services/control-plane-api/src/previews/reconciler.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/previews/reconciler.js>)
- [services/control-plane-api/src/byoc/postgres-store.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/byoc/postgres-store.js>)
- [services/control-plane-api/src/secrets/postgres-store.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/secrets/postgres-store.js>)
- [services/control-plane-api/src/approvals/postgres-store.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/approvals/postgres-store.js>)
- [services/control-plane-api/src/approvals/store.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/approvals/store.js>)
- [services/control-plane-api/src/policy/postgres-exceptions.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/policy/postgres-exceptions.js>)
- [services/control-plane-api/src/server.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/src/server.js>)
- [services/control-plane-api/scripts/test-durability.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/scripts/test-durability.js>)
- [services/control-plane-api/test/integration/durable-stores.real.test.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/test/integration/durable-stores.real.test.js>)
- [services/control-plane-api/test/integration/migrations.real.test.js](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/services/control-plane-api/test/integration/migrations.real.test.js>)
- [docs/phase1-part1-report.md](<C:/Users/aquib/OneDrive/Desktop/again clone cicd platform/microservice-ci-cd-platform-phase4-part3 (1)/docs/phase1-part1-report.md>)
