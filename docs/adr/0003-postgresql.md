# ADR 0003: PostgreSQL

**Status:** Accepted for Phase 1

## Decision
Use PostgreSQL as the authoritative store for users, organizations, projects, repository references, deployment metadata and audit events.

## Context
The control plane needs transactions, relational integrity and auditable state transitions. A foundation migration already exists but has not been exercised here against a live database.

## Alternatives
SQLite is convenient locally but differs operationally. A document store weakens relational constraints. Multiple databases add premature complexity.

## Security implications
Use TLS in production, least-privilege database roles, encrypted backups, parameterized queries, tenant-scoped authorization and credential rotation. Database identifiers are not authorization checks.

## Operational implications
Migrations require ordered rollout, backups and recovery tests. Pool sizing and connection limits must be monitored.

## Consequences
The platform gains strong consistency and mature tooling, while operating a stateful service.

## Future extension points
Read replicas, partitioned audit data and managed PostgreSQL can be added without changing the logical model.
