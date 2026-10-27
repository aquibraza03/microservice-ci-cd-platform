# Database restore

**Impact:** control-plane state and tenant authorization may be unavailable or stale. **Access:** incident commander, database owner and security key custodian.

1. Freeze writes and record incident/recovery checkpoint.
2. Select a complete encrypted test/sanitized backup; verify checksum and external retention status.
3. Create an isolated recovery database/network. Recover the authorized key through dual control.
4. Run restore verification, then audit-chain verification, tenant-boundary queries, deployment-history checks, synthetic decryption, API smoke and authorization tests.
5. Record actual backup timestamp, restore duration and lost-write window. Reconcile Redis/jobs only after PostgreSQL passes.
6. Destroy temporary plaintext dumps and sanitized recovery data according to policy.

Do not migrate blindly across incompatible application versions. Escalate any chain, tenant or relationship failure. Recovery requires every gate to pass. Owner: Data Platform; evidence: manifests, hashes, migration list, row counts, test output and timeline.
