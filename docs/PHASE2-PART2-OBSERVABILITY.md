# Phase 2 Part 2: deployment observability

## Scope

This historical Part 2 checkpoint implements secure deployment-event streaming, historical event/log access, and an authoritative deployment detail timeline. At that checkpoint preview deployments, generated domains, and rollback were intentionally unavailable. Rollback is implemented by Part 4; see `PHASE2-PART4-SAFE-ROLLBACK.md` for the current contract.

## Source of truth and event contract

PostgreSQL `deployments.current_state` and `state_version` remain authoritative. Redis/BullMQ owns delivery only. Every state transition increments `state_version`. State, stage, and real worker log output share `deployment-event.v1` and one deployment-scoped sequence.

The envelope is defined in `src/deployments/event-contract.js`: schema version, sequence, deployment and internal organization identifiers, stage, state version, timestamp, level, source, attempt, event type, safe message, and redacted metadata. PostgreSQL serializes concurrent producers by locking the deployment row before assigning `MAX(sequence)+1`.

## Storage and limits

Event metadata is held in `deployment_events`; downloadable log payloads remain bounded chunks in `deployment_log_chunks`, not one deployment row. Defaults are 64 KiB maximum per event input (oversize input is clipped), 5 MiB per deployment, and seven-day retention (configurable up to 90 days). A single durable `log.truncated` record is emitted when the aggregate limit is reached. `GET .../logs/retention` exposes configured retention, use, expiry, and truncation. Operational cleanup should delete expired `deployment_log_chunks`; event metadata can be retained longer according to the database partition/archive policy.

At the default 5 MiB limit, a deployment can contain roughly 80 maximum-size chunks. The cursor API returns at most 500 events per request. Larger installations should time-partition `deployment_events` and move log chunk content to object storage behind the same store abstraction.

## Redaction

Redaction runs before persistence and before the same event is eligible for replay. It covers registered secret values, Authorization values, GitHub tokens, credential-bearing URLs, PostgreSQL and Redis URLs, private keys, common secret assignments, structured sensitive keys, and collapsed multiline variants. Regression tests use synthetic values.

## Streaming

`GET .../stream` authenticates through the normal bearer middleware and authorizes organization/deployment ownership before headers open. It accepts `Last-Event-ID`, replays missed rows in order, emits heartbeats, applies response backpressure, rechecks access during polling, closes terminal deployments, limits stream lifetime, and enforces per-user/per-organization connection limits. Tokens are never accepted in the query string. Delivery/reconnect/backpressure counters are exposed through the authenticated stream metrics endpoint.

## Client reconciliation

Initial load and reconnect fetch authoritative deployment and stage state, then resume after the last sequence. The client ignores duplicates, detects gaps and reconciles, and refuses lower state versions. It shows connecting, live, delayed, and complete status. Timeline rows come only from backend stage records. Health failures cannot synthesize `ready` because the UI renders the authoritative state.

## Failure safety

Workers persist safe failure messages and stable failure codes; the API error envelope supplies a request ID. Raw stacks and credentials are not returned. Existing provider error classes cover repository, configuration, tests, security, build, registry, Kubernetes validation/authorization, image pull, rollout, health, and internal worker failures.
