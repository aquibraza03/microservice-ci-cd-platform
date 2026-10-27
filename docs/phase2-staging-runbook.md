# Disposable Phase 2 staging

This is disposable local/Kind staging evidence, not cloud or production validation.
The authoritative target is `deploy/staging/target.json`. No cloud credentials,
production DNS, existing development Compose services, or customer clusters are used.

## Prerequisites and commands

For **foundation-only host qualification**, first read
`docs/phase2-foundation-qualification.md`. Capture a fresh baseline with
`node scripts/capture-foundation-host.cjs before`, then run only
`node scripts/staging/main.cjs bootstrap`. Capture concurrent host pressure with
`node scripts/capture-foundation-host.cjs during` while bootstrap/retained-node
diagnostics are active. On failure, run `node scripts/staging/main.cjs diagnose-bootstrap`
before cleanup. If only bootstrap state exists, use
`node scripts/staging/main.cjs cleanup-bootstrap`; if a namespace/full state was
registered, use the existing guarded `down` action instead. Never bypass a refused
identity check. After teardown run `node scripts/capture-foundation-host.cjs after`.
The collector writes timestamped, bounded read-only command results and compares
container state, inventories, daemon resources, settings hashes and protected files.
Unavailable counters are recorded as unavailable, not zero.

For a failed bootstrap, consolidate evidence with
`node scripts/summarize-foundation-qualification.cjs <qualification-id> <deployment-id>`.
This summary requires before/during/after evidence and does not certify successful
foundations. The existing three-sample, 30-second foundation gate remains authoritative.
Stop after foundation PASS or BLOCKED; do not run `up` or application verification
as part of this qualification. Host/global changes require operator action.

Install Docker Desktop, Kind 0.33.0, kubectl compatible with Kubernetes 1.36,
and Node.js 20 or newer. Enable Linux containers. Allow enough Docker memory for
the existing workloads plus the additional cluster and roughly 1 GiB of application
requests/working memory. Internet access is needed for uncached image pulls and
`npm ci` during the image build. Run from the repository root:

The registered provider is Docker Desktop's `desktop-linux` context with its local
named pipe or Desktop Unix socket. Remote Docker endpoints and host overrides are
rejected. Supporting a different engine requires an explicit reviewed allowlist
change; a daemon's name alone is not accepted as proof of local identity.

```text
node --test scripts/staging/safety.test.cjs
node scripts/staging/main.cjs bootstrap
node scripts/staging/main.cjs up
node scripts/staging/main.cjs verify
node scripts/staging/main.cjs up
node scripts/staging/main.cjs verify
node scripts/staging/main.cjs down
node scripts/staging/main.cjs up
node scripts/staging/main.cjs verify
```

All commands fail nonzero on failure. Do not run lifecycle commands concurrently.
`bootstrap` creates only the owned Kind foundation and staging namespace. Both
`bootstrap` and `up` require three successful API `/readyz`, node Ready, and
control-plane container samples, separated by 30-second observation intervals.
All four core components must remain running/Ready with unchanged pod identities
and restart counts. This bounded observation checks stability; it does not extend
bootstrap timeouts or turn failed checks into retries. No application deployment
occurs before this gate passes. Each attempt writes a separate `foundation-*.json`.
`up` reconciles the existing owned cluster and preserves secrets and persistent
volumes. A source change updates the source fingerprint and application image;
the existing Phase 1 migration job runs once per empty environment. This command
does not certify upgrades of an existing schema: use a clean staging environment
for schema changes. `verify` rejects source changes after provisioning.

EMPTY means neither the exact `phase2-staging` node/container nor its dedicated
Docker network nor its application resources exist. Cached images and archived
evidence can remain. Other development environments are outside this definition.

## Identity and protection

### Fully absent historical deployment reconciliation

For the specifically authorized stale deployment
`e1fa939b-5894-470b-91f4-c574e119d90f`, use
`node scripts/staging/reconcile-stale.cjs check`, then
`node scripts/staging/reconcile-stale.cjs apply`. Run `apply` again to verify
`ALREADY_RECONCILED`. This narrow helper does not run Kind, bootstrap, Kubernetes
or Docker mutations. It is not a replacement for cleanup of live resources.

It requires the same local Docker daemon, a valid existing bootstrap fingerprint,
identical pending-deployment metadata, historical volume provenance, successful
complete inventories and explicit not-found responses for exact names/IDs.
Reused names, replacement clusters, foreign consumers, unavailable diagnostics,
active namespaces, incomplete archives and conflicting metadata cause refusal.
Kind cluster inventory is derived from Docker labels, without invoking Kind.

Only after repeated absence checks and protected-inventory comparisons does it
move `pending.json`, then `bootstrap-state.json`, byte-for-byte into
`.local/phase2-staging/reconciled-stale-e1fa939b-5894-470b-91f4-c574e119d90f/`.
An exclusive intent record, content hashes and receipt preserve the audit trail.
Partial transitions stop for review; they are never silently discarded. Repeated
successful invocations revalidate live absence and archive hashes but leave the
archive and receipt untouched. Timestamped command and before/after evidence is
under `artifacts/staging/reconciliation/<deployment-id>/`.

Stop after this reconciliation. A clean ownership state does not establish
foundation PASS or authorize application deployment.

The exact allowlist covers provider, account, cluster, context, namespace, network,
database, bucket, repository and DNS zone. The environment fingerprint includes
the deployment UUID, source-content SHA-256 (this extracted workspace lacks Git),
Docker daemon identity, node container ID and namespace UID. Live operations check
all these signals, the Kind cluster label, Docker network ownership label, and the
namespace fingerprint annotation. No command accepts an arbitrary target override.

State and the separate administrative kubeconfig live under ignored
`.local/phase2-staging/`. Treat the kubeconfig as a secret. It is never mounted in
an application pod or copied into an image. Keep that directory intact while the
cluster exists. Missing or mismatched ownership data causes an abort, not adoption.
A creation failure before the full identity is registered leaves `pending.json`
for diagnosis; it does not grant permission to tear down an unverified cluster.
Kind now uses `--retain` so failed control planes can be diagnosed before deletion.
The separately fingerprinted `bootstrap-state.json` records the exact node and
network IDs, deployment UUID, daemon identity and unoccupied baseline. Run
`node scripts/staging/main.cjs diagnose-bootstrap` to capture only core component
logs, kubelet logs, resource pressure, etcd latency metrics and network state.
No Secret values or kubeconfig contents are collected. Repeated diagnostic capture
archives the earlier result before writing the latest file.
If no namespace has been registered, `cleanup-bootstrap` requires this bootstrap
fingerprint and all independent live identity checks, no foreign network members,
no pre-existing mounted volumes, and captured diagnostics. It cannot clean a
registered application environment; that still requires the original guarded
`down`. If ownership is unavailable or mismatched, stop instead of adopting it.
If Kind has already removed the failed node, run
`node scripts/staging/main.cjs cleanup-pending`. This narrower operation requires
the original Docker daemon, matching network ownership UUID, an empty network,
no matching container, no registered Kind cluster, and no full environment state.
It removes only that network by ID and verifies unrelated inventories. It refuses
to remove a partially created cluster. Kind bootstrap output is retained under
`artifacts/staging/bootstrap/<deployment-UUID>/result.json` before application
credentials are generated; partial-network cleanup writes `cleanup.json` there.

`down` deletes only the verified named Kind cluster, checks that its network has
no other containers, removes only that network, and compares unrelated containers,
volumes and networks against recorded inventories. Kind's node-local PVC data is
disposable and is removed with its node. No Docker volume pruning, shared Compose
down, namespace wildcard deletion, or production/customer operation is performed.

## Topology and actual exposure boundary

```text
Host: http://localhost:31082 (IPv4 127.0.0.1)
  -> dedicated Docker bridge phase2-staging
  -> Kind node, loopback-published API server + gateway NodePort only
  -> gateway: allows only /api/v1/health and /api/v1/ready
  -> API -> PostgreSQL / Redis
     worker -> PostgreSQL / Redis
     verifier -> API / worker / PostgreSQL / Redis / MinIO / registry
```

Cluster Services and pod networking are internal to the dedicated Kind cluster.
The Docker bridge is distinct from the existing `kind` and development networks.
The API server's administrative port and gateway's host port bind only to
127.0.0.1. PostgreSQL, Redis, MinIO console, registry debug/admin, API administration,
and metrics have no host port, external IP, LoadBalancer or public ingress. Local
Docker administrators can still access resources: this is not internet-level
private-cloud isolation. Registry HTTP basic authentication is confined to this
local cluster boundary; no production TLS certification is claimed.

`localhost` uses the operating system's loopback resolution. Use
`http://127.0.0.1:31082/api/v1/health` if the browser prefers IPv6; only IPv4 is
published. No hosts-file edits or external DNS changes are required. This selects
the specification's documented local-domain option; TLS is not configured.

## Workloads, identities, data and secrets

PostgreSQL uses a dedicated database and a 1 GiB node-local PVC. Redis uses a
password, append-only persistence and a 256 MiB PVC. MinIO uses a dedicated bucket
and a 1 GiB PVC. Distribution registry uses a separate authenticated repository
and a 1 GiB PVC. Every recreation generates independent random credentials,
encryption and audit integrity keys, a metrics token, and a JWT verification key.
Only placeholders/generation logic are source-controlled. Kubernetes Secrets are
submitted over stdin; evidence does not contain Secret objects or values.

The API and idle worker use the existing durable PostgreSQL repositories and real
BullMQ Redis connection. `PLATFORM_ENVIRONMENT=staging` identifies this environment.
`NODE_ENV=staging` is a distinct validated runtime mode. Production configuration
also requires live GitHub, GHCR, AWS and signing credentials, outside this
foundation's scope. Authentication remains verified JWT, storage is PostgreSQL, and generated
integrity/encryption keys replace development defaults. External egress is denied.
No customer job is submitted and no external-provider placeholders are invented.
The foundation image deliberately omits build, deployment and signing tools.

There is no existing platform S3 business-storage adapter. The verifier uses the
application image/network and real S3 Signature V4 PUT/GET/DELETE against MinIO.
That proves staging-compatible storage operations, not production cloud S3
certification or integration of a new business feature. A zero-layer synthetic OCI
image proves authenticated registry push/pull and digest equality only.

Each workload has its own service account and no mounted Kubernetes token. No Role
or RoleBinding grants are needed by these foundation workloads. The health gate
uses live impersonated `kubectl auth can-i` checks for secrets, deployments, nodes
and namespace deletion. Application identities cannot deploy to any namespace.

## Policies, probes, resources and PDB decision

Default ingress and egress are denied. Explicit same-namespace policies permit
only required dependency ports, verifier health checks, gateway-to-API and DNS.
The gateway alone accepts NodePort ingress; its route allowlist prevents forwarding
administration or telemetry. An untrusted pod verifies six forbidden connections.
Source YAML is insufficient evidence of enforcement; the live health gate must pass.

PostgreSQL, Redis, MinIO and registry have dependency-aware startup, readiness and
liveness checks. API and worker use their actual readiness/liveness endpoints.
The gateway checks the API health route. The two diagnostic pods merely wait for
exec commands and do not serve traffic; probes are inapplicable to them. The
migration Job is finite and uses completion status.

CPU requests are 50m per workload and limits 500m. Memory requests are 128 MiB for
PostgreSQL/MinIO, 96 MiB for API/worker, and 64 MiB for smaller dependencies and
diagnostics. Limits are 384 MiB for PostgreSQL, 512 MiB for MinIO and 256 MiB for
the others. These are foundation-smoke budgets, not production capacity sizing.
PDBs are N/A for this single-node, single-replica disposable environment: a
minAvailable=1 budget would block intentional drain without providing redundancy.
Production HA, eviction availability and performance certification are excluded.

## Evidence and limitations

Successful verification writes `artifacts/staging/<fingerprint>/manifest.json`
and the rendered non-secret `deployment.json`. The manifest records observed
versions, pod image IDs, source and manifest hashes, dependency checks, network
tests, RBAC denials and executed commands. `teardown.json` records inventories and
removal checks. Per-invocation command/exit metadata is in `artifacts/staging/runs/`.

Read `docs/phase2-staging-report.md` for actual results and the acceptance matrix.
The blocker investigation measured slow etcd backend commits/WAL fsync and host
resource pressure with only the Kind foundation running. A viable host must first
pass the control-plane gate with its existing workloads, then have headroom for
the staging workload budget. Increasing only Docker's allocation on an already
memory-constrained Windows host is not an established remedy. No global settings,
unrelated workloads, component timeouts or security controls are changed here.
This runbook is procedure, not proof that a run passed. Phase 3 database recovery
certification and Phase 4 repository-to-deployment workflows are intentionally
not performed.
