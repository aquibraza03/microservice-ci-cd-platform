# Fresh host-correction validation — 2026-09-27

This report covers one fresh foundation-only qualification. The previous report
`phase2-foundation-qualification.md` and its evidence remain unchanged. All times
are UTC. **FOUNDATION = BLOCKED.** Kind creation timed out; the authoritative
foundation stability gate was NOT REACHED (0/3 successful samples).

## A. VERIFIED

The fresh baseline was collected at 08:53:20.302–08:54:46.900. The new bootstrap
identity was registered at 08:55:03.453, **16.553 seconds** after baseline completion.
Concurrent host evidence spans 08:55:17.375–08:57:01.215. Each collector command
records start/end time, arguments, exit status and output. Baseline collection
took 86.6 seconds, including a 45.026-second `docker system df` timeout; the same
command timed out after 45.056 seconds during bootstrap. These readings are
unavailable, not zero usage.

The unchanged host exposes 16 logical CPUs and 8,085,560 KiB usable physical
memory. Docker Desktop 4.91.0 (239619), Docker 29.8.0 and WSL 2.6.3.0/kernel
6.6.87.2-1 are observed. Docker exposes 16 CPUs and 3,951,235,072 bytes memory,
with overlayfs/containerd snapshotter storage and cgroup v2. Windows C: reports
5,891,289,088 bytes free in the new baseline; the SSD reports Healthy/OK.

The during-bootstrap WSL snapshot reports 1,730,268 KiB available memory and
461,780 KiB used of 1,048,576 KiB swap. CPU/memory/I/O `some avg60` pressure
values are 24.20%, 3.23% and 2.37%. These are stall averages, not utilization.

### Identity

- Qualification: `2026-09-27T08-53-20-302Z`.
- Deployment: `e1fa939b-5894-470b-91f4-c574e119d90f`.
- Daemon: `999fd370-edd4-42cc-b047-589d7adcf226`.
- Context: `desktop-linux`; endpoint: `npipe:////./pipe/dockerDesktopLinuxEngine`.
- Cluster/network: `phase2-staging`; Kubernetes context: `kind-phase2-staging`.
- Source: `source-sha256:a3df53bf5ea1d2891f2a432c7a1786e59d0a146054ae3d923ef1d81366bb6ba9`.
- Node pin remains `kindest/node:v1.36.1@sha256:3489c7674813ba5d8b1a9977baea8a6e553784dab7b84759d1014dbd78f7ebd5`.

The baseline contains 24 unrelated containers (9 running), 22 volumes and
11 networks. Container states and settings hashes also match the prior cleanup
snapshot. This observes preservation across the operator interval; it does not
establish exactly which Windows applications the operator closed.

## B. FIXED

No runtime, application, gate, timeout, retry, pinned image, safety policy or
global setting was changed by this qualification. Better baseline readings do
not prove a fix or isolate the cause of the previous failure.

The evidence summarizer previously hard-coded the prior attempt's kubeadm
binding failure and called every diagnostic the second capture. It now records
the actual Kind timeout code, uses neutral timeline descriptions, links the
current test evidence and limits core-container identities to the four core
components. It also supports explicit cleanup-failure evidence, reports safety
FAIL when cleanup/preservation is incomplete, and includes the current host
comparison. This reporting correction does not alter acceptance behavior.

## C. NOT VERIFIED

Application/dependency provisioning, application health, RBAC application tests,
NetworkPolicy application tests, PostgreSQL, Redis, object storage, registry,
migrations, Phase 3, Phase 4 and production readiness are outside this task.

## F. PREVIOUS VS CURRENT COMPARISON

The previous column describes the previous failed attempt's during capture,
not its four-hour-old baseline. Commit and available-memory entries use the
CIM commit sample; CPU, latency and queue use three performance-counter samples.

| Metric | Previous failure | New baseline | During bootstrap | Baseline classification |
| --- | --- | --- | --- | --- |
| Available memory | 102 MiB | 485 MiB | 393 MiB | IMPROVED |
| Committed memory | 93%; 21,631,807,488 bytes | 90%; 20,755,025,920 bytes | 91%; 21,086,724,096 bytes | IMPROVED |
| Pagefile usage | 5,227 MiB | 3,936 MiB | 4,114 MiB | IMPROVED |
| CPU | 99.91–100% | 22.52–68.02% | 43.34–63.31% | IMPROVED |
| Disk transfer latency | 1.897–6.410 ms | 0.218–0.862 ms | 2.401–13.096 ms | IMPROVED |
| Disk queue | 32, 2, 13 | 0, 1, 0 | 7, 17, 19 | IMPROVED |
| Pages input/sec, three samples | 19,283–30,333 | 5,638–7,891 | 12,944–30,473 | IMPROVED for these samples |
| Pages input/sec, CIM snapshot | 20,012 | 95,360 | 15,437 | WORSE at baseline; aggregate paging classification INCONCLUSIVE |

During-bootstrap memory, commit, pagefile and CPU readings also improved relative
to the previous failure. Disk latency, disk queue and paging comparisons are
INCONCLUSIVE because their ranges overlap and the new disk-latency maximum is
higher. These short snapshots do not establish sustained host relief or causation.
No staging etcd exists at baseline: baseline etcd metrics are N/A, not zero.

| etcd metric | Previous failure | New baseline | Current retained-node diagnostic | Classification |
| --- | --- | --- | --- | --- |
| Backend commit count / mean | 234 / 71.82 ms | N/A | 370 / 86.19 ms | Mean WORSE; different sample windows |
| Backend commit p99 histogram bucket | (512, 1,024] ms | N/A | (512, 1,024] ms | UNCHANGED bucket |
| WAL fsync count / mean | 440 / 29.76 ms | N/A | 701 / 31.10 ms | Mean WORSE; different sample windows |
| WAL fsync p99 histogram bucket | (256, 512] ms | N/A | (256, 512] ms | UNCHANGED bucket |

The etcd measurements were collected by automatic retained-node diagnostics
after the create command timed out. They are cumulative histogram bounds,
not exact p99 values. Overall etcd improvement is not established. The metric
snapshot reports `has_leader=1`, `leader_changes_seen_total=1` and
`proposals_pending=0`; these do not override the failed qualification.

## D. BLOCKED — exact outcome

Kind started at **08:55:06.924** and its result was recorded at **09:00:07.170**:
approximately **300.246 seconds**, `exitCode=null`, `errorCode=ETIMEDOUT`.
The lifecycle command subsequently exited 1 after automatic diagnostics.
Kind did not provide a successful exit code; null is a timeout, not exit zero.

Kind output reaches CNI/StorageClass installation and reports its internal
`Ready after 55s` milestone. That milestone is not the total create duration and
does not establish successful process completion or the repository stability
gate. The exact operation that prevented process exit is not isolated.
No full environment or staging namespace was registered, and no foundation
sample was taken. Existing 300-second command, 180-second Kind wait and
three-sample/30-second gate limits were unchanged.

The retained node is `phase2-staging-control-plane`, Docker ID
`f69dc40a1e59c62fb501a961be5a3900973dc09707c6a1f434c07a52cf1e09d3`;
network ID `985f2e508c038f9081bc28a088cef88e4cad25980dc4e776ed10d012b65ace22`;
bootstrap fingerprint `ff923b4dc55ec5112084d549aaf0834066c0dad68950eb78110f2c340df3cede`.
The API port maps to `https://127.0.0.1:55241`; internal component logs use
`https://172.23.0.2:6443`. The local kubeconfig lacks `kind-phase2-staging`.
An extra diagnostic endpoint check therefore exited 1 before making a readiness
request. No `/readyz` success is claimed, and no context or credentials were repaired.

| UTC time | Observed control-plane evidence |
| --- | --- |
| 08:58:11.796 | Scheduler acquired its leader lease |
| 08:59:59.905 | API etcd Range request DeadlineExceeded |
| 09:00:07.170 | Kind create command timeout recorded |
| 09:00:54.629 / 09:01:02.356 | Further API etcd Range deadlines |
| 09:01:03.948 / 03.961 | Scheduler lease update/renewal deadlines |
| 09:01:06.300 | Scheduler logs `Leaderelection lost` |
| 09:01:17.691 | Replacement scheduler container creation timestamp, attempt 1 |
| 09:01:27.584 | Captured etcd read-only range takes 2.128902157 seconds, expected 100 ms |
| 09:01:43.746 | Automatic diagnostic capture completed |

CRI output contains the exited attempt-0 scheduler and a CREATED attempt-1
replacement. Etcd, API server and controller-manager are RUNNING at attempt 0
in that snapshot. This is observed scheduler replacement, not a failed stability
sample: the stability gate was never reached. Full component IDs are recorded
in the raw diagnostic and summary. Controller-manager leadership loss was not
established by this capture.

The later VM diagnostic has CPU/memory/I/O `some avg60` pressure of 53.74%,
7.41%, and 4.22%, with 500,004 KiB swap in use. The node cgroup reports no CPU
quota, zero throttled time and zero OOM/OOM-kill events. The evidence supports
persistent pressure and control-plane instability but does not isolate CPU,
paging, storage or WSL scheduling as the cause. **ROOT CAUSE = NOT ISOLATED.**

## E. OPERATOR ACTION REQUIRED

**First resolve the partial teardown through an explicitly reviewed guarded
recovery procedure.** The current strict cleanup guard refuses this stopped-node
state. Do not rerun bootstrap, start the node to satisfy a guard, discard ownership
records, use prune, or remove resources by wildcard. Recovery must verify the
recorded daemon, deployment UUID, full node ID, network ownership/ID, empty live
network membership and node-volume ownership against the original baseline
before removing only the three recorded staging resources. No automated bypass
or lifecycle behavior change was made in this task. Rerun the after safety
comparison once recovery is complete; it must show staging EMPTY.

The one authorized attempt is exhausted. No speculative correction or second
bootstrap was performed. Further qualification requires operator-side host
capacity review: the host still had 90–91% commit, only 393–485 MiB available
memory and substantial paging, with later VM CPU pressure. Preserve unrelated
Docker workloads. Save/close additional unnecessary Windows applications where
possible and measure sustained memory/CPU/paging/I/O headroom under existing load.
Reopening those applications reverses that action. If headroom cannot be restored,
review host capacity or placement with the operator before changing global
Docker/WSL/pagefile/storage settings. This evidence does not justify a specific
RAM allocation, storage migration or guarantee that either would fix the failure.
Only a separately authorized fresh attempt with the unchanged gate can validate
any correction. No application work may proceed from this result.

## Safety verification and partial cleanup

**SAFETY = FAIL.** All unrelated resources and protected settings were preserved,
but the required staging-empty postcondition was not achieved.

The first guarded cleanup began at 09:03:15.104; `kind delete cluster` was called
at 09:03:41.767 and returned exit 1. Its error output is suppressed by the existing
lifecycle, so the underlying delete error is unavailable. Read-only inspection
shows the staging node stopped at 09:04:21.839 with exit 137 and `OOMKilled=false`;
this occurred during cleanup and is not evidence of an earlier OOM.

A cleanup-only retry at 09:05:45.613 reran ownership checks and refused before
issuing another deletion: the network's live `Containers` map was empty instead
of containing the registered node ID. This was not a second qualification attempt.
The stopped node still records the original network ID but has no active endpoint.
The guard was not weakened and no further removal was attempted.

Remaining owned resources:

- Node `phase2-staging-control-plane`, full ID listed above, stopped.
- Network `phase2-staging`, full ID listed above, deployment ownership label
  `e1fa939b-5894-470b-91f4-c574e119d90f`, no attached running containers.
- Node `/var` volume `84d80134dc40906591585cd5f41aff85958c6080b290572ffc4b810d5ca06326`.
- Local `bootstrap-state.json` and `pending.json` retained for guarded recovery.

The independent after collector completed at 09:07:41.316 and exited 1 because
staging resources remain. Its raw status is `BLOCKED`; the report and summary map
that unmet safety requirement to **FAIL** as required by this task. The only
reported difference is `Staging resources remain`: all 24 baseline container
states/start times/restart counts, all 22 volumes and all 11 networks are preserved,
as are daemon identity/resources, settings hashes and protected repository hashes.
No unrelated container was stopped, and no global setting or production target
was changed. `docker system df` also timed out after 45.239 seconds in the after
capture; this is retained as unavailable evidence.

## Tests and evidence

`node --test scripts/staging/safety.test.cjs`: **25 PASS, 0 FAIL** (465.9302 ms),
including foundation and negative target/config/safety cases. An initial sandbox
attempt was blocked by `spawn EPERM`; the approved rerun passed.

New evidence root:
`artifacts/staging/qualification/2026-09-27T08-53-20-302Z/`.
Host measurements are in `before.json` and `during.json`; `comparison.json`
contains numeric comparisons and classifications. `tests.json` records test
results, and `workflow-hashes.json` records the lifecycle/gate/helper source hashes.
Bootstrap evidence is under
`artifacts/staging/bootstrap/e1fa939b-5894-470b-91f4-c574e119d90f/`.

Additional evidence in the new qualification directory: `after.json`, `safety.json`,
`summary.json`, `api-diagnostic.json`, `retained-node.json`, `retained-network.json`
and `final-checks.json`. Bootstrap files are `result.json`, `diagnostics.json` and
`cleanup-failure.json`. There is deliberately no successful `cleanup.json`.
Lifecycle command records are:

- `artifacts/staging/runs/2026-09-27T08-54-57-874Z-bootstrap.json`.
- `artifacts/staging/runs/2026-09-27T09-03-15-104Z-cleanup-bootstrap.json`.
- `artifacts/staging/runs/2026-09-27T09-05-45-613Z-cleanup-bootstrap.json`.

Other results: modified summarizer `node --check` PASS; summarizer execution PASS
(correctly emits foundation BLOCKED and safety FAIL); bootstrap exit 1 after Kind
timeout; automatic diagnostics captured; extra local API-context check exit 1
(request not sent); two guarded cleanup invocations exit 1; after collector exit 1.
No acceptance timeout or sampling interval was changed. No Phase 3/4 tests ran.

Repository files changed in this task:

- `scripts/summarize-foundation-qualification.cjs` — reporting corrections only.
- `docs/phase2-foundation-host-correction-validation.md` — this new report.

Previous reports, qualification directories, lifecycle/gate/target/security files,
host collector, application manifests and application configuration are unchanged.

**APPLICATION LAYER: NOT TOUCHED. PHASE 3/4: NOT RUN.**
