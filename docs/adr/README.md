# Architecture decision records

These accepted records define the Phase 1 target architecture. They describe decisions, not claims that the components are already implemented.

| ADR | Decision |
| --- | --- |
| [0001](0001-platform-authentication.md) | GitHub OAuth login behind a provider abstraction |
| [0002](0002-repository-access.md) | GitHub App installation tokens |
| [0003](0003-postgresql.md) | PostgreSQL system of record |
| [0004](0004-redis-bullmq.md) | Redis and BullMQ queue |
| [0005](0005-rootless-buildkit.md) | Isolated ephemeral rootless BuildKit workers |
| [0006](0006-ghcr.md) | GitHub Container Registry |
| [0007](0007-kubernetes-kind.md) | Kubernetes deployment target and Kind locally |
| [0008](0008-server-sent-events.md) | Server-Sent Events for live updates |
| [0009](0009-secrets-adapters.md) | Local secret adapter and managed-secret interface |
| [0010](0010-observability.md) | Structured logs and Prometheus-compatible metrics |
| [0014](0014-production-observability.md) | Production telemetry, collection, sampling, retention and cost controls |
