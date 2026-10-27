# PostgreSQL and Redis alerts

**Alerts:** DatabaseUnavailable, DatabasePoolExhausted, RedisFailure. **Owner:** Data Platform.

- Symptoms: absent pool metrics, waiting clients, failed DB/Redis operations.
- User impact: authoritative writes fail or deployments stop moving through the queue.
- Required access: managed database/cache consoles, read-only platform telemetry.
- Diagnose: validate endpoints/TLS/DNS, connection limits, saturation, replication and
  recent config changes. Never print connection URLs.
- Safe mitigation: fail closed on protected writes, restore connectivity, release leaked
  clients, scale within the service plan, and replay only idempotent outbox/queue work.
- Escalate: suspected data loss, split brain, audit divergence or prolonged outage.
- Verify recovery: transactions and queue round trips succeed; pools have idle capacity;
  backlog drains without duplicates.
- Preserve: provider incident ID, safe timing, pool counts and correlation IDs.
