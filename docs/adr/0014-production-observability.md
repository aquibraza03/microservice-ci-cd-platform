# ADR 0014: Production observability foundation

**Status:** Accepted for Phase 4 Part 1

## Decision

Use OpenTelemetry SDKs and W3C Trace Context in applications, an OpenTelemetry
Collector gateway per cluster, Prometheus-compatible metrics, Tempo-compatible OTLP
traces, and structured JSON operational logs shipped to a Loki-compatible destination.
User deployment logs and tamper-evident security audit events remain separate products.

The collector is not in the availability path. SDK/exporter queues are bounded, export
timeouts are three seconds, batches are limited to 256 spans and 2,048 queued spans,
and failures drop telemetry rather than block a deployment. Collector memory limiting,
bounded sending queues and retry elapsed-time limits provide a second containment layer.

## Topology and access

- Applications expose authenticated Prometheus endpoints only inside the platform network.
- Applications send OTLP to an internal collector service over authenticated TLS in
  production; local development may use loopback plaintext.
- Prometheus, Tempo and Loki query endpoints have no public ingress. Grafana uses SSO and
  platform-operator authorization. Tenant identifiers are correlation fields in
  access-controlled logs/traces, never metrics labels.
- Users see their deployment logs through the existing authorized API; they do not query
  internal telemetry backends directly.

## Sampling and retention

Head sampling is 10% for ordinary successful requests, 0.1% for health endpoints, and
100% for errors, slow requests, failed deployments and security-sensitive operations.
The local collector does not claim tail sampling. Provisional retention is 30 days for
metrics, 14 days for traces, and 30 days for operational logs; audit retention remains
separately governed. Production storage teams must validate cost and compliance.

## Cardinality and cost

Metrics allow at most five labels and only bounded dimensions. IDs, URLs, commits,
arbitrary paths/messages and user text are forbidden labels. The expected platform-owned
budget is under 25,000 active series per production cluster, scraped every 30 seconds.
Dashboards aggregate by route, stage, provider, result, worker, environment class and
support level only.

## Failure behavior

Telemetry loss never changes authoritative PostgreSQL deployment state and never causes a
protected operation to succeed or fail. Export failures produce bounded local structured
diagnostics and exporter/drop metrics where the process can still report them. Recovery is
automatic when the collector returns; dropped telemetry is not replayed from application
memory.

## Consequences

This decision is vendor-neutral but requires operators to secure collector/backend
transport, validate retention, provision storage, and test real backend failure behavior
before production promotion.
