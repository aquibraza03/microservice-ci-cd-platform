# Capacity saturation

**Symptoms:** high p95/p99, queue age, pool pressure, stream disconnects or provider throttling. **Impact:** delayed deployments and stale status. **Access:** dashboards, metrics, deployment controls.

Stop approved load tests with the kill switch, shed synthetic traffic, preserve user traffic and identify the first saturated component. Scale only within tested limits; reduce worker concurrency when DB/provider pressure is causal. Do not retry throttled non-idempotent work. Verify queue age drains, p95 returns to SLO and resources remain below the documented operating margin for 15 minutes. Preserve test ID, fingerprint, dataset, resource allocation and percentiles. Owner: Platform SRE.
