# Data recovery and audit integrity
## Purpose
Handle backup failure, database restore, disaster recovery, or audit-integrity failure.
## Symptoms
Backup/restore alert, missing recovery point, corruption, or broken hash chain.
## User impact
Recovery objectives or audit evidence may be at risk.
## Required access
Data Platform plus Security for keys/audit; two-person control recommended.
## Diagnostic queries
Inspect signed backup manifest, age, checksum, schema version, audit checkpoint, and critical row counts.
## Safe mitigation
Stop destructive writes when integrity is uncertain, preserve media, select last verified encrypted backup and isolated target.
## Recovery steps
Follow `DISASTER_RECOVERY_RUNBOOK.md`; restore in dependency order; rebuild usage aggregates; reconcile ledger/reservations; verify audit chain and tenant boundaries.
## Escalation criteria
SEV-1 for loss/cross-tenant exposure or audit tampering; otherwise SEV-2 when RPO/RTO is threatened.
## Recovery verification
Application smoke/auth, row relationships, decryption canary, usage reconciliation, audit integrity, measured RPO/RTO.
## Evidence preservation
Preserve manifests, checksums, key versions, commands, timestamps, and verification report.
## Follow-up
Clean-room rehearsal and corrective action.
## Owner
Data Platform/Security.
## Last reviewed
2026-09-20.

