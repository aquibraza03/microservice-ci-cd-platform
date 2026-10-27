# Telemetry pipeline alerts

**Alerts:** TelemetryExportFailure, TelemetryDropsHigh. **Owner:** Observability.

- Symptoms: failed exports, full bounded queues, memory limiter drops or missing collector health.
- User impact: incomplete operational visibility; deployment state should remain unaffected.
- Required access: collector self-metrics/config, backend health and network policy.
- Diagnose: check collector health, TLS/auth, queue usage, memory limiter and backend rate limits.
- Safe mitigation: restore backend, reduce sampling, add collector capacity, or temporarily
  use bounded debug output. Never remove redaction or expose ingestion publicly.
- Escalate: telemetry failure coincides with a platform incident or security signal loss.
- Verify recovery: exporters succeed, queues drain and drops remain zero for 15 minutes.
- Preserve: collector version, safe exporter category, queue/drop series and config checksum.
