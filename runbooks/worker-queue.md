# Worker and queue alerts

**Alerts:** WorkerFleetUnavailable, QueueBacklog, OldestJobAgeHigh,
BuildCapacityExhausted. **Owner:** Platform SRE / Build Platform.

- Symptoms: absent heartbeat, growing waiting/delayed depth, old jobs or saturated builds.
- User impact: accepted deployments do not progress or produce logs.
- Required access: queue read access, worker workload/status and deployment event API.
- Diagnose: compare queue states and oldest age; inspect worker readiness, retries and
  bounded error categories; confirm Redis and BuildKit without exposing job payloads.
- Safe mitigation: restore workers, pause producers if necessary, scale within approved
  limits, retry only idempotent jobs, and move poison jobs to the dead-letter process.
- Escalate: lock loss, duplicate execution, state divergence or backlog still growing.
- Verify recovery: heartbeat present, oldest age declines, a synthetic deployment advances
  with ordered events.
- Preserve: job/workflow IDs, queue counts, worker revision and retry history.
