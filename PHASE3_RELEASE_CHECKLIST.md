# Phase 3 Release Checklist

Current decision: **NOT PRODUCTION READY**.

- [x] Central audit schema validates, redacts and bounds metadata.
- [x] Per-organization sequence and concurrent-writer-safe PostgreSQL chain design exists.
- [x] Modified, deleted, inserted and reordered events are detected in automated tests.
- [x] Tenant-scoped search, verification and one-time JSONL export APIs exist.
- [x] Auditor is read/export/verify only; normal users cannot mutate events.
- [x] Waiting approved deployments revalidate targets, secret versions and connections.
- [x] Canary, cross-tenant, approval, policy, drift, rollback and export-replay tests pass.
- [x] Previous automated Phase 1-3 suites, frontend build, lint and type-check pass.
- [x] Dependency audit reports zero vulnerabilities.
- [ ] Run migration 013 against staging PostgreSQL and validate trigger/outbox recovery.
- [ ] Move every protected business mutation into the same DB transaction as audit append.
- [ ] Wire durable PostgreSQL search and queued object-storage export worker.
- [ ] Configure KMS-managed audit keys and externally protected checkpoints.
- [ ] Run live AWS AssumeRole identity/revocation tests.
- [ ] Run local/staging Kubernetes and Kyverno admission tests.
- [ ] Run registry, DNS/TLS, backup/restore, chaos and concurrent audit load tests.
- [ ] Complete and approve the documented 27-step enterprise staging flow.

Release only when every unchecked security gate has evidence and an accountable approver.

