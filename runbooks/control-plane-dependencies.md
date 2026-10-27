# Control-plane dependency incidents
## Purpose
Recover queue, worker, PostgreSQL, or Redis incidents.
## Symptoms
Backlog, old jobs, unavailable workers, pool exhaustion, DB errors, Redis timeout, or dead-letter growth.
## User impact
Requests may be delayed; authoritative PostgreSQL state remains primary.
## Required access
Platform SRE and data-platform operator.
## Diagnostic queries
Inspect depth/age, leases, retries, DLQ, database pool/query latency, Redis latency, and state versions.
## Safe mitigation
Stop producers if saturation risks data integrity, restore dependency, scale within tested limits; never purge queues blindly.
## Recovery steps
Recover service, reclaim stale leases, replay idempotently, reconcile durable records, release orphan quota reservations.
## Escalation criteria
SEV-1 for durable-data risk; SEV-2 for platform-wide processing block.
## Recovery verification
Backlog drains, no illegal transitions/duplicates, reservations reconcile, alerts resolve.
## Evidence preservation
Preserve snapshots, job IDs, DB/Redis metrics, and sanitized logs.
## Follow-up
Capacity and failure-mode review.
## Owner
Platform SRE/Data Platform.
## Last reviewed
2026-09-20.

