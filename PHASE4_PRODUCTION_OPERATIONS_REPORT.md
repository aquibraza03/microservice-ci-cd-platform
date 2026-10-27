# Phase 4 production operations report

## 1. Executive summary

Phase 4 Part 3 adds a provider-neutral, append-oriented usage ledger; versioned meters, plans and entitlements; exact price-estimation primitives; concurrency-safe reference quota reservations; billing telemetry and alerts; authenticated billing-read APIs; and a dashboard view. The local test/build gates pass. **Phase 4 is not production-ready** because clean-room restore, restored-ledger reconciliation, real PostgreSQL contention, and local Kubernetes acceptance could not be executed in this environment.

## 2. Baseline

The entry gate found prior suites healthy. The requested `test:migrations` command does not exist; the repository's actual command is `test:migration`. Its contract stage passes; its live database stage fails with `ECONNREFUSED 127.0.0.1:5432`, confirming no local PostgreSQL. Frontend lint retained its pre-existing Fast Refresh and two hook-dependency warnings. Auth audit retains one high `js-yaml` finding; frontend audit retains one high `js-yaml` and three moderate Vitest-chain findings. Control-plane and smoke audits are clean. Phase 4 Part 2 already recorded that Docker, a PostgreSQL server, `pg_dump`, and `pg_restore` were unavailable, so clean-room restore had not succeeded.

## 3. Final architecture

Measurement producers append versioned events using stable idempotency keys. Raw events remain independent from rebuildable aggregates. Reconciliation compares durable sources to ledger totals and surfaces differences. Entitlements are computed from versioned plans plus time-bounded overrides. Quotas reserve scarce capacity before starting work, then consume/release/expire/reconcile reservations. Price estimates consume reconciled quantities using integer minor units. Payment collection is absent.

## 4. SLO results

Phase 4 Part 1 SLO targets remain provisional without production traffic. This part adds metering lag, reconciliation, and reservation-leak operational signals; it does not redefine journey SLOs.

## 5. Observability architecture

Prometheus-compatible application metrics remain low-cardinality. No organization, user, project, deployment, request, trace, repository, commit, path, or raw message is a metric label. Billing APIs inherit existing request IDs, W3C tracing, structured logs, and telemetry fail-open behavior.

## 6. Alert catalogue

Added: MeteringPipelineStalled, UsageProcessingLagHigh, UsageReconciliationMismatch, QuotaReservationLeak, UsageDuplicateRateAbnormal, and BillingPeriodCloseFailure. Routes are test-only (`pager-test`/`ticket-test`); no real paging destination was configured.

## 7. Capacity results

Inherited measured evidence is limited to the Phase 4 Part 2 local in-memory health test: 5 requests/second for 10 seconds, 50 requests, zero errors/timeouts, p50 2.67 ms, p95 4.02 ms, p99 14.79 ms. This is not billing capacity evidence.

## 8. Stable tested limits

No production billing throughput limit was measured. Unit tests establish one final concurrent-build slot admits one contender in a single Node process. PostgreSQL multi-process contention remains unverified; no capacity claim is made beyond that evidence.

## 9. Failure results

Local tests cover duplicate delivery, retry, late/out-of-order events, invalid future time, duplicate release, reservation expiry, crash reconciliation, and protected-operation quota exemptions. Provider and infrastructure failures retain their prior mocked/local classification.

## 10. Backup and restore evidence

Backup contract tests cover encryption, completeness and interrupted-upload behavior. No isolated PostgreSQL restoration occurred in this environment. Consequently restored tenant boundaries, ledger reconciliation, and audit integrity are not verified.

## 11. Target and measured RPO/RTO

Targets remain those documented in `PHASE4_PART2_HANDOFF.md` and `DISASTER_RECOVERY_RUNBOOK.md`. Measured clean-room RPO/RTO: **not available**, because restore did not run. This is a release blocker.

## 12. Meter catalogue

Implemented accurately measurable v1 meters: build execution seconds, active preview seconds, accepted deployment count, active human seat-days, verified active custom-domain days, and active validated deployment-target days. Bandwidth, artifact storage, and log bytes are unsupported until authoritative byte sources exist. Full rules are in `BILLING_AND_QUOTAS.md` and `src/billing/catalog.js`.

## 13. Usage-ledger architecture

The ledger uses trusted timestamps, integer quantities, schema/meter versions, source identity, window, received time, status, and an organization-scoped uniqueness key. Delivery is described as effectively once—not exactly once. Late events are retained. Corrections append linked adjustments; historical events are never rewritten.

## 14. Reconciliation results

The reproducible local scenario recorded one event, replayed it without duplication, rebuilt the aggregate, and matched expected quantity 1 to recorded quantity 1. A unit test also verifies mismatch difference remains visible. PostgreSQL and restored-ledger reconciliation are not verified.

## 15. Plan and entitlement matrix

`foundation/v1`: 5 seats, 1 concurrent build, 2 previews, 2 domains, 1 target, 7-day logs. `team/v1`: 25 seats, 5 builds, 10 previews, 20 domains, 5 targets, 30-day logs. These are technical fixtures, not market offers. Support labels are provisional. Overrides are separate, reasoned, and expiring.

## 16. Quota behavior

New chargeable work is denied with `QUOTA_EXCEEDED`. Reservations are idempotent, expiring, releasable, and reconcilable. Cleanup, credential revocation, security remediation, required deletion, approved rollback, and incident recovery bypass quota denial. Existing production work is not terminated and customer data is not automatically deleted.

## 17. Runbook catalogue

`runbooks/README.md` maps API/auth, release, control-plane dependencies, providers, recovery/audit, billing, security, customer cluster, and status communication. Each new consolidated runbook includes purpose, symptoms, impact, access, queries, mitigation, recovery, escalation, verification, evidence, follow-up, owner, and review date. Existing specialized runbooks remain available.

## 18. Files and migrations changed

- `migrations/014_usage_billing_quotas.sql`
- `src/billing/{catalog,ledger,money,plans,quotas}.js`
- centralized RBAC additions, server billing composition/routes, and metrics catalogue
- `test/unit/billing.test.js`, migration contract, final verification script
- frontend control-plane client and `/usage-billing` page
- alert rules, billing documentation, release checklist, report, and runbooks

Migration is additive and transactional. Forward recovery is preferred: fix schema/constraints with a later migration. No credential or payment material is logged.

## 19. Commands executed

- `npm run lint && npm run test:all && npm run test:migration:contract && npm run verify:phase3`
- `npm run verify` (frontend; formatted new files then reran)
- `npm run lint && npm test` (auth)
- `npm run lint && npm test` (smoke)
- `npm run verify:phase4`

## 20. Test and build results

Control-plane full regression, lint, migration contract and Phase 3 verification pass. The live migration test is blocked by absent PostgreSQL. Control-plane unit count increased from 29 to 43 with 14 billing tests. Existing deployment (46), detection/configuration, preview (22), BYOC and security suites pass. Frontend format, lint, type-check, tests and production build pass; 26 routes render, with pre-existing warnings. Auth 58 and smoke 8 tests pass. Dependency audit results are recorded in the baseline section.

## 21. Final end-to-end evidence

`PHASE4_VERIFICATION.json` is synthetic-only, local-process evidence. It verifies two organizations on different plans, unique usage, replay deduplication, reconciliation, hard denial, cleanup/rollback exemption, crash reservation recovery, tenant isolation and safe administrative audit emission. Kubernetes deployment, alert delivery, backup creation/restore, restored reconciliation and live providers were not executed.

## 22. Verification classification

| Capability | Classification |
|---|---|
| Meter definitions, ledger, corrections, exact arithmetic | Unit-tested |
| Idempotency, reconciliation, quota behavior | Unit-tested/local process |
| Billing API authorization path and dashboard build | Integration-tested by existing app suite/build; billing HTTP-specific test not added |
| Migration | Contract-tested; real PostgreSQL not verified |
| Alerts | Parsed by inherited alert tests; synthetic firing not rerun separately |
| Kubernetes golden path | Not verified this run |
| Clean-room restore and restored ledger | Not verified |
| Live cloud/paging/payment | Not verified/out of scope |

## 23. Known limitations

The in-memory services support local composition only; production must use the migration-backed repository with row locks. Aggregation/period-close workers and durable DLQ are schema/contract foundations, not deployed schedulers. No invoice preparation UI, billing export workflow, payment, tax, or card handling exists. The billing page reports processed, unreconciled data honestly.

## 24. Remaining production risks

Critical: clean-room restore and restored audit/ledger validation absent. High: PostgreSQL multi-writer reservation contention and period-close recovery unverified. High: billing endpoint-specific tenant HTTP tests and production scheduler absent. Medium: dependency audit findings and frontend warnings inherited. Phase 4 must not be marked production-ready.

## 25. Live-staging checklist

1. Provision isolated PostgreSQL, Redis, registry, and disposable Kubernetes; configure no customer credentials.
2. Apply all migrations and verify constraints/indexes.
3. Run multi-process final-slot contention and kill workers during reservations.
4. Generate build/preview/domain/seat/target usage; replay source events.
5. Rebuild aggregates, reconcile, close a period, append a correction, and verify audit chain.
6. Fire each billing alert into an authorized test receiver and follow its runbook.
7. Create encrypted backup, restore into an isolated environment, measure RPO/RTO, verify tenant isolation, rebuild/reconcile ledger, and verify audit chain.
8. Exercise warning/hard limits; prove cleanup, revocation, remediation, rollback and recovery remain available.
9. Record versions, hashes, resource allocation, evidence IDs and sanitized outputs.

## 26. Recommended Phase 5 roadmap

Build a PostgreSQL usage repository and transactionally coupled outbox consumer; schedule reconciliation/period close; add protected billing exports and invoice-preparation records; validate multi-writer quotas; complete clean-room restore; establish staging capacity; resolve dependency findings; and only then evaluate a separately approved payment/tax provider integration.
