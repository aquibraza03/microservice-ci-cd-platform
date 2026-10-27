# Billing operations

## Purpose
Respond to metering failure, billing discrepancy, leaked reservation, quota override, or period-close failure without rewriting usage history.
## Symptoms
Ingestion stalled/lag alerts, reconciliation mismatch, active reservation without an operation, unexpected quota denial, or close failure.
## User impact
Usage views may be stale, estimates disputed, or new chargeable work denied; cleanup and approved rollback remain available.
## Required access
FinOps read; platform operator for replay; Security Admin plus reason for override. Auditor is read-only.
## Diagnostic queries
Compare durable source records to `usage_events`; group uniqueness keys; inspect `usage_reconciliations`; join active `quota_reservations` to active jobs. Never query secrets.
## Safe mitigation
Pause period close, stop the affected consumer, preserve raw rows, replay with the original idempotency key, and release only ownership-verified orphan reservations.
## Recovery steps
Restart bounded consumers; rebuild aggregates from raw events; append linked adjustments for approved differences; reconcile reservations; rerun period close exactly once.
## Escalation criteria
SEV-2 for multi-tenant denial or material unexplained mismatch; SEV-1 for cross-tenant exposure or unauthorized adjustment.
## Recovery verification
Lag under five minutes, no unexplained mismatch, stable duplicate rate, no reservation leak, exempt cleanup/rollback succeeds, and audit events exist.
## Evidence preservation
Preserve query hashes, event IDs, reconciliation IDs, trace/correlation IDs, alert timeline, actor, and adjustment approval; never export secrets.
## Follow-up
Correct source instrumentation, add regression coverage, review meter versioning, and document customer-visible correction.
## Owner
FinOps Platform with Platform SRE.
## Last reviewed
2026-09-20.

