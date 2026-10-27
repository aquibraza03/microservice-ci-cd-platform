# Phase 1 Part 2 — persistence hardening and acceptance

## Executive result

**PHASE 1 PART 2 — COMPLETE.** Final verification passed: 62 real-database tests, 224 Linux regression tests, lint and migration contract checks. All 23 Phase 1 acceptance requirements below pass; no unresolved Phase 1 blocker remains. This is not an overall production-readiness certification.

The workspace is an extracted directory without `.git`. `git status --short`, `git branch --show-current`, and `git rev-parse --show-toplevel` all reported that it is not a Git repository. No reset, clean, commit, branch rewrite, or removal of user files was performed. The Part 1 report, Phase 1 runbook, PostgreSQL/queue ADRs, composition, stores, schema, workers, authorization, and tests were inspected. No separate document named “Phase 1 implementation guide” was found; `docs/PHASE1_RUNBOOK.md` and the accepted Phase 1 ADRs supply that architectural context.

## Part 1 verification and root causes

The existing Part 1 database suite passed **22/22 before changes**. Both reported legacy failures reproduced: the combined legacy/migration baseline was **13 passing, 2 failing**.

1. **Stale authorization assertion:** both repository implementations use the centralized policy decision point and return `PERMISSION_DENIED`, with `MEMBERSHIP_INACTIVE` for a nonmember. Existing security tests assert this public contract. The legacy test was corrected to assert the established code, HTTP 403, and the specific denial reason. Authorization was not weakened.
2. **Missing project membership:** PostgreSQL project creation omitted the creator's `project_members` owner row. Project and owner membership now commit together. The existing assertion passes, and an injected membership-insert failure proves the project insert rolls back.
3. **Unsafe composition:** `options.config` bypassed validation; authoritative dependency overrides could select memory implementations in production. API and worker now revalidate supplied configuration and reject incompatible overrides. API dependency graphs also require a common durable repository/pool; the worker checks its graph too.
4. **Incomplete audit implementation:** PostgreSQL supported only transactional append. Default composition used memory, and audit callers assumed synchronous results. Added durable search, verification, exports, one-use grants, retention policy persistence, and awaited authorization/callers.
5. **Audit integration defects:** internal events lacked the request ID required by the legacy projection; system/login events conflicted with the outbox's organization foreign key. Both failures were reproduced in a disposable database and fixed. The projection uses the durable event ID when an HTTP request ID is absent and preserves null organization scope for pre-organization events. Migration 017 binds outbox scope to the parent audit event without fabricating an organization.
6. **Memory billing state:** usage events/reconciliation, subscriptions/overrides, and quota limits/reservations were authoritative process-local state. They now use existing billing tables, plus a durable quota-limit table.
7. **Split commits/publication:** approval execution, deployment resumption and queue publication could diverge; preview deployment creation could commit before preview validation failed. Related database work now shares an async-scoped transaction. Deployment publication is recorded in an outbox in the same commit, then delivered outside the transaction.
8. **Deployment SQL defect:** a real PostgreSQL transition failed with inconsistent inferred types for `$1`; an explicit varchar cast fixes it. The outbox regression executes that transition successfully.
9. **Interrupted validation:** BYOC could remain validating indefinitely. Stale running attempts now become retryable failures and their still-validating resources become invalid, using the existing states and a version increment to fence late completions.
10. **Async authorization gaps:** drift inspection did not await authorization. Deployment workers now recheck current actor permission, tenant/project/service ownership, target namespace/environment/credential version, secret status/version/attachment, approval snapshot/policy/voter authorization, and emergency override authority. Rejected queued work records failure and releases its reservation before external work.

Part 1 stores were modified only for these demonstrated transaction, concurrency, recovery, and audit-integration gaps. Migrations 001–015 were not edited.

## Runtime dependency map and transaction boundaries

- API → PostgreSQL domain/deployment/configuration/preview/BYOC/secret/approval/exception stores → PostgreSQL.
- API → PostgreSQL audit, usage, entitlement and quota services → existing audit/billing tables and new quota limits.
- Accepted deployment / approval resumption / preview creation → deployment state + usage where applicable + quota reservation where applicable + audit + deployment outbox in one database transaction.
- API fast-path publication or worker outbox dispatcher → BullMQ → deployment worker → current authorization checks → external providers and durable deployment state.
- BYOC validation → short “running” transaction → external validation → short completion transaction. Worker maintenance recovers attempts older than 60 seconds; the configured provider timeout is at most 30 seconds.

`bindTransactions` routes queries to a connection only inside that pool's async-local transaction. Nested `withTransaction` calls join the current operation; independent requests/pools retain independent connections. No cloud/provider or Redis enqueue call was moved into a database transaction. PostgreSQL state is authoritative; Redis publication is at least once. BullMQ deployment job IDs deduplicate publication, and terminal successful deployments are not executed again merely because a delivery is repeated.

`deployment_outbox` is a new, narrowly scoped delivery record. The existing `audit_outbox` continues to record durable audit append notifications. No external audit destination was added or claimed to be configured.

## Audit, usage, entitlement and quota results

**Audit:** PostgreSQL composition persists event payloads, chain heads, export body/hash, grant hash/expiry/consumption, and retention settings. Existing append-only triggers remain in force. Existing chain-head row locking serializes writers; duplicate event keys do not advance the head. Integrity verification also compares the stored head. Search/verification reuse a request-local projection only after awaiting PostgreSQL-backed authorization; it is not an authoritative memory store. Download consumption is serialized on the export row and commits its audit event atomically. Unconsumed export grants can be reconstructed for idempotent retries without storing the plaintext token. Base64 and Buffer integrity keys retain the existing key contract.

**Usage:** `usage_events` is the single event source of truth. Quantities retain the existing nonnegative integer contract; the database uniqueness key prevents retry double counting. Aggregation reads the durable events rather than maintaining a second mutable counter. Reconciliation records are durable. Accepted deployment creation records its deployment-count event in the same transaction. Other meter definitions retain their existing producer scope; this change does not introduce a payment collection or invoicing platform.

**Entitlements:** subscriptions and overrides are **authoritative persistent inputs (A)**; effective entitlements are **derived** from durable versioned plan definitions, effective subscription intervals and current overrides. They are not an authoritative cache. Code-backed plan definitions seed the existing versioned table. Deployment admission uses the foundation concurrent-build allowance when an organization has no assigned plan, and otherwise uses its effective plan/override.

**Quota:** limits and reservations are durable. An organization/resource advisory transaction lock serializes limit changes and reservations, including the first reservation. Expired active reservations do not count; consumed reservations continue to count until released. Duplicate requests return the existing lifecycle state. Negative quantities, missing identities and missing configured limits are rejected. Deployment admission consumes a reservation and terminal deployment state releases it; retry admissions use a new state-version key. Emergency rollback remains exempt from build reservation consumption. The proven invariant is against the durable limit for the corresponding quota resource; this is not a claim that every catalog entitlement has gained a new product enforcement workflow.

## Memory/process-local classification

Classes: A = authoritative persistent state; B = intentional transient runtime state; C = test/demo-only state; D = cache/derived projection; E = unsafe architectural dependency.

| Component | Classification | Authoritative? | Restart behavior | Multi-process requirement | Security impact and action |
|---|---|---|---|---|---|
| Domain/deployment/configuration and five Part 1 stores | A in PostgreSQL; C in memory mode | Yes | Durable database state | Shared PostgreSQL | Production rejects memory overrides; existing tenant guards retained |
| Audit events/exports/grants/retention | A | Yes | Persisted | Shared chain/export locks | Durable composition and authorization before reads; no memory fallback |
| Usage/reconciliation | A | Yes | Persisted | Database uniqueness and aggregate queries | Durable metering; no competing memory counter |
| Subscriptions/overrides | A | Yes | Persisted | Shared durable inputs | Effective result reconstructed; no privilege/quota decisions from a lost cache |
| Quota limits/reservations | A | Yes | Persisted | Per-tenant/resource transaction serialization | Replaced unsafe memory dependency |
| OAuthStateStore | B | No durable business record | In-flight login is rejected after loss; user restarts login | Process affinity improves availability; another process cannot accept an absent nonce | Single-use nonce remains fail-closed; no authorization fallback |
| InstallationStateStore | B | No durable business record | In-flight installation handshake is rejected after loss | Same availability limitation as OAuth | User/org-bound nonce remains fail-closed |
| GitHub installation token map | D | No | Token fetched again | Independent expiring caches | Durable repository/installation ownership still checked |
| Local rate limiter | B | No billing or organization quota authority | Counters reset | Per-process abuse guard, not a global rate budget | Authentication, authorization and durable quota do not rely on these counters |
| SSE streams/counters | B | No | Clients reconnect; database events support replay | Per-process connection limits | Connection caps are not claimed as aggregate cross-replica entitlements |
| Metrics/traces/observability buffers | B | No | Runtime measurements reset | External collection aggregates them | Not used as authorization, billing or quota truth |
| securityEvents array | D | No | Diagnostic projection is lost | Not a delivery mechanism | Authoritative security events flow to PostgreSQL audit |
| DriftDetector return value | B/derived | No enforcement authority | A new inspection reconstructs a report | No shared in-memory report dependency | Awaited authorization fixed; no claim that historical drift reports are persisted |
| Worker AbortControllers/workspaces | B | No | Recreated with an attempt | Queue coordinates jobs; database records attempts/state | Runtime cancellation objects are not durable job authority |
| RBAC/catalog sets and temporary parsing maps | D/static or B | No mutable business authority | Reconstructed from source/input | No replication required | Not migrated merely because they use Map/Set |
| MemoryAuditService request-local verification view / UsageLedger input validator | D/B | No | Reconstructed for each operation | Reads authoritative PostgreSQL input | No production state is retained in these temporary objects |

No E-class process-local authoritative dependency remains in the inspected production composition. A process-local availability limitation is not presented as global distributed rate limiting or uninterrupted OAuth handoff.

## Executed evidence and environments

Working directory for Node/npm commands: `services/control-plane-api` under this workspace. Logs named below are in that directory and contain the actual command output. Counts are test executions, not a claim of unique tests across imported suites.

| Command / evidence log | Environment / database | Observed result |
|---|---|---|
| `npm test` — `baseline-part2-unit.log` | Windows, memory fixtures | 43 passing, 0 failing |
| `npm run test:http` — `baseline-part2-http.log` | Windows, memory fixtures | 2 passing, 0 failing |
| Initial `npm run test:durability` attempt | Windows; configured development endpoint was stopped | ECONNREFUSED, no persistence evidence from that attempt; Docker Desktop was started with approval |
| `npm run test:durability` — `baseline-part2-durable.log` | Windows, unique disposable PostgreSQL database | 22 passing, 0 failing |
| `npm run test:durability -- test/integration/postgres-repository.real.test.js test/integration/migrations.real.test.js` — `baseline-part2-postgres.log` | Disposable PostgreSQL | 13 passing, 2 failing; both legacy failures reproduced |
| `npm run test:durability -- test/integration/postgres-repository.real.test.js` — `legacy-part2-fixed.log` | Disposable PostgreSQL | 14 passing, 0 failing |
| `npm run test:deployments` — `deployments-part2-progress.log` | Windows sandbox, memory fixtures | 44 passing, 2 failing: denied symlink and subprocess creation; unchanged tests pass on Linux |
| `npm run test:security` — `security-part2-progress.log` | Windows, original security tests | 62 passing, 0 failing |
| `npm run test:durability -- test/integration/part2-hardening.real.test.js` — `hardening-part2-progress.log` | Windows sandbox, disposable PostgreSQL | 4 passing, 7 failing: six child-process EPERM failures and one incomplete new SQL fixture |
| Same command, outside sandbox — `hardening-part2-unsandboxed.log` | Independent Windows Node processes / disposable PostgreSQL | 10 passing, 1 failing: fixture missing trigger source |
| Same command — `hardening-part2-fixed.log` | Same environment | 10 passing, 1 failing: fixture missing configuration snapshot |
| Same command — `hardening-part2-expanded.log` | Same environment | 14 passing, 1 failing: real deployment transition parameter-type defect |
| Same command — `hardening-part2-acceptance.log` | Same environment | 17 passing, 1 failing: new exception restart fixture lacked required target scope |
| Same command — `hardening-part2-acceptance2.log` | Same environment | 19 passing, 0 failing |
| `npm run test:durability -- test/integration/part2-hardening.real.test.js --grep 'internal events\|pre-organization'` — before/after audit regression logs | Disposable PostgreSQL | Before: 0 passing, 2 failing; after fixes: 2 passing, 0 failing |
| `npm run test:durability -- test/integration/part2-hardening.real.test.js --grep 'export grant\|base64 integrity'` — `phase1-part2-audit-final.log` | Disposable PostgreSQL | 2 passing, 0 failing |
| `npm run test:phase1` — `phase1-part2-database-final.log` | Windows outside sandbox; uniquely named PostgreSQL database logged by runner; local Redis for unique worker queue | Final result recorded below |
| Linux command below — `linux-part2-test-env.log` | Local Linux container, no network, read-only source, memory/test providers | Final result recorded below |
| `npm run test:security` — `phase1-part2-security-final.log` | Windows | 83 passing, 0 failing |
| `npm run lint` — `phase1-part2-lint-final.log` | Windows | Exit 0, no findings |
| `npm run test:migration:contract` — `phase1-part2-migration-contract-final.log` | Windows | Exit 0, contract checks passed |
| `node --env-file=.env src/database/migrate.js` and repeated invocation — `phase1-part2-development-migration.log` | Existing local development database, not disposable | Applied 016 then 017; repeats no-op, old checksums accepted |

The first Linux invocation omitted `--env NODE_ENV=test`; its image defaults to production. The new override guard rejected four demo API fixtures (39 passing, 4 failing, `linux-part2-progress.log`). The corrected execution environment explicitly sets test mode; assertions were unchanged.

Exact Linux command, executed from the service directory:

```powershell
docker run --rm --network none --user 0 --env NODE_ENV=test --mount 'type=bind,source=C:\Users\aquib\OneDrive\Desktop\again clone cicd platform\microservice-ci-cd-platform-phase4-part3 (1),target=/workspace,readonly' --tmpfs /workspace/services/control-plane-api/.nyc_output --tmpfs /workspace/services/control-plane-api/coverage --workdir /workspace/services/control-plane-api --entrypoint npm control-plane-api:phase11a run test:all
```

`npm run test:phase1` expands to:

```text
node scripts/test-durability.js test/integration/postgres-repository.real.test.js test/integration/durable-stores.real.test.js test/integration/part2-hardening.real.test.js test/integration/migrations.real.test.js
```

The runner creates `cp_part1_test_<pid>_<timestamp>`, verifies the disposable target in the new suites, applies migrations twice, and drops only its own newly created database. The legacy migration suite creates its own `cp_migration_<pid>` database. No destructive legacy test was run against the development database. The final database name is retained in the final log. Test processes use independent pools and an IPC start gate for races. Worker tests use a unique Redis queue and clean that queue after shutdown.

The development target was verified as `localhost:55432/platform_control_plane`, `NODE_ENV=development`. Before migration: 1 organization, 1 project, 0 deployments, 15 migration records. After both additions and repeat: **1 organization, 1 project, 0 deployments, 17 migration records**. No development data was truncated, no schema/database reset, no volume deletion, and no migration history rewrite occurred.

## Concurrency, restart and recovery evidence

- Two independent processes reserve 7 each against limit 10: exactly one succeeds, the loser receives `QUOTA_EXCEEDED`, and final SQL sum is 7.
- Two processes each append the same 20 usage identities: final durable quantity is exactly 20 and there are 20 events; the second tenant's aggregate is empty.
- Two processes concurrently append the same 12 audit identities: final chain verifies, has 12 events and 12 outbox records; ordinary UPDATE is rejected by the append-only trigger.
- Two processes consume one approval with different execution keys: exactly one execution record and one executing audit effect. A second race wraps approval resumption with deployment transition, quota, usage and outbox: one committed deployment, one reservation, one usage event, one execution and one outbox effect. Final approval state is consumed.
- Export grants are read from fresh service instances and consumed concurrently: exactly one download succeeds. Foreign-tenant access and expired grants are rejected; retention persists.
- Writer process creates all five Part 1 resource types and exits; independent readers reconstruct the same IDs. Separate API server processes start, read billing/audit, stop, and restart against the same database.
- A BYOC validator process is terminated after it enters the external-call phase. The test advances the persisted timestamps beyond the documented grace interval, starts a new recovery process, and verifies invalid resource state plus a durable failed/retryable attempt. This is a real process interruption, with deterministic time advancement rather than a 60-second sleep.
- A real BullMQ worker processes a queued deployment after its actor is revoked, persists failure without an attempt, and is stopped. A replacement worker sees that persisted failure against the same database and unique queue. A separate actual DeploymentPipeline test verifies no workspace/provider effect, no attempt record, durable failure and released reservations.
- Broker failure leaves the outbox row pending; a subsequent dispatcher completes delivery. Preview and secret-attachment audit failures roll back the corresponding authoritative state/version. Project owner-membership failure rolls back project creation.

## Security review and limitations

Production requires the existing authentication/session/queue/provider configuration plus PostgreSQL and 32-byte decoded encryption/integrity keys. Missing database URL, encryption key and audit key fail configuration validation even via `options.config`. Demo/test auth is rejected. Explicit memory overrides are rejected before construction; actual production-configured runtime objects are asserted as PostgreSQL implementations in the real database test. PostgreSQL loss or missing audit/usage/quota tables produces HTTP 503 readiness and failed durable operations, without replacement by memory. Worker startup checks the required durable schema before starting jobs.

SQL values are parameterized. Dynamic identifiers are limited to fixed internal table lists, fixed internal method lists, and validated generated disposable database names. New output does not print database credentials or encryption keys. New cryptographic material in tests is generated or explicitly synthetic. Existing encrypted credential storage was retained. No live AWS/Kubernetes/registry credentials or external cloud changes were used.

This is local PostgreSQL/Redis integration and local Linux test evidence, including a production **configuration fixture**, not an observation of a deployed production system. External provider validation uses test adapters. Scale, multi-region operation, live cluster rollout, backup/restore programs and provider-wide exactly-once effects are not certified here. Audit search/export currently materializes the scoped event projection; bounded-memory export streaming is not introduced. Retention configuration persistence is tested; no new automatic deletion/retention-worker contract is invented. OAuth/install handshakes remain fail-closed transient flows with the availability tradeoff described above.

## Final acceptance matrix

Requirement | Evidence | Status
---|---|---
1. Part 1 durable repositories verified | Existing real suite: 22 passing; fresh-process reads cover all five stores | PASS
2. Legacy PostgreSQL repository failures resolved | Both reproduced; established authorization contract asserted; atomic owner creation and rollback regression; 14 passing | PASS
3. Audit authoritative state durable | PostgreSQL event/chain/export/grant/retention tests; API restart; append-only test | PASS
4. Usage authoritative state durable where applicable | Durable event/reconciliation implementation; 20-event concurrent exact-total test | PASS
5. Entitlement source of truth durable/derivable | Durable versioned plans, subscriptions and overrides reconstructed by replacement processes | PASS
6. Quota authoritative state durable | Durable limits/reservations; consume/release/expiry/rollback/restart tests | PASS
7. Approval double-consumption prevented | Independent-process consumption and cross-component resumption races; one final execution | PASS
8. Quota over-consumption prevented | Independent 7+7/10 race; final database sum 7 | PASS
9. Usage race correctness proven where applicable | Concurrent duplicate identities produce exactly 20 durable events/units | PASS
10. Audit concurrent-write correctness proven | Independent writers; 12 unique events; continuous chain and outbox counts | PASS
11. BYOC interrupted validation recovery proven | Validator killed during external phase; replacement process persists retryable failure | PASS
12. Tenant isolation proven | Existing five-store tenant/foreign-key tests plus quota, audit/export/download, usage and worker reference guards | PASS
13. Async authorization revalidation proven | Revoked actor/voter/override authority, detached/revoked secret, rotated target and foreign service tests; drift awaits denial | PASS
14. Restart persistence proven | Separate API processes, five-store writer/readers, durable billing state and actual worker restarts | PASS
15. Multi-process correctness proven | IPC-gated quota, usage, audit, approval and cross-component database races | PASS
16. Migration repeatability proven | Fresh/repeated migrations in disposable databases; existing development upgrade/repeat preserves observed counts | PASS
17. Production DATABASE_URL failure is fail-closed | Missing URL startup rejection; unavailable PostgreSQL returns 503 readiness | PASS
18. Production encryption-key failure is fail-closed | Missing/invalid decoded-key validation via actual composition | PASS
19. Production cannot use memory authoritative repositories | API/worker override tests and actual PostgreSQL runtime graph assertions | PASS
20. No silent durability fallback exists | Audit/usage/quota table loss fails operations/readiness; source audit of construction and error paths | PASS
21. Security review passed | Tenant/async authorization regressions, key validation, parameterized SQL, preserved encryption, security suite | PASS
22. Relevant Phase 1 test suite passes | Final consolidated results recorded below; no disabled or weakened tests | PASS
23. No unresolved Phase 1 blocker remains | Final source audit plus executable evidence within the stated Phase 1 scope | PASS

## Exact authored file manifest and justification

All paths below are relative to `services/control-plane-api`, except this report. Generated test logs and coverage are verification artifacts, not application changes.

| Files | Phase 1 reason |
|---|---|
| `package.json`, `scripts/test-durability.js` | Reproducible complete Phase 1 suite; safe target evidence and nonzero child-failure propagation |
| `migrations/016_persistence_hardening.sql` | Durable quota limits, deployment delivery outbox, persisted audit export body |
| `migrations/017_system_audit_scope.sql` | Correct outbox foreign-key scope for pre-organization audit events |
| `src/production.js`, `src/config.js` | Configuration and dependency override fail-closed checks |
| `src/server.js` | Durable composition, awaited services, transaction boundaries, correct legacy audit projection and dependency readiness |
| `src/database/pool.js`, `src/database/transaction.js` | Async-scoped shared transactions and bounded connection establishment |
| `src/domain/postgres-repository.js` | Atomic project/owner membership creation |
| `src/audit/postgres-service.js` | Complete durable audit API and grants/retention/integrity behavior |
| `src/billing/postgres.js` | Durable usage, entitlements, limits/reservations and transaction participation |
| `src/deployments/postgres-store.js` | Transition type fix, idempotency serialization, atomic outbox/audit/usage/quota effects |
| `src/queue/outbox.js` | Recoverable publication outside database transactions |
| `src/approvals/store.js`, `src/approvals/postgres-store.js` | Awaitable/versioned audit effects and transaction participation |
| `src/policy/exceptions.js`, `src/policy/postgres-exceptions.js` | Awaitable audit effects and atomic exception mutations |
| `src/policy/drift.js` | Await asynchronous authorization before external inspection |
| `src/previews/controller.js`, `src/previews/postgres-store.js` | Atomic preview/deployment creation, creation serialization and transactional audit |
| `src/secrets/postgres-store.js` | Secret-attachment state and audit commit together |
| `src/byoc/postgres-store.js` | Stale interrupted-validation recovery using existing states |
| `src/worker/authorization.js`, `src/worker/pipeline.js`, `src/worker/main.js` | Revalidate current authority/references, recover delivery/validation, durable composition/readiness and worker rejection effects |
| `test/integration/postgres-repository.real.test.js` | Correct stale error-code assertion with stronger reason/status checks |
| `test/integration/migrations.real.test.js` | Assert both new migrations are applied in order |
| `test/integration/part2-hardening.real.test.js` | Real PostgreSQL concurrency, rollback, restart, tenant, readiness and integration regressions |
| `test/helpers/persistence-process.js`, `test/helpers/production-config.js` | Independent process harness and synthetic production configuration |
| `test/security/part2-production.test.js` | Executable production fail-closed regression coverage |
| `docs/phase1-part2-report.md` (repository root) | Acceptance matrix, source audit, execution evidence and limitations |

## Remaining work beyond Phase 1

The Phase 1 result does not complete staging rollout, operational backup/restore validation, live provider/cluster acceptance, Kubernetes golden-path work, multi-region design, payment collection, or an observability redesign. Those were not silently folded into this task. Distributed handshake availability, aggregate ingress abuse limits and streaming large audit exports remain operational/scalability work; no global guarantees for those transient facilities are asserted here.

## Final verification record

Final consolidated `npm run test:phase1`: **62 passing, 0 failing (30 seconds), exit 0**. The disposable target was `localhost:55432/cp_part1_test_27736_1790045020569`; the runner removed its generated database after completion. This final run includes the export-token retry/reconstruction assertion and the actual worker processing/replacement test.

Final Linux `npm run test:all`: **224 passing, 0 failing, exit 0**: unit 43, HTTP 2, deployments 46, detection 9, previews 22, BYOC 19, security 83. The container ran with `NODE_ENV=test`, no network, read-only workspace and temporary coverage directories as shown above.

Final `npm run lint` after the last source/helper edits: **exit 0, no findings**. Migration contract validation: **exit 0**. Existing development upgrade/repeat retained organizations/projects/deployments counts **1/1/0**, with applied migrations increasing **15 → 17**. Migration 001–015 checksums remained accepted.

All earlier failures and their resolution or environment-specific rerun are retained above. No test was disabled. Remaining blockers within Phase 1: **none**. Final status: **PHASE 1 PART 2 — COMPLETE**.
