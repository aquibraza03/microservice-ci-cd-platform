# ADR 0004: Redis with BullMQ

**Status:** Accepted for Phase 1

## Decision
Use Redis with BullMQ for asynchronous build and deployment job coordination. PostgreSQL remains the source of truth for durable job state.

## Context
Builds and deployments must not run in HTTP request processes and require retries, concurrency controls and worker leases.

## Alternatives
Database polling is simpler but inefficient. RabbitMQ or Kafka add operational weight beyond Phase 1. In-process queues are not durable or horizontally scalable.

## Security implications
Use authenticated TLS connections in production, isolate Redis from public networks, avoid secrets in job payloads, validate every payload, apply tenant authorization before enqueueing and use idempotency keys.

## Operational implications
Monitor lag, failures, retries and dead-letter handling. Configure persistence and eviction so queue data is not evicted accidentally.

## Consequences
BullMQ provides a Node-friendly worker model, while Redis becomes an additional stateful dependency and delivery is at least once.

## Future extension points
Separate queues by workload class, introduce priorities and replace the adapter with another broker if scale requires it.
