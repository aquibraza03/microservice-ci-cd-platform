# Phase 2 — reproducible staging execution report

**PHASE 2 — BLOCKED.** The isolated local staging implementation was built and
executed, but no complete staging health gate passed. Kubernetes scheduler and
controller-manager leadership repeatedly timed out; dependency connections,
probes, rollouts and some authorization/version queries also timed out. Ready
snapshots occurred, but are not being substituted for successful acceptance.

This is disposable local/Kind staging evidence. It is not cloud-account
reproducibility, production Kubernetes validation, or production readiness.

## Scope, prerequisites and repository inventory

The provided Phase 2 specification is authoritative. No separate document named
as a reproducible-staging implementation guide was found. The repository has
older “Phase 2” product-feature reports and a GitHub deployment acceptance script;
those describe a different scope and were not used as staging evidence.

Read the README, Phase 1 Part 1/Part 2 reports, Phase 1 runbook, existing Kind
scripts/config, Compose dependency/control-plane/pipeline files, Terraform staging
root and providers, deployment manifests/Kustomize, CI workflows, telemetry
configuration, application configuration/health/worker/persistence composition,
and associated security tests. The infrastructure keyword inventory matched 120
files across the relevant source/documentation directories. No applicable
AGENTS.md was found in the workspace or its ancestors. Existing Helm provider
configuration exists in Terraform; this implementation does not introduce Helm
or another IaC framework.

Git status and branch queries both reported “not a git repository.” This is an
extracted workspace. No reset, clean, commit rewrite, or unrelated file deletion
was performed. Source-content SHA-256 replaces an unavailable Git revision in
the evidence. It includes application source, migrations, package files, OpenAPI,
and the versioned staging implementation.

Phase 1 prerequisite verification was deliberately lightweight: the existing
migration contract passed and the initial security suite passed 83 tests. The
final suite passed **98 tests**, including targeted staging and worker-readiness
regressions; lint exited 0. Existing migrations were not modified. The existing
migration runner completed a Job against the new staging database during an
earlier provisioning attempt. This does not certify historical migration,
concurrency, interruption recovery, or backup restoration.

## Target, empty state and topology

The exact target is `deploy/staging/target.json`:

| Field | Value |
|---|---|
| Provider/account | Local Docker Desktop Linux / `local-phase2` |
| Context / engine | `desktop-linux`; local Desktop endpoint; Linux engine named `docker-desktop` |
| Cluster / Kubernetes context | `phase2-staging` / `kind-phase2-staging` |
| Namespace / Docker network | `phase2-staging` / `phase2-staging` |
| Database / queue | `phase2_staging` / `phase2-staging` |
| Intended object bucket / registry repository | `phase2-staging` / `phase2-staging/smoke` |
| Domain / host health route | `localhost` / `127.0.0.1:31082` |
| Certificate scope | None: documented local-domain option, no TLS configured |

EMPTY means no Phase 2 node/container, dedicated Docker network, or application
resources exist. Cached images and archived evidence may remain. Existing
development containers, the `platform-local` Kind cluster, unrelated applications,
networks, Docker volumes and databases are outside that definition.

```text
host localhost:31082 (loopback-only)
  -> dedicated phase2-staging Docker bridge
  -> dedicated Kind node / gateway NodePort
  -> health-only gateway -> API
                           API / worker -> PostgreSQL and Redis
                           API / worker -> MinIO and registry (allowed paths)
                           verifier -> all dependencies and health endpoints
                           untrusted pod -> denied dependency paths
```

The Kind API server and gateway are the only intended host-published ports, both
bound to 127.0.0.1. Dependency Services are ClusterIP. Database, Redis, registry
debug, MinIO administration, application administration and telemetry are not
forwarded by the health gateway. The local Docker administrator remains trusted;
this is not internet-level private-cloud networking. The detailed boundary,
hostname resolution and replay procedure are in `phase2-staging-runbook.md`.

## Implementation and change manifest

| Files | Phase 2 purpose |
|---|---|
| `deploy/staging/target.json` | Exact environment/cluster/network/DNS/component allowlist |
| `deploy/staging/Dockerfile`, `Dockerfile.dockerignore` | Minimal application/idle-worker/verifier image; allowlisted build context |
| `scripts/staging/main.cjs` | Provision, reconcile, verify, capture successful release evidence, guarded teardown |
| `scripts/staging/safety.cjs`, `safety.test.cjs` | Fingerprint, independent identity validation, negative target tests |
| `scripts/staging/manifests.cjs` | Versioned Kubernetes JSON manifest generator, policies, services, storage and workloads |
| `scripts/staging/smoke.cjs` | Actual SQL/Redis checks, signed object operations, authenticated OCI push/pull, application health/metrics |
| `scripts/capture-staging-evidence.cjs` | Read-only diagnostic/version/RBAC/resource-pressure capture; no Secret contents |
| `scripts/summarize-staging-evidence.cjs` | Consolidate this execution's retained evidence and all 43 acceptance outcomes |
| `services/control-plane-api/src/environment-security.js`, `src/config.js` | Distinct staging mode and rejection of unsafe staging/production configuration |
| `services/control-plane-api/src/worker/readiness.js`, `src/worker/main.js` | Fix sticky worker readiness exposed by staging execution; query current dependencies |
| `services/control-plane-api/test/security/staging-credentials.test.js`, `staging-readiness.test.js` | Credential/environment and readiness regression tests |
| `services/control-plane-api/test/helpers/production-config.js` | Generated non-default credentials in production test fixtures |
| `README.md`, this report, `docs/phase2-staging-runbook.md` | Entry point, exact procedure, evidence, limitations and acceptance |

No Terraform/cloud deployment, frontend change, business feature, customer build,
signing pipeline, migration redesign, or production rollout was introduced.

## Dependencies, identities, policies and workload settings

Dedicated PostgreSQL, Redis, MinIO and Distribution registry Deployments and
PVCs were created. PostgreSQL/Redis/registry reached Ready; MinIO also reached
Ready after fixing its imported image name. These observations do not establish
successful end-to-end dependency acceptance. The signed bucket/object operations
and authenticated registry push/pull are implemented in the smoke gate but were
not reached successfully because its earlier SQL check failed.

Credentials, metrics tokens, JWT verification keys, encryption keys and audit
keys are generated for staging, submitted through stdin into Kubernetes Secrets,
and not written into source or evidence. Secret lookup failures now abort rather
than being mistaken for absence and rotating database credentials. No production
or customer credential file was read or reused. Arbitrary random-secret provenance
cannot be inferred from its bytes; the tested production boundary rejects known
default/demo/weak values, deterministic key fixtures, missing authenticated
dependencies and explicit staging identities/targets.

`NODE_ENV=staging` and `PLATFORM_ENVIRONMENT=staging` are distinct from development,
test and production. Staging requires PostgreSQL, approved private endpoints,
generated keys, JWT authentication, tracked sessions, its queue and its Kubernetes
context. There are no live external-provider credentials and no customer jobs.
The foundation worker has no build/deployment toolchain or Kubernetes token.

Each workload has a dedicated service account, no token automount, dropped Linux
capabilities, no privilege escalation, non-root execution and RuntimeDefault
seccomp. No application RoleBinding or cluster-admin grant was added. Diagnostic
capture attempted 36 live authorization denials: **19 returned the expected
`no`; the remaining 17 did not provide valid denial evidence**. Thus complete
RBAC verification is blocked, not passed based on source inspection.

Twenty-five NetworkPolicies were observed in the namespace. Default deny plus
explicit same-namespace dependency, gateway, verifier and DNS rules are deployed.
Required new PostgreSQL traffic timed out from the verifier despite successful
DNS resolution; forbidden traffic tests therefore did not complete. Network
isolation is not marked verified.

Requests/limits are defined for every application and diagnostic container and
the migration Job. Live pod descriptions confirmed their application. Requests:
50m CPU, 128 MiB memory for PostgreSQL/MinIO, 96 MiB for API/worker, 64 MiB for
smaller workloads. CPU limits are 500m; memory limits are 384 MiB PostgreSQL,
512 MiB MinIO and 256 MiB otherwise. These are smoke-test budgets, not capacity
certification. Startup/readiness/liveness probes use actual dependency operations
or application endpoints. Diagnostic exec-only pods and the finite migration
Job do not use meaningless process-only probes.

PDBs are N/A: this is a single-node, single-replica disposable environment. A
minAvailable=1 PDB would block intentional maintenance without creating redundancy.
The worker readiness fix passed regression tests, but intermittent infrastructure
probe failures and rollouts still prevent overall probe/health acceptance.

## Fingerprint, allowlist and teardown protection

The fingerprint combines the exact target, deployment UUID, source revision,
infrastructure/configuration versions via the target, Docker daemon identity,
node container ID and namespace UID. Live checks compare the Kind cluster label,
owned network, namespace UID and fingerprint annotation. Provisioning rejects
an occupied unowned target; teardown aborts on identity mismatch or another
container attached to the network. Remote Docker endpoints/host overrides are
rejected. Only the separately stored staging kubeconfig is used.

Teardown checks that node-mounted volumes did not predate this environment,
removes only the exact verified Kind cluster/network, and compares unrelated
resource inventories. It verifies that the node's owned volumes disappeared.
Missing identity state is not a license to adopt or delete resources.
The separate `cleanup-pending` operation cannot delete a cluster: it requires
no registered state or matching container/Kind cluster, the original local daemon,
the pending deployment UUID on an empty network, and an unoccupied baseline.
It removes only that verified network ID and checks unrelated inventories.

## Executed checks, failures and evidence

Primary commands, from repository root unless a service working directory is
specified:

```text
git status --short
git branch --show-current
node --check scripts/staging/main.cjs
node --check scripts/staging/manifests.cjs
node --check scripts/staging/smoke.cjs
node --check scripts/staging/safety.cjs
node --check scripts/capture-staging-evidence.cjs
node --test scripts/staging/safety.test.cjs
node scripts/staging/main.cjs up
node scripts/staging/main.cjs verify
node scripts/capture-staging-evidence.cjs
node scripts/staging/main.cjs down
node scripts/staging/main.cjs cleanup-pending
node scripts/summarize-staging-evidence.cjs
```

In `services/control-plane-api`: `npm run test:migration:contract`,
`npm run test:security`, and `npm run lint`. Security tests progressed from 83
baseline to 98 final passing tests as targeted regressions were added. Safety
tests passed 16/16; their initial sandbox attempt failed with process-spawn
EPERM, and the authorized unrestricted run passed.

The machine-readable per-run command arrays in `artifacts/staging/runs/` record
the exact `docker`, `kind`, and context-qualified `kubectl` arguments and exit
statuses, including build/import, server-side dry-run, apply, rollout and Job wait
operations. Failed attempts are retained. Diagnostic command output is in the
fingerprint directory's `diagnostics.json`. No stdin secret payload is logged.

Observed failures and fixes:

1. Multi-platform Kind import failed with a missing content digest. Provisioning
   now exports only linux/amd64 and imports only missing images.
2. Digest-only MinIO import lacked a resolvable image name. A deterministic local
   tag now points to the same pinned source digest.
3. Worker readiness could remain false after a transient dependency error. It
   now rechecks PostgreSQL, Redis and worker state; dedicated regressions pass.
4. The gate correctly failed when only four of nine workloads existed and again
   when the worker was not Ready. These are negative-path evidence, not successful
   staging health evidence.
5. Repeated control-plane leader-lease timeouts caused more than twenty scheduler
   and controller-manager restarts, CrashLoopBackOff and Pending workloads.
6. PostgreSQL DNS resolved (`10.96.121.29` in that execution), but verifier TCP
   connection attempts timed out. No successful object/registry smoke is claimed.
7. The final reconciliation again timed out waiting for PostgreSQL rollout.
8. Two clean creation attempts after successful teardown failed during Kind
   bootstrap. The last retained error is kubeadm `wait-control-plane`: creating
   its bootstrap admin ClusterRoleBinding at the API server timed out with
   `context deadline exceeded`. No application manifests or credentials had been
   applied in that attempt. Kind automatically deleted its failed node.
   The dedicated network override also emits an experimental/unsupported warning
   from Kind; this local topology is not presented as vendor-certified.

The Docker VM exposed 3,951,235,072 bytes (about 3.68 GiB) of memory. A captured
sample showed approximately 484 MiB swap in use, CPU pressure avg300 35.02%, and
memory pressure avg300 5.42%. These observations are consistent with resource
contention but do not prove the sole cause of every timeout. No unrelated
container was stopped and global Docker/WSL allocation was not changed.

Initial diagnostic artifact:
`artifacts/staging/87c03bcccfbf8737dd630b59d9610d9285b288517ea5277f439cc6db5fa78189/manifest.json`.
It explicitly says `healthGate: BLOCKED` and includes safe observed image IDs,
pod states, authorization outcomes and diagnostics. Its source revision is the
revision captured for that attempt, not a claim that every latest change was
deployed successfully. Rendered non-secret manifests accompany the attempts.

| Component | Recorded selection / observation |
|---|---|
| Docker | Observed 29.8.0 |
| Kind | Observed v0.33.0, Go 1.26.7, windows/amd64 |
| Kubernetes | Observed v1.36.1 |
| Kind node | `kindest/node:v1.36.1@sha256:3489c7674813ba5d8b1a9977baea8a6e553784dab7b84759d1014dbd78f7ebd5` |
| PostgreSQL | Selected `postgres:16.4-alpine`; observed image ID `sha256:89ec47deeeddac28eb60b5672a456c54213ff4528f8752fda7f7c2a0e4ead36a` |
| Redis | Selected `redis:7.4.1-alpine`; observed image ID `sha256:87b460005bd3a6621dabf2855ec42bf96b1b6d044b6109bd9736128ab178ddec` |
| MinIO | Pinned source `minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` |
| Registry | Selected `registry:2.8.3`; observed image ID `sha256:26b2eb03618e749084668eaff68cff8f81dda12d06ac641be7a6398b82a6f25b` |
| API/worker | Content-tagged `phase2-staging/platform` image; exact per-attempt references and IDs in manifest pod records |

Dependency version commands in the initial diagnostic capture timed out and are
recorded as null. Selected version tags are not represented as successful live
engine-version queries. No frontend is required for the health-only foundation.

## Source/security audit and excluded scope

No hard-coded staging password, private key, production credential, customer
target, application cluster-admin binding or Docker socket mount was introduced.
The health gateway deliberately permits its one ingress port; it forwards only
two health paths. All other workload policy flows are explicitly scoped.

Pre-existing development Compose passwords and a development Cosign default were
found in the old local/pipeline Compose and Kind scripts. The old
`scripts/kind-down.sh` is unguarded for `platform-local`. Existing base policies
also contain public HTTP/HTTPS egress rules. These paths are not used by this
staging implementation and were not rewritten outside scope. Synthetic negative
test passwords are fixtures, not leaked production secrets.

Phase 3 migration/recovery/concurrency certification, DR/backup/restore, load/soak,
HA, billing/payment and full observability/security acceptance were intentionally
not performed. Phase 4 customer repository detection/build/scan/SBOM/signing/
deployment/admission/preview/rollback was intentionally not performed. Existing
security regressions with historical phase names are not certification of those
phases.

## Acceptance matrix

PASS below is scoped to the evidence stated. Source definitions do not substitute
for missing live connectivity, recovery or reproducibility results.
Final totals: **24 PASS, 17 BLOCKED, 2 N/A**. Resource-existence PASS rows record
the earlier observed environment; successful cleanup means it is no longer live.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | Separate staging environment exists | Dedicated node, namespace and workloads observed | PASS |
| 2 | Separate staging network/boundary exists | Dedicated owned Docker bridge, separate kubeconfig | PASS |
| 3 | Dedicated PostgreSQL exists | Deployment/PVC created; Ready observed | PASS |
| 4 | PostgreSQL private | Cluster-internal design; complete private-endpoint gate outstanding | BLOCKED |
| 5 | Dedicated Redis exists | Deployment/PVC created; Ready observed | PASS |
| 6 | Redis private | Complete private-endpoint gate outstanding | BLOCKED |
| 7 | Dedicated object storage exists | Dedicated MinIO Deployment/PVC observed | PASS |
| 8 | Object storage staging-isolated | Dedicated instance; bucket/object acceptance not completed | BLOCKED |
| 9 | Dedicated registry exists | Dedicated registry Deployment/PVC observed | PASS |
| 10 | Registry staging-isolated | Dedicated instance; authenticated push/pull not completed | BLOCKED |
| 11 | Disposable Kubernetes exists | Exact Kind node/context observed | PASS |
| 12 | Namespace isolation verified | Staging workloads/service accounts in approved namespace | PASS |
| 13 | RBAC least privilege verified | 19/36 valid live denials; remaining evidence unavailable | BLOCKED |
| 14 | NetworkPolicies deployed and verified | 25 deployed; required/forbidden traffic gate incomplete | BLOCKED |
| 15 | Environment-specific credentials used | Generated Secret creation; no external credential import | PASS |
| 16 | Production credentials not reused | Independent generation; no production credential input | PASS |
| 17 | Environment-specific encryption keys | Generated 32-byte staging key and strict staging startup validation | PASS |
| 18 | Environment-specific audit keys | Independent generated integrity key and startup validation | PASS |
| 19 | Staging local domain works | Full hostname/route gate not completed | BLOCKED |
| 20 | TLS where configured | Documented local-domain option; TLS not configured | N/A |
| 21 | Fingerprint exists | State, namespace identity checks and fingerprint artifacts | PASS |
| 22 | Unknown target rejected | Executed strict-allowlist negative tests | PASS |
| 23 | Production target rejected | Executed negative target/configuration tests | PASS |
| 24 | Customer target rejected | Executed negative target tests | PASS |
| 25 | Requests defined | Live workload descriptions and rendered manifests | PASS |
| 26 | Limits defined | Live workload descriptions and rendered manifests | PASS |
| 27 | Appropriate PDB or justified N/A | Single-node, single-replica disposable topology | N/A |
| 28 | Probes work | Startup/liveness events observed; stable full acceptance unavailable | BLOCKED |
| 29 | Platform workloads healthy | Intermittent Ready snapshots; complete gate never passed | BLOCKED |
| 30 | Telemetry/admin endpoints private | Complete private-endpoint/metrics gate outstanding | BLOCKED |
| 31 | Exact component versions recorded | Image IDs recorded; live dependency version queries timed out | BLOCKED |
| 32 | Deployment manifests recorded | Versioned generator and per-fingerprint deployment.json | PASS |
| 33 | Empty-state provisioning works | Infrastructure created; complete health acceptance unavailable | BLOCKED |
| 34 | Provisioning reproducible | No complete recreation-plus-health proof | BLOCKED |
| 35 | Safely repeatable provisioning | Identity/secret preservation implemented; repeated rollouts timed out | BLOCKED |
| 36 | Health gate works | Negative paths executed; positive full gate unavailable | BLOCKED |
| 37 | Negative safety tests pass | 16 safety tests plus production/staging regression suite | PASS |
| 38 | Teardown guarded | Guarded down exited 0; exact resources removed, unrelated inventories preserved | PASS |
| 39 | Teardown rejects production/customer | Exact allowlist, independent live ownership guards, negative tests | PASS |
| 40 | Clean recreation succeeds | Two attempts failed; final kubeadm bootstrap API request timed out | BLOCKED |
| 41 | Production rejects unsafe credentials | Final 98-test security suite; documented validation scope | PASS |
| 42 | Machine-readable release evidence exists | Explicitly BLOCKED manifest and diagnostic/command artifacts | PASS |
| 43 | No Phase 2 blocker remains | Stable local infrastructure and full acceptance still required | BLOCKED |

## Remaining execution boundary

The first guarded teardown completed successfully. Its evidence is
`artifacts/staging/87c03bcccfbf8737dd630b59d9610d9285b288517ea5277f439cc6db5fa78189/teardown.json`.
It confirms removal of the dedicated node/network and node-owned volumes and
preservation of unrelated containers, volumes and networks. Clean recreation
failed twice. The final error is recorded in
`artifacts/staging/bootstrap/8363f2a3-3e9f-4033-8ae9-4a2f07fa763a/result.json`.
This is an observed failed execution with acceptance BLOCKED by the unavailable
local control plane, not a successful reproducibility result.
Both empty bootstrap networks were subsequently removed by `cleanup-pending`.
The final `bootstrap/8363f2a3-3e9f-4033-8ae9-4a2f07fa763a/cleanup.json`
records PASS, no staging container/network remaining, and preservation of all
24 unrelated containers, 22 baseline volumes and 11 unrelated networks.
Staging is left in the documented empty state; cached images and evidence remain.
`artifacts/staging/summary.json` consolidates the final matrix, revisions,
test counts, runtime version limitations, bootstrap failure and cleanup evidence.

The required next proof is a complete health gate on stable infrastructure,
followed by an unchanged reconcile, guarded teardown and clean recreation with
another complete health gate. Current evidence does not certify that sequence.
Global Docker/WSL resource changes or stopping other environments were not
authorized within the isolated-resource scope and were not performed.
