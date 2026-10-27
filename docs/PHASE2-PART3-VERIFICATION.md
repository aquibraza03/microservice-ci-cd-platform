# Phase 2 Part 3 verification

Date: 2026-09-15

## Result

The functional test harness passes for immutable preview creation, signed/idempotent PR event handling, fork restrictions, quotas, generated hostnames, Ingress and Certificate manifests, cleanup reconciliation, custom-domain ownership, challenge expiry, tenant isolation and truthful route/TLS failure states. All earlier automated suites remain passing.

Rollback was not added.

## Entry gate

| Gate | Evidence | Result |
| --- | --- | --- |
| Phase 1 deployment target | Existing controlled Kubernetes provider golden-path, rollout, readiness and health tests | Functionally tested with provider adapters; no live cluster in this environment |
| Phase 2 logs/status | Existing event ordering, replay, redaction, truncation, stale-state and SSE tests | Passed |
| PR webhooks | HMAC signature, provider metadata, delivery idempotency and PR action tests | Passed |
| Kubernetes lifecycle | Create/inspect/delete implementation plus exact-label ownership deletion tests | Functionally tested with adapters; structurally implemented for Kubernetes |
| Tenant isolation | Organization authorization, cross-tenant deployment/domain and duplicate-claim tests | Passed |

## Verification classes

### Functionally tested

- Backend: 105 passing tests (13 unit, 1 HTTP, 36 deployment/worker, 9 detection/configuration, 22 Part 3, 24 security).
- Migration contract and ESLint passed.
- Frontend: formatting, lint, typecheck, 93 tests across 13 files, and production build passed. The build exposes `/previews` and `/domains`.
- Part 3 tests cover PR open/update/reopen/close/merge, duplicate delivery, immutable revisions, verified fork trust, secret removal, quotas, expiration, missed-webhook reconciliation, idempotent and ownership-safe cleanup, orphan detection, IDNA normalization, collision resistance, Ingress creation/failure, local URL state, domain verification/expiry/duplicate/cross-tenant claims, certificate failure/removal, and host-header rejection.

### Structurally implemented

- Additive PostgreSQL schema for preview policies, instances, revisions, routes, domains, challenges and cleanup jobs.
- Runtime preview store abstraction and injectable routing/deployment/DNS/HTTP-verifier adapters. The packaged default preview store is in-memory; the PostgreSQL schema is present, but a production PostgreSQL preview-store adapter was not integration-tested in this environment.
- Kubernetes `networking.k8s.io/v1` Ingress only, cert-manager Certificate lifecycle, exact ownership-label deletion, cleanup retry/backoff/finalizer deadline, audit records and metrics.
- Local Kind strategy and public DNS strategy are separated in ADR 0011.

### Not externally verified

- A real Kind or production Kubernetes cluster was not available, so no live local URL was reached from this environment.
- No delegated public DNS zone/provider was available; public resolution is not verified.
- No public cert-manager issuer/controller was available; trusted issuance and renewal are not verified.
- No external load test was run. Backoff, quotas and reconciliation behavior are functional tests, not load-test evidence.

Public readiness fails closed when the external verifier is absent. Certificate readiness comes from controller status and is never inferred from manifest creation. Local hostname mapping never records public verification.

## Commands

```text
cd services/control-plane-api
npm run test:all
npm run test:migration:contract
npm run lint

cd frontend
npm run verify
```

