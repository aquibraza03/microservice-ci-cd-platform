# Phase 2 foundation qualification — 2026-09-27

**FOUNDATION BLOCKED.** One bounded foundation-only attempt failed during
kubeadm initialization. The existing stability gate was not reached: **zero
successful samples**, not a three-sample PASS. No application provisioning ran.
This report supplements, rather than replaces, the historical Phase 2 reports.
All times below are UTC.

## A. VERIFIED

### Host and runtime

Windows exposes 16 logical CPUs and 8,085,560 KiB usable physical memory
(approximately 7.71 GiB). Docker Desktop 4.91.0 runs Docker 29.8.0/containerd
2.3.4 on WSL 2.6.3.0, kernel 6.6.87.2-1. The Docker VM exposes 16 CPUs and
3,858,628 KiB memory (3.68 GiB), with 1 GiB swap.

The baseline was captured at 04:24:45–04:25:49, approximately four hours before
bootstrap. It is not a concurrent load measurement. A separate `during.json`
capture at 08:33:19–08:36:18 overlaps bootstrap and retained-node diagnosis.
Each collector command has its own start/end time, arguments, exit and output.

| Measurement | Baseline | During failed bootstrap / retained diagnosis |
| --- | --- | --- |
| Windows available memory, commit counter | 393 MiB | 102 MiB at approximately 08:35:08 |
| Windows committed memory | 20,462,796,800 bytes, 88% | 21,631,807,488 bytes, 93% of 23,036,641,280-byte limit |
| Pagefile usage | 3,355 MiB | 5,227 MiB at approximately 08:35:26 |
| Pages input/sec, three counter samples | 9,464–9,935 | 19,283–30,333 at 08:36:09–11 |
| Total CPU, three samples | 0–34.64% | 99.91–100% at 08:36:09–11 |
| Disk average transfer latency | 0.164–0.198 ms | 1.897–6.410 ms |
| Disk queue, three samples | 0, 2, 0 | 32, 2, 13 |

The first retained-node capture reports VM CPU pressure `some avg60=64.29`,
memory pressure `some avg60=10.49`, and I/O pressure `some avg60=4.18`.
The second reports 38.11%, 3.70%, and 3.40% respectively. These are pressure
stall averages, not CPU utilization. Swap was in use. The second node cgroup
capture has no CPU quota (`max 100000`), zero throttling and zero recorded
OOM/OOM kills; it does not rule out host scheduling or paging delays.

C: has only approximately 5.3 GiB free of 475.7 GiB. The Micron NVMe SSD and
NTFS volume report Healthy/OK. Docker data is in
`C:\Users\aquib\AppData\Local\Docker\wsl\disk\docker_data.vhdx`
(47,892,660,224 bytes observed). Kind `/var` reports `/dev/sde`, with approximately
915 GiB virtual free space: that does not establish physical host headroom.
No filesystem corruption was demonstrated. No evidence attributes etcd data
storage to the OneDrive workspace. `docker system df` succeeded in the baseline
but hit the collector's existing 45-second bound during and after the attempt;
those readings are unavailable, not zero usage.

### Kind identities and failure timeline

- Deployment: `c76a58b7-5f57-4e7d-a16a-47c4ab50d054`.
- Docker context: `desktop-linux`; endpoint `npipe:////./pipe/dockerDesktopLinuxEngine`.
- Daemon: `999fd370-edd4-42cc-b047-589d7adcf226`.
- Cluster/network: `phase2-staging`; intended context `kind-phase2-staging`.
- Node: `phase2-staging-control-plane`, Docker ID `bbfb83ec4156ec24b761c0a178f1bc3c834686720d13cdce4210617263c926b7`.
- Network ID: `474e5c7ebe70b0c04d84f881d774310e69eb0e05f8f84524cf1a63cb627cdb33`.
- Bootstrap fingerprint: `15d12e65c0d4b4af254121557f0faa8df102328c1fcf3897ac59cb23db5cdeed`.
- Source: `source-sha256:a3df53bf5ea1d2891f2a432c7a1786e59d0a146054ae3d923ef1d81366bb6ba9`.
- Kind 0.33.0; Kubernetes v1.36.1, confirmed in kubeadm output. Unchanged node pin:
  `kindest/node:v1.36.1@sha256:3489c7674813ba5d8b1a9977baea8a6e553784dab7b84759d1014dbd78f7ebd5`.
- Internal bootstrap API endpoint: `https://172.23.0.2:6443`.
  No staging namespace UID or registered full environment was created.

| Time | Observed event |
| --- | --- |
| 08:30:37.894 | Disposable bootstrap registration begins |
| 08:34:04.652 | etcd container creation timestamp |
| 08:34:05.348 | Kind exits 1: kubeadm bootstrap admin ClusterRoleBinding creation fails; `client rate limiter Wait returned an error: rate: Wait(n=1) would exceed context deadline` |
| 08:34:27.188 | scheduler container creation timestamp |
| 08:34:37.937 | controller-manager container creation timestamp |
| 08:34:43.158 | API server container creation timestamp, after Kind failure |
| 08:35:03 | scheduler API connection refused |
| 08:35:18–35 | controller-manager lease GET deadlines |
| 08:35:26–31 | API etcd connection/authentication handshake cancellations |
| 08:35:56.511 / 58.539 | API etcd Range calls report DeadlineExceeded |
| 08:35:58.238 | etcd range takes 3.290534538 seconds; log expected duration 100 ms |
| 08:37:44.526 | Second retained-node diagnostic snapshot |
| 08:41:26.540 | Guarded bootstrap cleanup PASS |
| 08:43:52.549 | Before/after safety comparison PASS |

Both diagnostic snapshots list the same four core container IDs at attempt 0.
Full IDs and creation times are in `summary.json` and raw CRI output. No restart
was observed in those snapshots. Running snapshots after the failed deadline
do not prove readiness, stable leases or the required observation gate. This
attempt shows lease acquisition timeouts; it does not establish loss of an
already acquired controller-manager leadership lease. Earlier report findings
are not substituted for this attempt.

### etcd latency and root-cause limits

The first metric sample is small (7 commits, 6 WAL fsyncs). The second has:

| Operation | Count | Mean | Empirical p99 histogram bucket |
| --- | --- | --- | --- |
| Backend commit | 234 | 71.82 ms | (512, 1,024] ms |
| WAL fsync | 440 | 29.76 ms | (256, 512] ms |

These are cumulative histogram bucket bounds, not interpolated exact percentiles.
The second sample reports an etcd leader, one leader change and no pending
proposals. It cannot certify stability. The evidence supports delayed core
startup and API bootstrap deadline failure under substantial Windows/VM CPU,
memory and paging pressure, followed by slow etcd persistence/range requests
and API deadlines. The relative contributions of CPU scheduling, paging and
storage I/O have not been isolated. Low C: free space is a capacity concern,
not proof that disk capacity alone caused the timeout. More Docker RAM is not
a proven fix on this already constrained Windows host.

### Safety

Guarded teardown and independent before/after comparison both PASS.
All 24 unrelated container identities and states (including running status,
start/finish timestamps and restart counts) are unchanged; 9 remain running.
All 22 baseline volumes and 11 baseline networks remain. Staging node/network
are absent and owned storage cleanup passed. Daemon identity/resources,
Docker/WSL settings hashes and protected target/security/application file hashes
are unchanged. No unrelated workload was stopped; no global prune, production
target, production credential, application deployment or Phase 3/4 action was used.

## B. FIXED

Added bounded, read-only Windows/Docker/WSL evidence collection and a failed-bootstrap
summary workflow. An initial Docker-inspect formatting error in the collector
was corrected before bootstrap. Its failed capture remains in
`artifacts/staging/qualification/2026-09-27T04-23-52-033Z/before.json`.
No host/runtime fix is claimed. Existing lifecycle, gate, timeouts, safety guards,
target pin and application files were not changed.

Repository files changed in this qualification:

- `scripts/capture-foundation-host.cjs` — new evidence collector.
- `scripts/summarize-foundation-qualification.cjs` — new failed-bootstrap summarizer.
- `docs/phase2-staging-runbook.md` — foundation-only qualification procedure.
- `docs/phase2-foundation-qualification.md` — this report.

## C. NOT VERIFIED

No successful `/readyz`/Node Ready/core-component foundation samples exist for
this attempt. The required three samples with 30-second separation remain
unchanged and unpassed. No application health, PostgreSQL, Redis, MinIO, registry,
RBAC, NetworkPolicy, migration, Phase 3, Phase 4, production readiness or complete
Phase 2 recreation is claimed. No Kubernetes Node UID was obtained; the recorded
node identity is the guarded Docker container ID.

## D. BLOCKED

Kind creation exit 1 prevents the authoritative gate from running. Subsequent
retained-node observations cannot turn that result into PASS. No further retry
was made without an evidence-based host correction.

Checks executed:

- `node --check` for `scripts/capture-foundation-host.cjs`,
  `scripts/summarize-foundation-qualification.cjs`, `scripts/staging/main.cjs`,
  `scripts/staging/foundation.cjs`, and `scripts/staging/safety.cjs`: PASS.
- `node --test scripts/staging/safety.test.cjs`: 25 PASS, 0 FAIL, including
  foundation stability/restart/missing-component cases and negative safety guards.
- Target/config validation through the collector and existing safety tests: PASS.
- `node scripts/staging/main.cjs bootstrap`: exit 1; gate unreachable, zero samples.
- Automatic bootstrap diagnostics and explicit `diagnose-bootstrap`: captured;
  explicit diagnostic command exit 0.
- `node scripts/staging/main.cjs cleanup-bootstrap`: exit 0, PASS.
- Collector `before`, `during`, `after`: completed; after safety PASS;
  individual unavailable commands remain recorded, as described above.
- Failed-bootstrap summarizer with the IDs below: exit 0, BLOCKED correctly retained.

Evidence locations (repository-relative):

- `artifacts/staging/qualification/2026-09-27T04-24-45-352Z/`:
  `before.json`, `during.json`, `after.json`, `safety.json`, `summary.json`,
  `safety-tests.log`, `storage-host.json`, `process-memory.json`.
- `artifacts/staging/bootstrap/c76a58b7-5f57-4e7d-a16a-47c4ab50d054/`:
  `result.json`, `diagnostics.json`,
  `diagnostics-before-2026-09-27T08-37-14-951Z-diagnose-bootstrap.json`, `cleanup.json`.
- `artifacts/staging/runs/`: lifecycle command arguments, timestamps and exit codes.

## E. OPERATOR ACTION REQUIRED

1. Save work and close unneeded Windows applications/browser windows to restore
   CPU and physical-memory headroom. Do not stop unrelated Docker containers.
   This is reversible by reopening applications; no specific memory amount is
   asserted to guarantee success. The process-memory capture provides candidates,
   not attribution of instantaneous CPU use.
2. Archive or move operator-selected non-project personal files from C: to another
   drive after verifying the copy, to restore physical storage headroom. Do not
   delete Docker/WSL data, volumes, project files or use prune. A verified move is
   reversible; sufficient space and lower pressure must be measured afterward.
3. Rerun the documented qualification with a fresh baseline immediately before
   bootstrap. Compare available/committed memory, paging, CPU and I/O pressure,
   then require the unchanged three-sample gate. If host pressure cannot be
   relieved while preserving workloads, operator review of host capacity is
   required; do not automatically alter Docker RAM, WSL, pagefile or storage.

The user's global-host-change stop condition applies. No operator action above
was applied automatically. **PHASE 2 APPLICATION LAYER: NOT TOUCHED.**
