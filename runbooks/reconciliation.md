# State reconciliation failure

**Symptoms:** durable deployment/preview state differs from queue, Kubernetes, DNS or registry observation. **Impact:** stale status, duplicate work or leaked resources. **Access:** platform operator with read access to PostgreSQL and provider state.

Pause new work for the affected scope, compare PostgreSQL versions and immutable IDs with observed ownership labels, then run dry-run reconciliation. Never delete by prefix. Revalidate credentials and approvals before retry. Quarantine irreconcilable jobs in DLQ and preserve attempts/events. Recovery requires legal state transitions, one logical job, matching digest/route and no cross-tenant resources. Owner: Platform SRE.
