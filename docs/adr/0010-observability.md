# ADR 0010: Logs and metrics

**Status:** Accepted for Phase 1

## Decision
Emit structured JSON logs and Prometheus-compatible metrics from control-plane APIs and workers, with correlation identifiers across requests and jobs.

## Context
Asynchronous multi-tenant deployments require searchable events, latency and error metrics, and a way to connect API activity with worker execution.

## Alternatives
Unstructured text is difficult to query. Vendor-only agents reduce portability. Tracing alone does not replace logs or metrics.

## Security implications
Redact credentials, tokens, request bodies and sensitive tenant values; control label cardinality; restrict observability access; and define retention. Tenant IDs must not become uncontrolled public labels.

## Operational implications
Define schemas, metric names, dashboards and alerts. Scrape endpoints require authentication or network isolation and exporters require capacity planning.

## Consequences
The platform gains portable operational signals; teams must maintain schemas and avoid high-cardinality or sensitive telemetry.

## Future extension points
Add OpenTelemetry traces and vendor exporters without changing application instrumentation contracts.
