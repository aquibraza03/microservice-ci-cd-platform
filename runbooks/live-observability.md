# Live observability alert

**Alert:** LogStreamDegraded. **Owner:** Control Plane.

- Symptoms: reconnects/disconnects or freshness above 30 seconds.
- User impact: deployment status/logs appear delayed although durable state remains authoritative.
- Required access: stream dashboard, API pods, Redis/PostgreSQL event store.
- Diagnose: compare durable sequence to delivered sequence, connection limits,
  backpressure and authorization rechecks.
- Safe mitigation: restore API capacity, shorten stale connections, and let clients
  reconcile against the authoritative API. Never synthesize logs.
- Escalate: durable sequence gaps or tenant authorization failure.
- Verify recovery: reconnect replay has no gaps and freshness remains below 10 seconds.
- Preserve: request/workflow IDs, sequence range and disconnect reason.
