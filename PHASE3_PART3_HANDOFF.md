# Phase 3 Part 3 handoff

## Outcome

This checkpoint adds a release-governance foundation: canonical immutable approval snapshots, an explicit approval state machine, protected production-deployment pausing, current-authority revalidation, single-use execution, a Kyverno-only security-policy catalogue and renderer, scoped time-limited exceptions, read-only drift classification, API routes and a `/release-governance` dashboard.

The implementation is unit-tested, rendered-policy validated and locally build-verified. It was not tested against PostgreSQL, Redis, Kind, Kyverno admission or a customer cluster because those dependencies were unavailable. Runtime approvals, policy assignments and exceptions use in-process stores despite migration 012. Only production deployment creation is wired end-to-end to the new approval release path. Consequently, the Phase 3 Part 3 production completion gate is **not fully met**.

## Approval architecture

`MemoryApprovalStore` evaluates an active organization-scoped policy for an action and creates a request containing a safe canonical snapshot and SHA-256 digest. Deployment requests covered by an active production policy are persisted as `waiting_for_approval` and are not enqueued.

Approval decisions re-read current organization membership. They validate eligible role/user, separation of duties, duplicate identity votes, authorization version, policy ID/version, expiry and the current snapshot digest. A protected execution key is unique and an approval transitions through `executing` to `consumed` or `failed`.

Structured security events are emitted for request, approval, rejection, invalidation, expiry, override, execution and consumption. Event metadata contains identifiers, status and digests, never credentials or secret values.

## State-transition table

| From | Legal next states |
| --- | --- |
| `not_required` | `executing` |
| `pending` | `approved`, `rejected`, `expired`, `cancelled`, `invalidated`, `overridden` |
| `approved` | `executing`, `invalidated`, `expired` |
| `overridden` | `executing`, `invalidated`, `expired` |
| `executing` | `consumed`, `failed` |
| `rejected`, `expired`, `cancelled`, `invalidated`, `consumed`, `failed` | terminal |

Invalid transitions return `APPROVAL_TRANSITION_INVALID`. Consumed or terminal requests cannot be replayed.

## Protected-action matrix

| Action | Policy model | Execution integration |
| --- | --- | --- |
| Production deployment | Implemented | Pauses truthfully, releases one queue job after approval |
| Production rollback | Modelled | Existing rollback approval remains authoritative; unified release integration incomplete |
| Cloud connection material change | Modelled | Controller interception incomplete |
| Deployment-target material change | Modelled | Controller interception incomplete |
| Credential rotation/revocation | Modelled | Controller interception incomplete |
| Production secret-reference change | Modelled | Controller interception incomplete |
| Privileged RBAC change | Modelled | Last eligible approver lockout protection implemented; general action interception incomplete |
| Approval-policy change | Satisfiability and recursive-cycle guard implemented | Bootstrap uses existing owner/security-admin permission; approval-of-change interception incomplete |
| Kubernetes policy change | Modelled | Assignment persistence/controller apply incomplete |
| Policy exception | Exception lifecycle implemented | Approval ID/version binding exists; automatic approval-request creation incomplete |
| Emergency override | Owner permission and justification implemented | Emits event; only in-memory transaction tested |

Harmless operations have no approval policy by default. An authorized administrator must deliberately activate scoped policy.

## Snapshot schema and canonicalization

Deployment snapshots include action type, organization/project/environment, service, immutable digest when known, commit SHA, configuration-snapshot hash, secret-reference IDs and versions, deployment-target ID/version, policy-result hash, requested operation and requesting actor ID.

Objects are recursively sorted by key, arrays preserve order, non-finite numbers and unsupported values are rejected, and JSON is serialized without whitespace. SHA-256 is computed over this canonical UTF-8 representation. Fields named as secret plaintext, tokens, credentials, passwords, private keys or authorization material are rejected before storage.

The snapshot stores hashes and reference metadata, not external secret values.

## Bootstrap and lockout protection

- Policy activation requires enough currently active eligible approvers.
- Empty recursive approval-policy approver sets are rejected.
- Separation of duties blocks requester self-approval.
- Pending actions block removal/demotion of the final eligible approver through the HTTP membership controller.
- Emergency override requires owner-only `approval:override` and a justification of at least 12 characters.
- Unsatisfiable policies are rejected and never silently bypassed.

The first policy is bootstrapped through existing owner or security-admin authorization. Durable break-glass recovery requires the pending PostgreSQL implementation.

## Policy catalogue and enforcement matrix

Kyverno is the only selected admission engine.

| Control | Preflight | Rendered Kyverno | Admission tested |
| --- | --- | --- | --- |
| Privileged containers | yes | yes | no |
| Host PID/IPC/network | yes | yes | no |
| hostPath/Docker socket | yes | yes | no |
| Non-root, no escalation, capability drop, seccomp | yes | yes | no |
| Requests and limits | yes | yes | no |
| Allowed registries and immutable digests | yes | yes | no |
| Signature/provenance status | status/fail-safe model | catalogue entry | no |
| Ownership labels and production probes | yes | yes | no |
| Service-account token automount | yes | yes | no |
| Allowed namespaces and preview isolation | yes | catalogue entry | no |
| Restricted egress | catalogue/capability-gated | generated workload NetworkPolicy | no |
| Read-only root filesystem | validation only | catalogue entry | no |

Target states are `enforce`, `audit`, `disabled`, `unsupported`, `unknown` or `error`. `enforce` is returned only when the target reports both Kyverno availability and active enforcing admission. The checked-in policy defaults to `Audit`.

## Exception lifecycle

`pending -> approved/active -> expired` or `revoked`. Requests require organization, project, environment, target, exact policy, service, optional workload, justification, compensating control, start/expiry, policy version, resource version and approval ID. Expiry is capped at 30 days and scope matching is exact.

After expiry, an existing workload is reported as noncompliant. The platform does not silently mutate the base policy, delete the workload or perform automatic remediation.

## Drift-detection model

On-demand detection compares approved digest, configuration hash, target/namespace, secret-reference IDs and versions, ownership labels, policy status, Service and Ingress metadata. Findings are categorized as image, configuration, target, ownership, policy, or unknown/inaccessible drift. Secret plaintext is never fetched or stored. No automatic remediation is implemented.

## Schema changes

Migration `012_approval_policy_kyverno_drift.sql` adds:

- `approval_policies`
- `approval_requests`
- `approval_decisions`
- `protected_action_executions`
- `kubernetes_policy_assignments`
- `policy_exceptions`
- `deployment_drift_reports`
- `waiting_for_approval` to the deployment-state database constraint

The migration is transactional and additive except for replacing the deployment state check constraint with its additive state set. Forward recovery disables a bad policy, invalidates pending approvals and creates a new version; immutable snapshots and decisions are not rewritten.

## Files changed

- `services/control-plane-api/src/approvals/*`
- `services/control-plane-api/src/policy/*`
- `services/control-plane-api/src/auth/rbac.js`
- `services/control-plane-api/src/deployments/state-machine.js`
- `services/control-plane-api/src/deployments/store.js`
- `services/control-plane-api/src/deployments/postgres-store.js`
- `services/control-plane-api/src/server.js`
- `services/control-plane-api/migrations/012_approval_policy_kyverno_drift.sql`
- `services/control-plane-api/openapi.yaml`
- `services/control-plane-api/test/security/phase3-part3.test.js`
- `services/control-plane-api/test/migration.test.js`
- `deploy/k8s/kyverno/platform-workload-security.yaml`
- `frontend/packages/types/src/control-plane.ts`
- `frontend/packages/services/src/services/control-plane.service.ts`
- `frontend/apps/web/src/components/governance/release-governance-view.tsx`
- `frontend/apps/web/src/app/(app)/release-governance/page.tsx`
- `README.md`, `SECURITY.md`, `ops/README.md`
- `docs/PHASE3-PART3-RELEASE-GOVERNANCE.md`

## Commands and test results

Entry baseline:

- Control-plane `npm run test:all`, lint and migration contract: passed.
- Frontend `npm run verify`: passed with 94 tests and 24 pages.
- Auth service: 58 tests and lint passed.
- Platform smoke service: 8 tests and lint passed.

Final local verification:

- Control-plane `npm run test:all`: passed: 13 unit, 1 HTTP, 46 deployment/rollback/worker, 9 detection/configuration, 22 preview/domain, 19 BYOC and 56 security tests. Some suites intentionally share eight deployment-state tests.
- Control-plane lint and migration contract: passed.
- OpenAPI YAML parse: passed.
- Frontend format, type-check, 94 tests and production build: passed; 25 pages generated. Existing Fast Refresh warnings plus the new page's identical metadata warning remain non-blocking.
- Auth service: 58 tests and lint passed.
- Platform smoke service: 8 tests and lint passed.
- Real migration/PostgreSQL repository tests: blocked by `ECONNREFUSED 127.0.0.1:5432`.
- Real Redis/BullMQ test: blocked by unavailable Redis and timed out after 15 seconds.
- `kubectl`, Kind and Kyverno CLI: unavailable, so no admission test was possible.

## Verification classification

| Feature | Classification | Evidence/blocker |
| --- | --- | --- |
| Approval state machine and hashing | Unit test | Legal/invalid transitions, deterministic digest and sensitive-field rejection pass |
| Separation of duties and current authority | Unit test | Self-approval, duplicate identity, role/version change and expiry tests pass |
| Protected production deployment | Mocked integration | Waiting state, delayed enqueue and queue idempotency pass in memory |
| PostgreSQL approval concurrency | Not verified | Schema exists; runtime repository and PostgreSQL service unavailable |
| Kyverno policies | Rendered-policy validation | YAML parses and critical preflight cases pass |
| Kyverno admission enforcement | Not verified | No kubectl, Kind or Kyverno available |
| Exceptions | Unit test | Exact scope, self-approval, version binding and expiration pass |
| Drift | Unit test | All required categories and inaccessible state pass |
| Dashboard | Locally build-verified | Type-check, unit suite and production build pass |
| Live customer cluster | Not verified | No customer cluster supplied |

## Known limitations

1. `MemoryApprovalStore` and `MemoryPolicyExceptionStore` are not durable; migration 012 does not yet have transactional PostgreSQL repositories.
2. Only production deployment creation is intercepted by the new approval system. Rollback and other protected controllers still require unified interception.
3. PostgreSQL row-lock tests for concurrent approval counts, policy changes and single execution were not possible.
4. Kyverno assignment apply/reconciliation and admission-negative acceptance tests are incomplete.
5. Policy-exception requests are not yet automatically coupled to a newly created approval request.
6. Default drift inspection returns `unknown_or_inaccessible` until a target-specific read-only Kubernetes inspector is supplied.
7. Part 1/Part 2 in-process BYOC and secret-reference persistence and worker-side ESO limitations remain.
8. Inherited development dependency advisories remain pending a separately tested dependency upgrade.

Because limitations 1–5 affect durability and protected-action coverage, this repository must not be described as production-complete for Phase 3 Part 3.

## Exact prerequisites for Part 4

- Implement PostgreSQL approval, decision, execution, policy assignment, exception and drift repositories using row locks and unique execution constraints.
- Put approval consumption and BullMQ enqueue/outbox publication in one recoverable transaction.
- Intercept rollback, BYOC material changes, credentials, production secrets, privileged RBAC and policy changes through the same protected-action service.
- Run concurrent approval and final-approver removal tests against PostgreSQL.
- Install Kyverno in Kind, apply the policy in Audit then Enforce, and prove prohibited workloads are denied while generated workloads pass.
- Add target-specific read-only Kubernetes drift inspection and safe scheduled execution only after a reliable scheduler exists.
- Complete inherited BYOC/managed-secret durable runtime prerequisites before enterprise audit Part 4 consumes these events.
