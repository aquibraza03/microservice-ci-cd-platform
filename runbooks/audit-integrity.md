# Audit integrity failure

**Alert:** AuditIntegrityFailure. **Owner:** Security.

- Symptoms: HMAC chain, sequence or trusted-checkpoint verification failure.
- User impact: security evidence cannot be trusted for the affected range.
- Required access: incident commander, read-only DB snapshot, external checkpoint and KMS audit.
- Diagnose: freeze retention/export mutation; identify first broken sequence; compare an
  isolated snapshot to the external checkpoint. Do not rewrite or “repair” rows.
- Safe mitigation: isolate affected writer/credentials and preserve storage snapshots.
- Escalate immediately to Security and Legal if deletion or unauthorized DB/KMS access is possible.
- Verify recovery: new controlled partition/checkpoint verifies; investigation owns the old chain.
- Preserve: immutable snapshot, checkpoint, key version, DB/KMS access logs and timeline.
