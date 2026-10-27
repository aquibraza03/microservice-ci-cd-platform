# Backup failure

**Symptoms:** `BackupFailure` or `BackupAgeExcessive`, missing complete manifest, checksum/upload failure. **Impact:** RPO grows. **Access:** data-platform on-call, backup storage read, scheduler logs; key custody remains separate.

1. Stop retention deletion; identify last manifest with `complete=true` and successful off-site upload.
2. Check `pg_dump`, storage authentication, free space, encryption key version and upload finalization. Never print connection strings or keys.
3. Retry only with a new backup ID. An incomplete object or manifest must never be promoted.
4. If age exceeds RPO, declare a data-protection incident and schedule isolated restoration.
5. Recovery is verified only when a new encrypted backup is complete, its checksum passes and a clean-room restore succeeds.

Preserve manifests, scheduler/transfer request IDs, checksums, timestamps and safe errors. Owner: Data Platform. Escalate immediately on suspected credential/key compromise.
