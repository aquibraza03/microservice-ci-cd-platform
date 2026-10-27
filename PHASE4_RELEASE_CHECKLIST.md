# Phase 4 release checklist

Status: **not production-ready** as of 2026-09-20.

- [x] Versioned, measurable meter catalogue exists.
- [x] Raw usage ledger is append oriented and idempotent.
- [x] Adjustments do not rewrite history.
- [x] Aggregates rebuild and reconciliation exposes differences.
- [x] Concurrent reservation behavior is unit-tested.
- [x] Cleanup, revocation, remediation, rollback, and recovery bypass quota denial.
- [x] Exact minor-unit arithmetic is tested.
- [x] Billing metrics and alerts are defined without tenant labels.
- [x] Required operational topics are indexed in `runbooks/`.
- [ ] PostgreSQL migration executed against a real database in this environment.
- [ ] Multi-process reservation contention verified against PostgreSQL row locks.
- [ ] Clean-room restore executed successfully.
- [ ] Restored ledger reconciliation and audit-chain verification executed.
- [ ] Final local Kubernetes scenario executed.
- [ ] Live paging, payment collection, tax, and invoicing (out of scope).

Release remains blocked until every unchecked security/recovery gate applicable to production has evidence.

