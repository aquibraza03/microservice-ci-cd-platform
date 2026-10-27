# Phase 3 database qualification — 3 October 2026

Scope: the existing isolated PostgreSQL 16 environment identified by
`84e33cf6-352d-4d45-973f-598a747dc0f1`. This report supplements the older
enterprise Phase 3 report; it does not certify production readiness.

## Acceptance evidence

All 14 checks passed in
`artifacts/phase3/2026-10-03T07-01-22-845Z/acceptance-2026-10-03T12-47-26-603Z/final.json`.

Coverage includes the 17-migration chain, checksum/order rejection, no-op rerun,
atomic DDL/history rollback, independent migration writers, approval races,
quota/usage contention at 2/5/10 writers, usage deduplication, repository races,
tenant isolation, transaction rollback, PostgreSQL restart recovery, deadlock
recovery with explicit idempotent retry, and selective query plans/index validity.

## Corrections in this continuation

Regression validation also passed: lint, migration contract, 43 unit tests,
98 security tests, and 60 real PostgreSQL integration tests. Evidence:
`artifacts/phase3/2026-10-03T07-01-22-845Z/regressions-2026-10-03T12-49-40-685Z/`.
The earlier regression timeouts did not recur with the existing timeout limits.

- Moved migration cleanup-error propagation outside `finally`, resolving
  `no-unsafe-finally` while retaining the original migration failure when present.
- Restart comparison excludes only the audit response's generated `verifiedAt`
  timestamp; durable values and audit integrity results remain compared.
- Query-plan fixture supplies the required organization `display_name`.
- Started the existing owned PostgreSQL container with its previously pinned
  loopback port. The successful restart test retained that port and volume.

Earlier failed runs remain in the evidence directory. Test timeouts were not raised.

## Protected-resource comparison

The comparison with the original 07:01 UTC snapshot failed. Four unrelated local
containers have changed lifecycle metadata, with finish timestamps around 12:34:13
UTC (18:04:13 IST); Docker's default bridge identity also changed. The four
containers were running at comparison time. This continuation did not restart or
modify those resources. The timestamps are consistent with an intervening Docker
restart, but the cause is not proven by this evidence.

See `protected-before.json`, `protected-after.json`, and
`protected-comparison.json` in the evidence directory. Historical preservation
cannot be certified, and the failed comparison has not been relabeled as passing.

## Limits

PostgreSQL restart on the same volume is not backup restoration or disaster
recovery. Query plans are not a capacity benchmark; audit reads still load the
scoped chain before in-memory processing. Live Redis-dependent composition tests
are excluded by the existing regression runner. AWS, Kubernetes admission,
registry, DNS/TLS, and production release approval remain outside this run.

This workspace has no Git metadata, so a branch/commit diff is unavailable.
