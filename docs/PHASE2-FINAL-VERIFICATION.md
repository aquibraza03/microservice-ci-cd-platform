# Phase 2 final verification report

Date: 2026-09-15

## Outcome

Safe rollback, compatibility policy, API, worker verification, dashboard flow, tests, OpenAPI, migration and acceptance runner are implemented. Automated functional gates pass. Phase 2 cannot truthfully be classified as fully locally or externally accepted in this execution environment because no real GitHub CLI/App workflow, Docker/BuildKit, Kind, kubectl, registry, DNS route or certificate controller was available. The acceptance runner stopped with `BLOCKED: missing required command: gh`; Docker, Kind and kubectl are also absent.

## Entry-gate result

| Prerequisite | Classification | Evidence or blocker |
| --- | --- | --- |
| Service reaches `ready` | Implemented and locally verified through controlled provider tests | No real Kubernetes runtime available |
| Immutable image digest | Implemented and locally verified through registry/provider tests | No real registry digest captured |
| Configuration snapshot | Implemented and locally verified | Memory and PostgreSQL deployment stores tested structurally/functionally |
| Ordered logs and status | Implemented and locally verified | Replay, sequence, stale-state and redaction regressions pass |
| Preview creation/cleanup | Implemented and locally verified through adapters | Real Kind cleanup blocked: Kind/kubectl absent |
| Generated local route | Implemented but blocked from runtime verification | Kind/ingress/kubectl absent |
| Tenant isolation | Implemented and locally verified | Cross-tenant deployment, rollback, preview and domain tests pass |

The missing live-cluster prerequisites were not hidden inside rollback implementation. Part 3's runtime preview store still defaults to memory even with PostgreSQL control-plane storage; migration `008` exists, but the production PostgreSQL preview-store adapter remains partially implemented and unverified.

## Rollback verification

| Feature | Classification |
| --- | --- |
| Eligibility, permissions and tenant ownership | Implemented and locally verified |
| Immutable new rollback record and related IDs | Implemented and locally verified |
| Exact target digest/configuration snapshot | Implemented and locally verified |
| Signature and scan-policy revalidation | Implemented and locally verified using stored provider results |
| Database compatibility warn/block and emergency override | Implemented and locally verified |
| Exact approval binding | Implemented and locally verified |
| Idempotency, optimistic version and operation lock | Implemented and locally verified |
| Lock expiry and worker-restart recovery | Implemented and locally verified |
| Kubernetes apply/rollout/readiness/health failure truthfulness | Implemented and locally verified through controlled provider tests |
| Observed digest/controller confirmation and route verification | Implemented and locally verified through controlled provider tests |
| Real immutable-digest restoration on Kind | Implemented but blocked from verification: Docker, Kind and kubectl absent |
| Dashboard comparison/confirmation/progress/logs | Implemented and locally verified by typecheck/build; browser E2E not executed |
| Audit and safe failure guidance | Implemented and locally verified |

## Automated results

- Backend: 115 passing (13 unit, 1 HTTP, 46 deployments/worker including 10 Part 4 cases, 9 detection/configuration, 22 preview/domain/TLS, 24 security).
- Frontend: 94 passing across 14 files.
- Backend migration contract and ESLint: passed.
- Frontend Prettier, ESLint, TypeScript and production build: passed.
- Production dependency audits: zero known vulnerabilities in backend and frontend production dependency trees.
- Acceptance scripts: Bash syntax passed.
- Load tests: not executed.

## Actual acceptance evidence

No application evidence was emitted because the real acceptance test was blocked before repository creation. Accordingly, repository, branch, commits, detection/configuration IDs, deployment IDs, digests, namespace, URLs, health responses, preview/cleanup IDs and rollback results are all `null` in the machine-readable report. Synthetic unit-test values are deliberately excluded.

## Security review

- Viewer and developer rollback attempts are denied; operator rollback is allowed but emergency override is not.
- Source and target are tenant-, service- and environment-bound.
- Secret values are never returned by comparison; only reference/environment-variable names are shown.
- Required approval is bound to the exact source and target.
- The database gate never runs destructive down migrations.
- Digest, signature, scan policy, readiness, health, route and controller observation all fail closed.
- Historical records are not mutated.
- Rollback failures cannot produce `rolled_back` and emit safe remediation metadata.
- Production development/sample dashboard data is rejected during configuration parsing.

## Commands

```text
cd services/control-plane-api
npm run test:all
npm run test:migration:contract
npm run lint

cd frontend
npm run verify

cd ..
bash -n scripts/phase2-acceptance.sh scripts/golden-path-kind.sh
./scripts/phase2-acceptance.sh
```

## Blocked verification

- Fresh external GitHub repository and verified PR webhook: `gh` unavailable and no GitHub App credentials/callback.
- Real build, registry digest and signature: Docker/BuildKit/registry credentials unavailable.
- Kind deployment, local generated URL, preview cleanup and rollback restoration: Docker, Kind and kubectl unavailable.
- Public DNS and trusted TLS: provider credentials, delegated zone and certificate controller unavailable.
- PostgreSQL/Redis real integration suites: services were not available in this workspace execution.
- Load behavior: no load-test environment was supplied.

## Remaining Phase 3 work

- Implement and integration-test the PostgreSQL preview/domain store adapter instead of the current default in-memory Part 3 store.
- Run the acceptance runner in a credentialed CI environment with Docker, rootless BuildKit, Kind, ingress-nginx, local registry, Redis and PostgreSQL.
- Add browser-driven rollback E2E and accessibility testing against the running stack.
- Operate scheduled stale-lock/preview reconciliation and production alerts.
- Validate public DNS, cert-manager issuance/renewal and an external Kubernetes target when credentials are available.
