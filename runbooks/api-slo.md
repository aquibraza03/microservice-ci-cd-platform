# API SLO alerts

**Alerts:** ApiFastErrorBudgetBurn, ApiSlowErrorBudgetBurn, ApiAvailabilityDegraded,
ApiLatencyHigh. **Owner:** Control Plane / Platform SRE.

- Symptoms: elevated 5xx ratio, burn rate or server-side p95 latency.
- User impact: authentication, configuration or deployment requests fail or stall.
- Required access: read-only Grafana, Kubernetes workloads, safe operational logs and DB/Redis health.
- Diagnose: confirm the SLI query; split by normalized route/result; correlate trace IDs;
  check pool, Redis, workers and provider latency. Do not inspect request bodies or secrets.
- Safe mitigation: stop a bad rollout, scale a healthy control-plane revision, shed
  nonessential read traffic, or disable a failing optional exporter. Preserve approvals.
- Escalate: any security correlation, >14.4x burn, sustained 5xx, or uncertain state.
- Verify recovery: synthetic authenticated request succeeds and both short/long burn
  windows recover for 15 minutes.
- Preserve: dashboard range, deployment revision, trace/request IDs, safe error categories
  and mitigation timestamps.
