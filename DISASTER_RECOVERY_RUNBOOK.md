# Disaster recovery runbook

## Scope and truthfulness

This runbook separates availability, backup, restore, failover, disaster recovery and reconstruction. The repository provides encrypted PostgreSQL backup and isolated restore-verification tooling, but no automatic or multi-region failover. Redis, Kubernetes, registry, DNS and keys are not covered by a database backup.

Target objectives are provisional: PostgreSQL RPO ≤24 hours without PITR or ≤15 minutes with verified WAL archiving; RTO ≤4 hours. Redis/queue RPO is zero only for work reconstructable from PostgreSQL; worker RTO is 30 minutes. Audit/key loss may have no recoverable RPO without external key custody.

## Critical-data inventory

| Component | Source of truth / protection | Reconstructable | Loss impact | Target RPO/RTO | Restore order and verification |
| --- | --- | --- | --- | --- | --- |
| PostgreSQL, org/RBAC, configuration, deployment, provider metadata, secret references, approvals/policies | PostgreSQL encrypted base backup + verified WAL/PITR | No | Control-plane and authorization loss | 15m/4h with PITR | Keys/config → DB → migrations → tenant/relationship tests |
| Encrypted credentials | PostgreSQL ciphertext plus independently escrowed encryption key | No without key | Targets unusable | 15m/4h | Restore key version under dual control; decrypt synthetic canary only |
| Audit events/chain heads | PostgreSQL plus externally anchored checkpoints/export | Partly | Evidence gap | 15m/4h | Restore DB, verify chain and trusted checkpoint |
| Redis/queue | Redis is transport, PostgreSQL is durable work source | Yes, with reconciliation | Delayed/duplicate work | 0/1h for durable jobs | Start Redis empty; reconcile active/waiting records; verify idempotency |
| Build artifacts | Object storage/registry retention policy | Usually rebuild | Slow/unavailable redeploy | 24h/8h | Verify SBOM/provenance/digest; rebuild immutable commit if absent |
| Container images | Registry, replicated where configured | Rebuild from immutable source | Rollback/deploy unavailable | 24h/8h | Verify digest/signature before use |
| DNS/routing/Kubernetes state | Provider state + versioned desired config | Reconcile | Routes/workloads unavailable | 1h/4h | Restore control plane then compare observed state; never delete by prefix |
| Infrastructure configuration | Version control and protected state backend | Partly | Cannot recreate environment safely | 24h/8h | Restore state/backend, plan-only diff, peer approval |
| Encryption/signing/audit keys | External KMS/HSM/offline escrow, never DB-only | No | Credentials/evidence/artifacts unusable | 0/4h | Dual-control key recovery and synthetic verification |

Cross-system consistency checkpoint is the PostgreSQL backup timestamp. Restore PostgreSQL first, then independently recover keys/config, object/registry state, queue transport and observed infrastructure. Reconcile all operations created after the checkpoint. Permitted inconsistency window equals measured backup age or PITR lag; never infer registry/DNS/Kubernetes state from the DB alone.

## Incident process

1. Incident commander declares DR, freezes protected mutations and records request/correlation IDs.
2. Data owner selects the newest complete manifest whose checksum, encryption metadata and off-site upload are verified.
3. Security owner authorizes recovery keys; no key is copied into source control or incident chat.
4. Restore into an isolated recovery network first. Validate schema, counts, foreign relationships, tenants, deployment history, audit chain and synthetic credential decryption.
5. Promote only after application smoke/auth tests and reconciliation dry-run pass.
6. Recover Redis empty and replay/reconcile durable operations using idempotency keys.
7. Verify immutable registry digests, Kubernetes observed state, DNS/TLS, providers and audit continuity.
8. Communicate actual recovery point, known lost writes and degraded dependencies.
9. Fail back through the same backup/restore/verification process; preserve evidence and timeline.

## Scenario guidance

- **PostgreSQL loss:** isolate writes, restore base/PITR, verify tenants/audit, then reopen queues.
- **Redis/worker loss:** keep PostgreSQL authoritative, replace transport/fleet, reconcile stale operations.
- **Kubernetes control-plane outage:** stop rollout retries at limits, preserve desired state, verify observed digests after recovery.
- **Registry/object loss:** restore replicated objects or rebuild immutable commits; never substitute mutable tags.
- **DNS/certificate outage:** freeze routing changes, restore provider access, compare stored ownership before reconcile.
- **Key loss:** declare security incident; recover external escrow under dual control. If unavailable, encrypted credentials are unrecoverable and must be rotated.
- **Audit integrity failure:** preserve read-only copies/checkpoints, stop retention deletion, follow `runbooks/audit-integrity.md`.
- **Region loss:** provision from protected infrastructure state in an approved region, restore data, then explicitly change DNS. Automatic failover is not claimed.
- **Destructive config change:** revert through reviewed desired state, do not overwrite observed state blindly.
- **Corrupted backup:** quarantine it, select prior verified copy, measure increased RPO and investigate backup pipeline.

## Clean-room verification

Use `scripts/reliability/restore-verify.js` only with sanitized/test backups and a database URL clearly containing `_recovery`, `_restore`, localhost or loopback. It checks checksum/decryption, restores with `pg_restore`, validates migrations, critical counts, tenant relationships and deployment relationships, then destroys decrypted temporary material. Audit-chain CLI, synthetic credential decryption, API startup and smoke/auth suites must be run as adjacent required gates and attached to evidence.

No successful clean-room restore was possible in the current environment because PostgreSQL, `pg_dump` and `pg_restore` were unavailable. Therefore measured RPO/RTO and Part 2 completion are **not verified**.
