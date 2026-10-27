> **Latest run — 2 October 2026:** FOUNDATION QUALIFICATION BLOCKED. One Kind node-preparation failure; gate NOT REACHED (0/3); protected resources unchanged; failed foundation retained. See “Controlled Foundation Qualification” below. Earlier results are historical.

# Phase 2 controlled re-validation — 2026-09-28 local / 2026-09-27 UTC

**Latest ownership update:** the separately authorized reconciliation below has
resolved the stale-metadata prerequisite. See **Stale Ownership Reconciliation**.
The preceding re-validation results and 43-item matrix remain historical results
of that run; no new foundation/application acceptance is implied. The complete
pre-update report is preserved as `phase2-staging-pre-reconciliation-2026-09-28.md`.

## Executive summary

**PHASE 2 — BLOCKED.** The empty-state prerequisite failed before any new
foundation attempt. The prior staging node, network and node volume are absent,
but `bootstrap-state.json` and `pending.json` still refer to that deployment.
The existing guarded cleanup exited 1 on node inspection. Per the current task's
explicit empty-state stop rule, no bootstrap, application deployment, ad-hoc
deletion, ownership-file removal or workaround was performed.

Foundation: BLOCKED; gate: NOT REACHED; attempts: **0**; samples: **0/3**.
Cleanup: FAIL (ownership state unresolved). Protected-resource safety: PASS.
All 19 current containers, 22 volumes, 10 networks and the active `platform-local`
identity are unchanged across this run. No causal conclusion about the earlier
Kind instability is established: **ROOT CAUSE NOT ISOLATED**.
Acceptance: **8 PASS / 33 BLOCKED / 2 N/A**. No Phase 2 completion claim.

## Current repository and report authority

This is an extracted workspace without Git metadata. `git status --short`,
`git diff --stat` and relevant diff inspection were attempted before writes;
Git reported that this is not a repository. No Git repository was initialized
and no reset, checkout, clean or unrelated file change was made. Git command
evidence is in `git-state.json`; source-content hashes provide the local
comparison boundary. Initial sandbox-limited child-process captures are retained
separately rather than treated as successful Git or syntax evidence.

The old `phase2-staging-report.md` described an earlier Kind-success/gate-failure
run with successful cleanup and 13/28/2 totals. It is preserved byte-for-byte as
`docs/phase2-staging-blocker-resolution-2026-09-27.md`. The newer
`docs/phase2-foundation-host-correction-validation.md` describes the 08:55 UTC
attempt, 300.246-second timeout, scheduler replacement and failed cleanup.
Those reports describe different attempts; the older EMPTY/PASS cleanup state
must not override the newer failure. All prior qualification evidence and the
two foundation reports are preserved.

The current read-only inspection supersedes both for current inventory: the old
staging resources have disappeared, but their ownership records remain. Five
Catalo containers and `catalo_default` are also absent relative to the previous
qualification, **already at this run's initial inspection**. Their removal time,
actor and reason are unknown. This task did not remove or stop them. Current
preservation compares this run's before/after inventories, not the older run.

The existing runbook, target, lifecycle, safety/foundation helpers, tests,
manifests, Dockerfile, capture/summarization scripts and package scripts were
reviewed. `scripts/phase2-acceptance.sh` drives GitHub/customer repository and
preview/rollback workflows; despite its filename it is OUT OF SCOPE — PHASE 3/4
for this request and was not executed. The staging runbook is unchanged because
no implementation or procedure was changed. The new user prompt conditionally
permits later application work after a foundation PASS, but that prerequisite
was not reached.

## Current staging state and empty-state proof

Recorded stale deployment UUID: `e1fa939b-5894-470b-91f4-c574e119d90f`.
Daemon: `999fd370-edd4-42cc-b047-589d7adcf226`, context `desktop-linux`, endpoint
`npipe:////./pipe/dockerDesktopLinuxEngine`.

| Identity | Current observation |
| --- | --- |
| Node `phase2-staging-control-plane` / `f69dc40a1e59c62fb501a961be5a3900973dc09707c6a1f434c07a52cf1e09d3` | Absent; bounded inspect exit 1 and inventory absence |
| Network `phase2-staging` / `985f2e508c038f9081bc28a088cef88e4cad25980dc4e776ed10d012b65ace22` | Absent; bounded inspect exit 1 and inventory absence |
| Node volume `84d80134dc40906591585cd5f41aff85958c6080b290572ffc4b810d5ca06326` | Absent; bounded inspect exit 1 and inventory absence |
| Kind clusters | Only `platform-local` |
| Full `.local/phase2-staging/state.json` | Absent |
| Bootstrap/pending ownership records | Present and unchanged; reference removed resources |
| Historical bootstrap fingerprint | `ff923b4dc55ec5112084d549aaf0834066c0dad68950eb78110f2c340df3cede`; validates offline against current daemon, not a live environment |
| Staging application resources | No staging cluster/node; no application deployment performed in this run |

The host collector reports `stagingEmpty=true` because its definition tests Docker
node/network absence. That does **not** satisfy this prompt's additional clean
ownership-state requirement. The composite empty-state gate remains BLOCKED.
No historical namespace UID was substituted for a live identity, and no protected
cluster API was queried to search for staging workloads.

## Protected environment inventory and comparison

`platform-local-control-plane` is RUNNING, ID
`00091e020a360eb9b2dab06827f18463cc406aba3f868d2d621669948069c2a0`, restart count 0,
started `2026-09-23T19:15:02.908879729Z`. Its image is
`kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5`.
Its network is `kind`, ID
`14ecd0c16dd36643b5643886752af222bab96f450b192a72f316c1d4f5dfaa48`; `/var` volume
is `4a60547585357046f5223f21cc0282eea399a0f3217a49e4dd0df2fd4c16e143`.
Image ID, state, mount, network/endpoint identity and Kind cluster list compare
exactly in `protected-before.json` and `protected-after.json`.

The host collector independently verifies all current container states/start and
finish times/restart counts, baseline volumes/networks, daemon resources, settings
hashes and selected application/security hashes. Additional protected hashes cover
all staging lifecycle/config files and the runbook. All compare unchanged.
Safety PASS is scoped to preservation and guard enforcement; it is **not** a claim
that cleanup succeeded or the composite empty-state gate passed.

## Host, Docker and WSL pre-flight

All times here are UTC. Before capture: **18:38:33.179–18:40:01.428**;
after capture: **18:41:16.376–18:42:49.549**. Each underlying command records its
own timestamp and duration. After measurements overlap local regression testing;
they are not a bootstrap or failure-window sample.

| Metric | Before | After |
| --- | --- | --- |
| Windows available memory, CIM commit sample | 740 MiB | 565 MiB |
| Windows commit | 91%; 21,028,761,600 bytes | 93%; 21,527,638,016 bytes |
| Commit limit | 23,036,641,280 bytes | Same |
| Pagefile use | 3,851 MiB | 3,979 MiB |
| CPU, three samples | 35.06–53.30% | 54.11–82.01% |
| Disk average transfer latency | 0.193–0.368 ms | 0.231–8.017 ms |
| Disk queue | 0, 0, 0 | 0, 1, 2 |
| Pages input/sec, three samples | 6,763–18,389 | 2,595–9,047 |
| Docker system df duration | 26.210 s, exit 0 | 35.004 s, exit 0 |

Windows has 16 logical CPUs and 8,085,560 KiB usable physical memory. Docker
exposes 16 CPUs and 3,951,235,072 bytes VM memory. WSL baseline MemAvailable is
1,843,824 KiB; swap use is 277,312 KiB of 1,048,576 KiB. CPU/memory/I/O PSI
`some avg60` values are 8.45%, 0%, 0.57%. They are stall averages, not CPU usage.
Version, distro state, disk free-space and bounded Docker stats are retained in
the raw baseline. No diagnostic timeout is hidden or interpreted as zero.
These measurements establish current conditions; no fresh failed foundation
exists against which to correlate them.

## Foundation timeline and cleanup

| UTC | Event |
| --- | --- |
| 18:38:33.179 | New host/safety baseline starts |
| 18:39:57.573–18:40:00.064 | Protected cluster and absent stale-resource identities captured |
| 18:40:01.428 | Host baseline completes |
| 18:40:14.826 | Existing cleanup calls `docker inspect phase2-staging-control-plane`, exit 1 |
| Following that refusal | Cleanup exits 1; no delete command is issued; bootstrap is not invoked |
| 18:42:49.572 | Resource-preservation collector PASS |
| 18:42:56.263–18:42:59.767 | Protected-cluster and local-ownership comparison capture |

Current first failure: cleanup cannot inspect the absent recorded node. Exact
component: local ownership/lifecycle prerequisite, before Kind creation. The
existing cleanup requires the live node before reaching fingerprint and network
validation; pending cleanup also cannot succeed with its expected network absent.
No speculative fix to those paths was made. The prompt explicitly says to stop
when guarded cleanup cannot establish the required live ownership.

Kind start/end/result: NOT REACHED. New deployment UUID/fingerprint: none.
New etcd/API/scheduler/controller-manager readiness, restart counts, leadership,
cgroup throttling and OOM evidence: unavailable because no staging node exists.
There is no current first slowdown, deadline, leadership loss or restart to report.

Historical context only: the 08:55 UTC prior attempt timed out after 300.246 s;
its scheduler acquired a lease at 08:58:11.796, lost it at 09:01:06.300 and had an
attempt-1 replacement. Prior API etcd Range deadlines and a 2.1289-second etcd range
are recorded. Prior commit mean 86.19 ms and WAL mean 31.10 ms had p99 histogram
buckets (512,1024] ms and (256,512] ms respectively. These are not exact p99 values
and are not measurements from this run. The precise first causal event in that
historical bootstrap is not isolated from bounded tail logs.

## Diagnostic hypothesis matrix and root cause

No controlled attempt was allowed after the empty-state refusal. The matrix
therefore documents hypotheses for the deferred attempt and expressly marks its
during/failure window as NOT REACHED. It is not represented as a pre-attempt matrix
for an experiment that actually occurred. Machine-readable before/during/after,
supporting/against/unresolved evidence and confidence are in `hypotheses.json`.

| ID | Hypothesis | Classification | Before/supporting evidence | During / against / unresolved |
| --- | --- | --- | --- | --- |
| H1 | Windows memory pressure | SUPPORTED | 740 MiB available in baseline CIM; 472–536 MiB in adjacent samples | No attempt; Condition observed, not isolated as a cause; no new foundation ran |
| H2 | Windows commit/pagefile pressure | SUPPORTED | 91% baseline commit; 3851 MiB pagefile; paging observed | No attempt; After 93% commit; no concurrent foundation failure window |
| H3 | CPU scheduling pressure | POSSIBLE | 35.06–53.30% baseline CPU; VM CPU PSI avg60 8.45% | No attempt; No failed bootstrap in this window; unrelated load not controlled |
| H4 | Docker VM memory pressure | NOT ISOLATED | VM MemAvailable 1843824 KiB; memory PSI avg60 zero at baseline | No attempt; No current OOM/cgroup evidence from absent staging node |
| H5 | WSL pressure/swap | POSSIBLE | 277312 KiB swap used; read-only WSL PSI retained | No attempt; Swap use does not prove active paging caused past failure |
| H6 | Docker VHDX/filesystem latency | NOT ISOLATED | Baseline Windows transfer latency 0.193–0.368 ms; Docker df took 26.210 s | No attempt; No staging filesystem exists; host counters do not isolate VHDX latency |
| H7 | etcd persistence latency | SUPPORTED | Historical 2026-09-27 run: commit mean 86.19 ms; WAL mean 31.10 ms; slow Range | No attempt; Historical symptom only; no fresh etcd metrics |
| H8 | Kind/Kubernetes bootstrap behavior | SUPPORTED | Historical create timed out at 300.246 s despite internal Ready milestone | No attempt; Current attempt blocked by stale local ownership; prior timeout cause not isolated |
| H9 | Repository/application defect causing foundation failure | NOT SUPPORTED | No staging application deployed in historical failure; current regression tests pass | No attempt; A separate stale-state cleanup limitation is observed, not proven cause of prior etcd/Kind failure |

Current blocker is established: unresolved local ownership records and no supported
successful cleanup path exercised. This is distinct from the underlying earlier
foundation instability, whose CPU/memory/paging/storage split remains NOT ISOLATED.
No blame is assigned to Catalo, image count, Kind, application code or a single
host resource. No host-setting correction is supported as a proven remedy here.

## Changes and tests

Runtime/application code changes: **NONE**. No lifecycle, gate, timeout, version,
manifest, probe, resource budget, RBAC, NetworkPolicy or global setting changed.
Updated `docs/phase2-staging-report.md`; preserved the prior report at
`docs/phase2-staging-blocker-resolution-2026-09-27.md`. The runbook is unchanged.
New timestamped evidence includes two local evidence-only helpers,
`capture-protected.cjs` and `build-report.cjs`, plus a report source template;
they do not replace the lifecycle or alter acceptance behavior.

| Command | Result | Duration evidence |
| --- | --- | --- |
| `node --test scripts/staging/safety.test.cjs` | Exit 0, 25 PASS / 0 FAIL | Runner 736.71 ms |
| `npm run test:migration:contract` in control-plane-api | Exit 0, contract checks passed | Observation upper bound 150.066 s, includes queue/polling; exact process duration unavailable |
| `npm run test:security` in control-plane-api | Exit 0, 98 PASS / 0 FAIL | Mocha suite 980 ms; launch observation includes queue/polling |
| `npm run lint` in control-plane-api | Exit 0 | Observation upper bound 150.068 s, includes queue/polling; exact process duration unavailable |
| Eight `node --check` commands listed in `syntax-checks.json` | All exit 0 | 159–202 ms each |
| `node scripts/staging/main.cjs cleanup-bootstrap` | Exit 1; no mutation issued | Exact subprocess time in lifecycle run; tool elapsed about 2 s |
| Host collector before/after | Both exit 0 | 88.249 s / 93.173 s |
| Protected capture before/after | Both exit 0 | 2.491 s / 3.504 s |

Initial sandbox-blocked child-process syntax captures are preserved separately;
approved reruns passed. The existing security suite includes historical Phase 3
fixture names; these are requested local regression tests, not Phase 3 execution
or certification. No durability/database integration, load, customer repository,
cloud, preview, recovery or deployment acceptance suite ran.

## 43-item acceptance matrix

Every BLOCKED item depends on the unresolved repository/local lifecycle-state
prerequisite, followed by the unchanged foundation and applicable live checks.
The earlier runtime cause remains unisolated. Historical positive deployment
results are not carried into current acceptance. N/A items use the unchanged
documented topology; PASS items use current tests, command boundaries and evidence.

| # | Requirement | Status | Evidence / blocker category | Next required proof |
| --- | --- | --- | --- | --- |
| 1 | Separate staging environment exists | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Complete registered staging provisioning |
| 2 | Separate staging network/boundary exists | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Fresh owned staging boundary and namespace |
| 3 | Dedicated PostgreSQL exists | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Deploy and verify dedicated PostgreSQL |
| 4 | PostgreSQL private | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Verify live PostgreSQL endpoint privacy |
| 5 | Dedicated Redis exists | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Deploy and verify dedicated Redis |
| 6 | Redis private | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Verify live Redis endpoint privacy |
| 7 | Dedicated object storage exists | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Deploy and verify dedicated object storage |
| 8 | Object storage staging-isolated | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Signed isolated object operations |
| 9 | Dedicated registry exists | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Deploy and verify dedicated registry |
| 10 | Registry staging-isolated | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Authenticated isolated push/pull digest proof |
| 11 | Disposable Kubernetes exists | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Successful fresh Kind create and foundation stability gate |
| 12 | Namespace isolation verified | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Live namespace and application isolation checks |
| 13 | RBAC least privilege verified | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | All live least-privilege checks |
| 14 | NetworkPolicies deployed and verified | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Required and forbidden live traffic checks |
| 15 | Environment-specific credentials used | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Fresh isolated credential generation and use |
| 16 | Production credentials not reused | PASS | No production credential inputs or external target operations; local-only commands and read-only evidence | Satisfied for stated scope |
| 17 | Environment-specific encryption keys | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Fresh application encryption-key generation/use |
| 18 | Environment-specific audit keys | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Fresh application audit-key generation/use |
| 19 | Staging local domain works | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Live loopback staging route health |
| 20 | TLS where configured | N/A | Unchanged documented local HTTP mode; TLS not configured | N/A while documented topology is unchanged |
| 21 | Fingerprint exists | BLOCKED | Historical bootstrap fingerprint validates offline but has no current live node/namespace; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | New live fingerprint validated against namespace/node/daemon |
| 22 | Unknown target rejected | PASS | Current negative unknown-target test PASS | Satisfied for stated scope |
| 23 | Production target rejected | PASS | Current negative production-target test PASS | Satisfied for stated scope |
| 24 | Customer target rejected | PASS | Current negative customer-target test PASS | Satisfied for stated scope |
| 25 | Requests defined | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Current workload requests recorded and checked |
| 26 | Limits defined | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Current workload limits recorded and checked |
| 27 | Appropriate PDB or justified N/A | N/A | Unchanged disposable single-node/single-replica topology; PDB omission justified in runbook | N/A while documented topology is unchanged |
| 28 | Probes work | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Live startup/readiness/liveness proof |
| 29 | Platform workloads healthy | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | All platform workloads healthy |
| 30 | Telemetry/admin endpoints private | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Live admin/telemetry exposure verification |
| 31 | Exact component versions recorded | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Record current system and deployed dependency versions |
| 32 | Deployment manifests recorded | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Record actual rendered/applied deployment manifests |
| 33 | Empty-state provisioning works | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Provision completely from verified clean ownership state |
| 34 | Provisioning reproducible | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Complete successful reproducibility sequence |
| 35 | Safely repeatable provisioning | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Unchanged reconcile and health proof |
| 36 | Health gate works | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Complete positive health gate plus refusal checks |
| 37 | Negative safety tests pass | PASS | Current safety/foundation suite: 25 PASS, 0 FAIL | Satisfied for stated scope |
| 38 | Teardown guarded | BLOCKED | Current cleanup exit 1; node inspection fails before mutation; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Successful guarded cleanup and clean local ownership state |
| 39 | Teardown rejects production/customer | PASS | Current target/ownership negative tests PASS; refused cleanup issues no deletion | Satisfied for stated scope |
| 40 | Clean recreation succeeds | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | Successful clean recreation after first health/reconcile sequence |
| 41 | Production rejects unsafe credentials | PASS | Current security suite: 98 PASS, including production credential rejection | Satisfied for stated scope |
| 42 | Machine-readable release evidence exists | PASS | Current timestamped evidence and this explicitly BLOCKED summary | Satisfied for stated scope |
| 43 | No Phase 2 blocker remains | BLOCKED | No current staging deployment or successful foundation gate; historical acceptance not substituted; Repository/local lifecycle-state prerequisite; earlier foundation runtime cause NOT ISOLATED | All applicable requirements proven |

## Evidence and exact next step

Current evidence root: `artifacts/staging/qualification/2026-09-27T18-38-33-171Z/`.
It contains `before.json`, `after.json`, `protected-before.json`,
`protected-after.json`, `safety.json`, `summary.json`, `acceptance.json`,
`hypotheses.json`, `tests.json`, `syntax-checks.json`, `git-state.json` and audit
helper/template files. No fabricated during/bootstrap/etcd result was generated.
Cleanup invocation:
`artifacts/staging/runs/2026-09-27T18-40-14-824Z-cleanup-bootstrap.json`.
Historical qualification reference:
`artifacts/staging/qualification/2026-09-27T08-53-20-302Z/summary.json`.

**One next action:** review and authorize a guarded stale-ownership reconciliation
procedure for deployment `e1fa939b-5894-470b-91f4-c574e119d90f` that verifies the
daemon, recorded resource IDs and their absence, preserves the metadata as audit
history, and then proves clean ownership state. Do not delete metadata by hand or
create another cluster while it remains unresolved. This run does not apply such
a change because the explicit empty-state refusal rule requires stopping.

Self-audit: no unrelated container/cluster/image/network/volume touched; no prune
or wildcard delete; no global Docker/WSL changes; no weakened guard, timeout,
policy or probe; zero bootstrap attempts; no applications; no causal overclaim;
prior reports preserved; protected invariance proven; cleanup failure explicit.
Clean recreation and second health gate: NOT REACHED. Phase 3 and Phase 4:
**NOT STARTED — OUT OF SCOPE**.

## Stale Ownership Reconciliation

Completed 2026-09-28 local (2026-09-27 19:08 UTC), under separate authorization
limited to metadata for deployment `e1fa939b-5894-470b-91f4-c574e119d90f`.
**STAGING OWNERSHIP STATE: CLEAN. PHASE 2 FOUNDATION: NOT RUN.**
Phase 2 remains **BLOCKED / READY FOR NEXT QUALIFICATION**, not COMPLETE.

### Historical identity and evidence

- Daemon `999fd370-edd4-42cc-b047-589d7adcf226`, verified against live Docker
  Desktop `desktop-linux` at `npipe:////./pipe/dockerDesktopLinuxEngine`.
- Node `phase2-staging-control-plane`, ID
  `f69dc40a1e59c62fb501a961be5a3900973dc09707c6a1f434c07a52cf1e09d3`.
- Network `phase2-staging`, ID
  `985f2e508c038f9081bc28a088cef88e4cad25980dc4e776ed10d012b65ace22`.
- Node volume `84d80134dc40906591585cd5f41aff85958c6080b290572ffc4b810d5ca06326`.
- Original creation `2026-09-27T08:55:03.453Z`; bootstrap-only scope, no registered
  namespace UID; fingerprint
  `ff923b4dc55ec5112084d549aaf0834066c0dad68950eb78110f2c340df3cede`.

The bootstrap fingerprint validated using the existing ownership model. Removing
only its bootstrap-specific fields produced an exact match to the pending record,
including UUID, daemon, source revision, creation time and original baseline.
Neither file records a volume ID directly: provenance was established from the
preserved `2026-09-27T08-53-20-302Z/retained-node.json`, matching the exact node,
cluster and network IDs and its sole `/var` volume. The volume was absent from
the original pre-creation baseline. Its provenance file hash is recorded.

Repeated bounded scans found no node/network by either exact name or recorded ID,
and no recorded volume. Explicit inspect commands returned recognized not-found
errors, not timeouts or permission failures. Complete inventories additionally
exclude reused names, replacement Kind cluster labels, deployment-label conflicts,
network references and volume consumers on every current container. Inventories
were resampled to detect changes during collection. No active full state existed.

### Mechanism and audit preservation

The existing live-resource cleanup helpers were left unchanged. New narrow helper
`scripts/staging/reconcile-stale.cjs` supports `check` and `apply` for this approved
deployment only. Validation and archive logic are in `scripts/staging/stale-ownership.cjs`.
It performs only read-only Docker calls; it never invokes Kind or Kubernetes.
Kind inventory comes from Docker's cluster labels, honoring the instruction not
to run Kind. Only `platform-local` is present.

The helper requires two agreeing before/precommit inventories before transitioning
metadata. It writes an exclusive audit intent, moves `pending.json` first and
`bootstrap-state.json` last, verifies exact bytes and writes an exclusive receipt.
Keeping the bootstrap record until last preserves the existing creation interlock.
Partial or conflicting archives stop for review rather than being overwritten.

Both original records now reside intact in:
`.local/phase2-staging/reconciled-stale-e1fa939b-5894-470b-91f4-c574e119d90f/`.
That directory also contains `intent.json` and `receipt.json`. Their content hashes:

| Original record | SHA-256 before and after |
| --- | --- |
| bootstrap-state.json | `4034884a63a9e9925d92a682f89a44f5c5d45d4fce0c0ead4fd9e1feacacb28b` |
| pending.json | `d68b6e11b1cd189b814aee233c8661950cbb18d7982fcee5b3267a985a89a38f` |

Neither active record remains; `state.json` is absent. No metadata was truncated,
emptied, rewritten with another UUID or discarded. Existing historical evidence
was not overwritten.

### Execution, idempotency and safety

Evidence base:
`artifacts/staging/reconciliation/e1fa939b-5894-470b-91f4-c574e119d90f/`.

| Invocation directory | Command | Result |
| --- | --- | --- |
| 2026-09-27T19-05-48-949Z-check | `node scripts/staging/reconcile-stale.cjs check` | Exit 0; ELIGIBLE; metadata still STALE |
| 2026-09-27T19-07-45-224Z-apply | `node scripts/staging/reconcile-stale.cjs apply` | Exit 0; RECONCILED; CLEAN; receipt at 19:07:57.461 UTC |
| 2026-09-27T19-08-18-302Z-apply | Same command again | Exit 0; ALREADY_RECONCILED; CLEAN; completed 19:08:36.296 UTC |

The second invocation performed fresh live checks and verified archive hashes
without changing the archive or receipt. Each invocation retains timestamped
`commands.json`, `protected-before.json`, `precommit.json`, `protected-after.json`,
`ownership-proof.json` and `result.json`. The base contains `summary.json` and
`tests.json`, linking those artifacts and the receipt.

**SAFETY PASS / PROTECTED RESOURCES UNCHANGED.** Full comparison across eligibility,
first apply and second apply matches all 19 containers, 10 networks, 22 volumes,
Docker daemon/context, relevant settings hashes and cluster inventory. The active
`platform-local-control-plane` retains its exact ID, image, state/start time,
restart count, network/endpoint and volume identities recorded above in this report.
No unrelated container, image, network or volume was modified or deleted.
Docker mutations: 0. Kind commands: 0. Bootstrap attempts: 0.

### Tests and files changed

`node --test scripts/staging/safety.test.cjs scripts/staging/stale-ownership.test.cjs`:
**55 passed, 0 failed** (25 existing safety/foundation tests plus 30 reconciliation
tests; final runner duration 510.6256 ms). Tests cover all ten requested negative
cases, unavailable diagnostics, incomplete scans, historical provenance, partial
archives, changed metadata, archive tampering and repeated invocation. Existing
safety tests were not weakened. Three changed/new JS syntax checks passed.
ESLint recommended rules with Node globals/CommonJS parsing passed on all three
files. Initial unused-variable lint errors were fixed and tests rerun; the existing
repository `.eslintignore` deprecation warning was not changed. No application
code changed, so the full application security suite was not rerun; existing
production credential/target rejection tests ran as part of the safety suite.

Repository files added/changed:

- `scripts/staging/reconcile-stale.cjs` — exact-deployment live proof and CLI.
- `scripts/staging/stale-ownership.cjs` — refusal checks and auditable state transition.
- `scripts/staging/stale-ownership.test.cjs` — negative and archive/idempotency tests.
- `docs/phase2-staging-runbook.md` — narrow reconciliation procedure.
- `docs/phase2-staging-report.md` — this appended outcome and latest-update notice.
- `docs/phase2-staging-pre-reconciliation-2026-09-28.md` — previous report preserved.

Git status/diff remained unavailable because the workspace has no Git metadata.
No existing lifecycle safety, foundation gate, target, image pin, application file,
timeout or host setting was changed. The original foundation root cause remains
unisolated; this task resolves only stale ownership state.

**Next action:** run one separately authorized controlled foundation qualification
with a fresh host baseline. No foundation or application work was run in this task.


# Controlled Foundation Qualification

**FINAL STATUS: FOUNDATION QUALIFICATION BLOCKED.** One authorized attempt failed during Kind node preparation. The unchanged three-sample foundation gate was **NOT REACHED (0/3)**. No application provisioning or Phase 3/4 work ran. This section is authoritative for the current run; preceding results and the previous 43-item matrix remain historical.

## Date/time and identity

Run date: 2 October 2026 (Asia/Calcutta). Host baseline: 02/10/2026, 16:46:54 IST to 02/10/2026, 16:49:09 IST. Lifecycle: 02/10/2026, 16:49:53 IST to 02/10/2026, 16:53:41 IST. Raw evidence timestamps are UTC.

- Deployment UUID: `2cf85f7b-f2a7-47c3-be8e-3190d684c6ef`.
- Bootstrap fingerprint: `371cacb9517423cbab42e0c0d54db22f9b1394c90aabbaee4b076ba9aadcb966`.
- Docker context: `desktop-linux`; daemon: `999fd370-edd4-42cc-b047-589d7adcf226`; endpoint: `npipe:////./pipe/dockerDesktopLinuxEngine`.
- Node: `87280fae60309e58f1444939363dbca619f13e61605c83f72e5bac137806f073`; network: `8e6ee13511bfa254b2da5c1ebd890688e19e43758ad217a444aeade4b13f1be3`.
- Owned node volume: `18af9d4e25dc1530cabbe050aa9744d2cb1143d8159783dbdfc52d430e55e4ec`.
- Source boundary: `source-sha256:c88a8df477989cf30ffe693975539f3cb1f815d7b9cc1b5d717ab7ffead79e82` (116 files); before/after hashes identical. Git metadata is unavailable; no Git initialization/reset/checkout/clean occurred.

## Protected baseline and empty-state proof

The existing read-only reconciliation **check**, not apply, returned ELIGIBLE / active ownership CLEAN / safety PASS. The archived stale UUID and original record hashes validated; active state.json, bootstrap-state.json and pending.json were absent before creation. Exact old node/network names and IDs and old volume returned recognized not-found responses; complete inventories excluded replacement names/labels/consumers. Only platform-local existed in the pre-run Kind inventory. The new UUID is different from the reconciled UUID.

Protected baseline: **19 containers, 5 running; 10 networks; 22 volumes**. Full container identity/state/start/finish/restart/mount/network data, network memberships, volume inventory, daemon/context and settings hashes compare unchanged after the run. platform-local container `00091e020a360eb9b2dab06827f18463cc406aba3f868d2d621669948069c2a0`, its kind network `14ecd0c16dd36643b5643886752af222bab96f450b192a72f316c1d4f5dfaa48`, endpoint, and /var volume `4a60547585357046f5223f21cc0282eea399a0f3217a49e4dd0df2fd4c16e143` are unchanged. Catalo volumes, n8n and all other baseline resources are preserved. No protected cluster API operations were performed.

## Fresh host baseline and resource pressure

Baseline completed **43.862 seconds** before bootstrap process start and **48.705 seconds** before deployment registration. No cleanup or host changes preceded the attempt.

| Metric | Before | During bootstrap | After / retained node |
| --- | --- | --- | --- |
| Available physical memory (MiB, CIM) | 280 | 590 | 454 |
| Commit percentage | 87% | 87% | 85% |
| Committed bytes | 20805513216 | 20905918464 | 20476600320 |
| Commit limit bytes | 23865950208 | 23865950208 | 23865950208 |
| Pagefile usage MiB | 5783 | 5801 | 5338 |
| CPU samples % | 59.544, 15.535, 14.136 | 92.685, 77.353, 83.49 | 88.231, 92.026, 92.802 |
| Disk transfer latency ms | 2.873, 4.145, 4.961 | 6.84, 3.486, 4.616 | 1.566, 0.523, 1.538 |
| Disk queue samples | 6, 7, 6 | 15, 26, 20 | 0, 4, 10 |
| Pages input/sec | 21606.313, 13548.432, 13428.848 | 38290.273, 32001.345, 51266.994 | 49060.822, 91684.702, 33964.416 |
| Docker system df | exit 0; 27512 ms | timeout; 45210 ms | timeout; 45068 ms |

Docker exposes **16 CPUs and 3,951,230,976 bytes VM memory**, Engine 29.8.0, overlayfs/containerd snapshotter and data root /var/lib/docker. Bounded stats, versions, disk space/data-root details, WSL distro state and settings hashes are retained. Direct baseline WSL runtime collection failed with Wsl/Service/0x8007274c after 30.270 seconds; it is explicitly unavailable. During/after WSL captures succeeded. During WSL MemAvailable was 1,711,844 KiB and swap use 240,088 KiB; CPU/memory/I/O some avg60 PSI were 44.75% / 11.75% / 4.50%. PSI measures stall time, not utilization.

Node cgroup diagnostics show unlimited CPU quota, zero throttled time, and zero OOM/OOM-kill events. Those observations do not exclude host scheduling, paging or storage delays. The historical etcd failures were not substituted for current evidence.

## Foundation creation, gate and diagnostics

The exact existing command was `node scripts/staging/main.cjs bootstrap`; one invocation, exit 1, duration **228108 ms**. Kind create started at 2026-10-02T11:19:59.366Z, recorded exit 1 at 2026-10-02T11:23:13.672Z (approximately 194306 ms to persisted result). This was **not** the outer 300-second timeout. Existing Kind wait, command timeout, image pin, gate and retry behavior were unchanged.

First meaningful qualification failure: **Preparing nodes — could not find a log line matching “Reached target .*Multi-User System.*|detected cgroup v1”.** The retained journal subsequently records Multi-User System at **11:23:27 UTC / 16:53:27 IST**, after failure was recorded at **11:23:13.672 UTC / 16:53:13.672 IST**. Systemd reports startup finished in 42.137 seconds. This later milestone does not turn failed Kind creation into success. No Kind defect or unique resource cause is established.

| Required proof | Current result |
| --- | --- |
| Kubernetes API reachable / readyz | NOT REACHED |
| Kubernetes Node Ready | NOT REACHED |
| Sample 1 | NOT REACHED |
| Sample 2 after 30 seconds | NOT REACHED |
| Sample 3 after 30 seconds | NOT REACHED |
| etcd health / stability / persistence metrics | NOT REACHED; metrics connection unavailable |
| Scheduler / controller-manager Ready | NOT REACHED |
| Restart / pod replacement / leadership stability | NOT REACHED; no core containers exist |

Both automatic and explicit runbook diagnosis succeeded as diagnostic actions. CRI inventories contain **zero containers**; kubelet was skipped because ConditionPathExists=/var/lib/kubelet/config.yaml was unmet. No staging namespace or full state.json was registered. No Kubernetes application or dependency was deployed. Evidence includes node boot/system journal, kubelet journal, network/listeners, cgroups, OOM counters, pressure, and the failed etcd request. Missing metrics are not zero or PASS.

**Classification: Kind bootstrap failure during node preparation. Underlying cause: NOT ISOLATED.** Host/WSL pressure is observed; this single experiment does not isolate memory, CPU, storage, Docker, Windows, WSL, Kind or repository defects as its cause.

## Safety and cleanup

**Protected-resource preservation: PASS.** Source boundary and settings are unchanged. Failed staging resources and valid bootstrap ownership are intentionally retained under this task's failure-stop instruction. **Cleanup: NOT TESTED / not invoked**; no cleanup success or clean final ownership is claimed. The repository after collector exited 1 with only **“Staging resources remain”**; its raw BLOCKED result is preserved as collector-safety.json. The independent protected comparison has no differences. These are separate conclusions, not a rewritten collector result. No guard was bypassed.

## Tests and evidence

- `node --test scripts/staging/safety.test.cjs`: exit 0, 25 PASS / 0 FAIL, measured process duration 640 ms.
- `node --test scripts/staging/stale-ownership.test.cjs`: exit 0, 30 PASS / 0 FAIL, measured process duration 915 ms.
- Eight relevant syntax checks: PASS; individual exit codes/durations in syntax-checks.json.
- Initial sandbox EPERM attempts are preserved separately; approved runs passed. No code/test changes were made. No additional post-run test is required by the runbook for this unchanged implementation.
- Explicit diagnose-bootstrap exit 0; underlying commands and timestamps are in lifecycle-records.json. Existing lifecycle records do not supply per-child durations; no durations are invented. Host collector and supplemental evidence retain command exit codes and measured durations.

Evidence root: `artifacts/staging/qualification/2026-10-02T11-07-29-304Z-controlled/`. Host collector originals: `artifacts/staging/qualification/2026-10-02T11-16-54-601Z/`. Bootstrap originals: `artifacts/staging/bootstrap/2cf85f7b-f2a7-47c3-be8e-3190d684c6ef/`. This directory retains before.json, during.json, after.json, protected-before.json, protected-after.json, host-baseline.json, foundation-command.json, kind-result.json, foundation-gate.json, diagnostics.json, node-boot-diagnostics.json, restart-leadership.json, resource-pressure.json, tests.json, syntax-checks.json, acceptance.json, hypotheses.json, safety.json, summary.json, self-audit.json and source-boundary records. Baseline WSL evidence is partial; control-plane evidence is explicitly NOT REACHED. The prior report is preserved byte-for-byte as prior-report.md; all earlier named reports remain unchanged.

## Current acceptance status — 43 items

**FOUNDATION PROVEN: none.** Test/scope PASS entries below do not certify the foundation. Application and workload checks are NOT TESTED; their overall Phase 2 acceptance remains BLOCKED pending separately authorized verification. No historical PASS was promoted to current foundation acceptance.

| # | Requirement | Current status |
| --- | --- | --- |
| 1 | Separate staging environment exists | BLOCKED |
| 2 | Separate staging network/boundary exists | BLOCKED |
| 3 | Dedicated PostgreSQL exists | NOT TESTED |
| 4 | PostgreSQL private | NOT TESTED |
| 5 | Dedicated Redis exists | NOT TESTED |
| 6 | Redis private | NOT TESTED |
| 7 | Dedicated object storage exists | NOT TESTED |
| 8 | Object storage staging-isolated | NOT TESTED |
| 9 | Dedicated registry exists | NOT TESTED |
| 10 | Registry staging-isolated | NOT TESTED |
| 11 | Disposable Kubernetes exists | BLOCKED |
| 12 | Namespace isolation verified | NOT TESTED |
| 13 | RBAC least privilege verified | NOT TESTED |
| 14 | NetworkPolicies deployed and verified | NOT TESTED |
| 15 | Environment-specific credentials used | NOT TESTED |
| 16 | Production credentials not reused | PASS |
| 17 | Environment-specific encryption keys | NOT TESTED |
| 18 | Environment-specific audit keys | NOT TESTED |
| 19 | Staging local domain works | NOT TESTED |
| 20 | TLS where configured | N/A |
| 21 | Fingerprint exists | BLOCKED |
| 22 | Unknown target rejected | PASS |
| 23 | Production target rejected | PASS |
| 24 | Customer target rejected | PASS |
| 25 | Requests defined | NOT TESTED |
| 26 | Limits defined | NOT TESTED |
| 27 | Appropriate PDB or justified N/A | N/A |
| 28 | Probes work | NOT TESTED |
| 29 | Platform workloads healthy | NOT TESTED |
| 30 | Telemetry/admin endpoints private | NOT TESTED |
| 31 | Exact component versions recorded | NOT TESTED |
| 32 | Deployment manifests recorded | NOT TESTED |
| 33 | Empty-state provisioning works | BLOCKED |
| 34 | Provisioning reproducible | BLOCKED |
| 35 | Safely repeatable provisioning | BLOCKED |
| 36 | Health gate works | BLOCKED |
| 37 | Negative safety tests pass | PASS |
| 38 | Teardown guarded | BLOCKED |
| 39 | Teardown rejects production/customer | PASS |
| 40 | Clean recreation succeeds | BLOCKED |
| 41 | Production rejects unsafe credentials | PASS |
| 42 | Machine-readable release evidence exists | PASS |
| 43 | No Phase 2 blocker remains | BLOCKED |

Item 41 PASS is limited to production credential-rejection cases exercised by the current safety suite; the full application security suite was NOT TESTED. Item 38 cleanup was NOT TESTED live; completed teardown acceptance remains BLOCKED. No full 43-item PASS or Phase 2 completion is claimed.

## Next authorized action and final self-audit

This qualification authorization is exhausted. Review the retained node-preparation diagnostics; any guarded cleanup/recovery and another qualification require a separate task. Application provisioning remains BLOCKED.

- freshHostBaseline: PASS; completed 43.862 seconds before lifecycle command start
- cleanOwnershipBeforeBootstrap: PASS
- freshIdentity: PASS
- platformLocalUntouched: PASS
- unrelatedResourcesUntouched: PASS
- noPrune: PASS
- noWildcardDeletion: PASS
- noGlobalDockerWslChanges: PASS
- noTimeoutGateOrSecurityWeakening: PASS; source hashes unchanged
- noApplicationDeployment: PASS
- noPhase3: PASS
- noPhase4: PASS
- currentRunEvidenceOnly: PASS
- threeSampleGate: NOT REACHED (0/3)
- firstMeaningfulFailure: PASS; Kind preparing-node boot marker failure
- protectedComparison: PASS
- machineReadableEvidence: PASS
- historicalReportsPreserved: PASS; prior-report.md exact byte copy
- honestFinalStatus: FOUNDATION QUALIFICATION BLOCKED

**FINAL STATUS: FOUNDATION QUALIFICATION BLOCKED.**
