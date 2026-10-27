# Phase 2 Blocker Resolution Report

## 1. Final status

**PHASE 2 — BLOCKED.** Fresh Kind creation succeeded, but the mandatory foundation
stability gate failed before application deployment. No current complete positive
health gate, unchanged reconcile, successful-sequence recreation or second gate
is proven. Guarded cleanup passed; staging is EMPTY. All 24 unrelated containers,
22 baseline volumes and 11 unrelated networks were preserved. The node-owned
volume was removed. No global Docker/WSL setting or unrelated workload changed.

The previous report and summary are preserved as `docs/phase2-staging-initial-report.md`
and `artifacts/staging/initial-summary.json`. Their historical PASS values are not
substituted for current application acceptance. Current totals: 13 PASS, 28 BLOCKED,
2 N/A. This is local disposable Kind evidence only.

## 2. Investigation and evidence-supported root cause

The authoritative target, runbook and previous report were read before editing,
along with lifecycle/safety/manifests/verifier/capture/summary scripts, Dockerfile,
configuration/readiness/security code and relevant Phase 1 reports/runbook.
Git status and branch checks again reported an extracted workspace without Git.
No repository was initialized; source-content hashing remains authoritative.

Read-only preflight confirmed `desktop-linux`, local endpoint
`npipe:////./pipe/dockerDesktopLinuxEngine`, daemon
`999fd370-edd4-42cc-b047-589d7adcf226`, and no staging resources. The initial sandbox
Docker denial was resolved with an authorized unrestricted read, not treated as
an engine failure. Baseline inventories were captured before creation.

The new Kind invocation exited 0 with unchanged timeout bounds. Its first
foundation sample found API `/readyz=ok` and a Ready node, but the controller-manager
was not Ready and had restarted. The gate exited 1 before application provisioning.

The retained logs and metrics establish this failure chain:

1. etcd logged slow range/apply operations, including about 1.87 seconds for a
   read expected within 100 ms.
2. API-server etcd Range requests exceeded deadlines; lease requests hit handler
   timeouts. At 03:37:31 UTC the controller-manager failed to renew leadership,
   logged `leaderelection lost/stopped`, and exited.
3. Retained metrics put WAL fsync p99 in (256,512] ms and backend commit p99 in
   (512,1024] ms. The second sample has 1,198 fsyncs totaling 52.788 seconds and
   831 commits totaling 76.742 seconds.
4. Initial diagnostic CPU pressure avg60 was 59.15%, memory pressure 6.35%, and
   I/O pressure 6.97%. The VM exposes 3,858,628 KiB memory with swap in use.
   Windows later reported 8,085,560 KiB visible memory and only 268,772 KiB
   (about 262 MiB) free physical memory.
5. Node CPU quota was unlimited, CPU-throttling counters zero, and OOM counters
   zero. About 914 GiB filesystem space remained. Port 31082 was loopback-bound;
   the node used its dedicated 172.23.0.0/16 bridge.

**Classification: environment/runtime latency limitation.** Slow etcd persistence
and request processing led to API deadlines and controller leadership loss before
any PostgreSQL/API/worker or staging NetworkPolicy existed. The underlying split
between backing-storage latency, host paging and CPU scheduling is NOT VERIFIED.
No application defect was established as this failure's cause. The earlier
PostgreSQL TCP symptom remains undiagnosed because application deployment was
correctly blocked. No claim is made that increasing Docker RAM or a timeout fixes it.

The [etcd FAQ](https://etcd.io/docs/v3.3/faq/) recommends p99 WAL fsync below 10 ms
and backend commit below 25 ms to rule out slow storage; these are diagnostic
guidance, not new acceptance criteria. The [Kind known-issues guide](https://kind.sigs.k8s.io/docs/user/known-issues/)
documents retaining failed nodes. This implementation captures only selected
core logs/metrics rather than credential files.

## 3. Changes made

| File | Purpose |
|---|---|
| `scripts/staging/main.cjs` | Bootstrap-only mode; gate before application provisioning; retain nodes, register bootstrap identity, capture diagnostics, guard bootstrap-only cleanup. Original namespace identity/down controls preserved. |
| `scripts/staging/foundation.cjs` | Exact bootstrap ownership validation and stable core-component assertions. |
| `scripts/staging/safety.test.cjs` | Nine new regressions: ownership/replacement/foreign attachments/pre-existing volumes/wrong cluster and stability checks. |
| `scripts/summarize-staging-evidence.cjs` | Current investigation evidence instead of fixed historical attempt and stale counts. |
| `docs/phase2-staging-runbook.md` | Investigation, bounded observation, retained identity and guarded cleanup procedure. |
| `docs/phase2-staging-report.md` | Current findings and all 43 recalculated requirements. |
| `docs/phase2-staging-initial-report.md` | Prior report preserved verbatim. |
| `artifacts/staging/resolution-tests.json` | Current executed tests and host counters; explicitly not runtime acceptance. |

**FIXED and exercised:** applications can no longer deploy before stable foundation
acceptance; the gate rejected the unready controller-manager. Failed bootstrap
nodes can now be retained for diagnosis. **NOT FIXED:** host/runtime latency.
No application code, target, image pin, resource budget, probe, authentication or
NetworkPolicy changed in this task. Bootstrap-only deletion has negative test
coverage but was not needed live: Kind created a namespace and full identity,
so the existing guarded `down` was used.

## 4. Kind / Kubernetes stability

Kind create: exit 0. Foundation: BLOCKED, exit 1, one unsuccessful sample recorded.
A later all-Ready snapshot did not replace the failed gate. Both bootstrap and
normal up now require three successful API/node/core-component samples across
two 30-second observation intervals with no component restart or pod replacement.
These are bounded observations, not retry sleeps or increased bootstrap timeouts.

## 5–10. Dependencies and security

| Area | Current execution result |
|---|---|
| PostgreSQL | BLOCKED; not deployed. Pod/Service/EndpointSlice/DNS/TCP/authentication/SQL investigation cannot begin before foundation acceptance. |
| Redis / worker | BLOCKED; no live Redis/BullMQ/readiness acceptance. Existing readiness regressions passed. |
| Object storage | BLOCKED; signed PUT/GET/DELETE not executed. |
| Registry | BLOCKED; authenticated push/pull/digest verification not executed. |
| RBAC | BLOCKED; expected 36 denials for actual application identities, zero attempted because those identities were not deployed. Historical 19 denials are not current proof. |
| NetworkPolicy | BLOCKED; required/forbidden traffic not attempted. Default-deny definitions preserved. |
| Domain / exposure | Loopback mapping observed; gateway/private-endpoint acceptance not reached. TLS N/A. |

## 11–15. Required proof sequence

| Step | Result |
|---|---|
| First complete health gate | BLOCKED at foundation prerequisite |
| Unchanged reconcile and verify | BLOCKED; no first successful gate |
| Guarded teardown | PASS as investigation cleanup, not proof of the successful sequence |
| Clean recreation after successful reconcile | BLOCKED; not attempted; fresh diagnostic bootstrap is not a substitute |
| Second complete health gate | BLOCKED; not reached |

## 16. Tests and exact commands

Requested `node --check` commands for main, manifests, smoke, safety and capture
scripts all exited 0. Added foundation syntax also passed; main/foundation syntax
was checked again after diagnostic changes.

| Command | Working directory | Result |
|---|---|---|
| `node --test scripts/staging/safety.test.cjs` | Root | Exit 0; 25 passed, 0 failed |
| `npm run test:migration:contract` | `services/control-plane-api` | Exit 0; contract checks passed, no numeric count reported |
| `npm run test:security` | `services/control-plane-api` | Exit 0; 98 passed, 0 failed |
| `npm run lint` | `services/control-plane-api` | Exit 0 |
| `node scripts/staging/main.cjs bootstrap` | Root | Exit 1 at foundation gate; child Kind command exit 0 |
| `node scripts/staging/main.cjs diagnose-bootstrap` | Root | Two captures, exit 0; earlier capture archived |
| `node scripts/staging/main.cjs down` | Root | Exit 0; guarded cleanup PASS |

Exact lifecycle subprocess arguments/exit codes are in `artifacts/staging/runs/`.
Diagnostics retain the core log/metric commands and outputs. No Secret values,
passwords, private keys, JWT signing material or kubeconfig contents are evidence.

## 17. Evidence, identity and versions

Target remains local Docker Desktop/Kind, cluster/network/namespace `phase2-staging`,
context `kind-phase2-staging`, localhost port 31082. No target override was used.

- Deployment UUID: `ef4c16c4-5d78-4318-99d2-5a86cadef905`.
- Full fingerprint: `a4b738e3821ce463522304a67bf73da21881ed0851d0d1ac20fe57e5e14ea429`.
- Bootstrap source: `source-sha256:39154c81acca542c7e4d8fdbf5d2a13f83546704dba1d501556f46cf850fed90`.
- `artifacts/staging/bootstrap/ef4c16c4-5d78-4318-99d2-5a86cadef905/result.json`.
- Same bootstrap directory: `diagnostics.json`, archived `diagnostics-before-*.json`.
- `artifacts/staging/a4b738e3821ce463522304a67bf73da21881ed0851d0d1ac20fe57e5e14ea429/foundation-2026-09-27T03-32-17-179Z-bootstrap.json`.
- Same fingerprint directory: `manifest.json`, `teardown.json`.
- `artifacts/staging/resolution-tests.json`, `summary.json`, and `runs/`.

No application deployment.json was rendered/applied in this attempt. Its hash is
null, not borrowed from an earlier attempt. Node/network IDs, namespace UID,
observed system image IDs and revisions are retained. Later diagnostic-only source
changes are distinguished from the actual bootstrap revision.

Observed tools: Docker Engine 29.8.0 / Desktop 4.91.0, Kind 0.33.0, kubectl 1.36.1,
Node.js 24.19.0. The selected node remains Kubernetes 1.36.1 at its unchanged pinned
digest. No current live application dependency version is claimed.

## 18. Acceptance matrix

| # | Requirement | Current evidence | Status |
|---|---|---|---|
| 1 | Separate staging environment exists | Fresh foundation and namespace created, then removed | PASS |
| 2 | Separate staging network/boundary exists | Fresh owned bridge and separate kubeconfig | PASS |
| 3 | Dedicated PostgreSQL exists | Not deployed | BLOCKED |
| 4 | PostgreSQL private | No current endpoint verification | BLOCKED |
| 5 | Dedicated Redis exists | Not deployed | BLOCKED |
| 6 | Redis private | No current endpoint verification | BLOCKED |
| 7 | Dedicated object storage exists | Not deployed | BLOCKED |
| 8 | Object storage staging-isolated | No signed operation proof | BLOCKED |
| 9 | Dedicated registry exists | Not deployed | BLOCKED |
| 10 | Registry staging-isolated | No authenticated push/pull proof | BLOCKED |
| 11 | Disposable Kubernetes exists | Fresh Kind create exited 0 | PASS |
| 12 | Namespace isolation verified | Namespace identity exists; application isolation not exercised | BLOCKED |
| 13 | RBAC least privilege verified | Zero current application identity checks | BLOCKED |
| 14 | NetworkPolicies deployed and verified | Application policies/traffic tests not reached | BLOCKED |
| 15 | Environment-specific credentials used | Application generation not reached | BLOCKED |
| 16 | Production credentials not reused | Generated local Kind identity, no external credential inputs | PASS |
| 17 | Environment-specific encryption keys | Current application generation not reached | BLOCKED |
| 18 | Environment-specific audit keys | Current application generation not reached | BLOCKED |
| 19 | Staging local domain works | Gateway not deployed/tested | BLOCKED |
| 20 | TLS where configured | Documented localhost mode has no TLS | N/A |
| 21 | Fingerprint exists | Full identity checked by down | PASS |
| 22 | Unknown target rejected | Current negative tests | PASS |
| 23 | Production target rejected | Current negative tests | PASS |
| 24 | Customer target rejected | Current negative tests | PASS |
| 25 | Requests defined | Definitions preserved; current application not reached | BLOCKED |
| 26 | Limits defined | Definitions preserved; current application not reached | BLOCKED |
| 27 | Appropriate PDB or justified N/A | Disposable single-node/single-replica topology | N/A |
| 28 | Probes work | Application probes not exercised | BLOCKED |
| 29 | Platform workloads healthy | Foundation gate failed | BLOCKED |
| 30 | Telemetry/admin endpoints private | Full exposure verification not reached | BLOCKED |
| 31 | Exact component versions recorded | System observations retained; dependency versions unavailable | BLOCKED |
| 32 | Deployment manifests recorded | Application deployment.json not produced this attempt | BLOCKED |
| 33 | Empty-state provisioning works | Kind passed; complete provisioning blocked | BLOCKED |
| 34 | Provisioning reproducible | Required sequence not achieved | BLOCKED |
| 35 | Safely repeatable provisioning | Successful unchanged reconcile not reached | BLOCKED |
| 36 | Health gate works | Foundation rejection proven; positive full gate unavailable | BLOCKED |
| 37 | Negative safety tests pass | 25 passed, zero failed | PASS |
| 38 | Teardown guarded | Current down exit 0; unrelated inventories preserved | PASS |
| 39 | Teardown rejects production/customer | Current target/ownership negative tests | PASS |
| 40 | Clean recreation succeeds | Required post-success recreation not reached | BLOCKED |
| 41 | Production rejects unsafe credentials | Current 98-test security suite | PASS |
| 42 | Machine-readable release evidence exists | Current explicitly BLOCKED evidence | PASS |
| 43 | No Phase 2 blocker remains | Stable foundation and full sequence unavailable | BLOCKED |

## 19. Remaining limitations and minimum next condition

The host must provide CPU/memory and backing-storage responsiveness sufficient for
etcd/API requests to meet their existing deadlines, first with the foundation alone,
then with headroom for the documented application budgets. A precise RAM increase
or hardware upgrade is not proven as a remedy. Increasing only Docker allocation
on a Windows host with little free memory is not an established fix.

Resolve host contention or provide a suitable approved local Docker environment
before rerunning the original sequence. No global setting, unrelated container,
timeout, security policy or acceptance criterion was relaxed. The detailed split
between host paging, storage and scheduling remains unproven.

## 20. Phase 3 / Phase 4 boundary

No Phase 3 concurrency/recovery/backup/restore/DR certification was performed.
No Phase 4 customer repository/build/scan/SBOM/sign/promotion/deploy/admission/
preview/rollback flow was implemented or executed. Existing historical-phase
security tests remain regressions only. No production/cloud/customer-cluster,
HA or load/soak certification is claimed.
