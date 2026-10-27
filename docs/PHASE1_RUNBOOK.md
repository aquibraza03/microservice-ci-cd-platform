# Phase 1 deployment runbook

## Delivery workflow

The separate worker checks out the verified commit, validates `service.yml`, runs configured tests and source checks, builds an OCI archive through rootless BuildKit, pushes it, resolves the registry-confirmed digest, scans the digest with Trivy, generates a CycloneDX SBOM with Syft, signs and attests with Cosign, verifies the signature, applies generated Kubernetes objects, waits for rollout, and checks readiness and liveness. `ready` is written only after every gate succeeds.

No user-supplied raw Kubernetes object is accepted. The provider generates Namespace, ServiceAccount, Deployment, Service and NetworkPolicy resources from validated service fields.

## GHCR setup and permissions

Set `REGISTRY_PROVIDER=ghcr`, `GHCR_OWNER`, `GHCR_USERNAME` and `GHCR_TOKEN`. Use a short-lived GitHub App/user token where possible. The minimum classic-token package permission is `write:packages` (which includes reading); private source access remains with the separate GitHub App installation token. Do not grant repository administration or delete-packages permission. The token is sent to `skopeo login` over standard input and stored only in the worker's ephemeral filesystem; it is never passed in command arguments, browser responses or logs.

Images use `ghcr.io/{owner}/{organization}-{project}-{service}` with commit and deployment convenience tags. Kubernetes always receives `{repository}@sha256:{digest}`, never a tag.

## Vulnerability, SBOM and signing policy

- Missing or malformed digest: block.
- Critical finding: block.
- High finding: warn by default; set `HIGH_VULNERABILITY_POLICY=block` for strict environments.
- Exception: disabled by default. Enabling `ALLOW_VULNERABILITY_EXCEPTIONS=true` still requires an ID, approver, reason, future expiry and included severity; the exception identifier is recorded in deployment history.
- Missing or failed signature verification: block.
- CycloneDX SBOM and SLSA-shaped provenance are attached/referenced with the digest metadata.

For local Kind, generate an encrypted Cosign key using `scripts/kind-up.sh`. For production, mount a managed signing key read-only or configure keyless identity and issuer constraints. Never store the private key in Git.

## Kubernetes security model

Namespaces are `platform-{organization-slug}` and workloads are `{project-slug}-{service-slug}`. Labels carry organization, project, service and deployment ID. Pods run non-root, disable service-account token mounting, prohibit privilege escalation, drop all capabilities, use RuntimeDefault seccomp and default to a read-only root filesystem. Every service requires requests/limits and startup/readiness/liveness probes. Rolling updates use zero unavailable replicas. A NetworkPolicy permits the service port and DNS egress only.

The worker identity needs namespace-scoped create/get/list/watch/patch/update/delete for Deployments, Services, ServiceAccounts and NetworkPolicies plus rollout observation. Namespace creation should be delegated to a trusted platform controller in stricter production clusters.

## Mandatory local Kind setup

Prerequisites: Docker/Compose v2, Node.js 22, `kind`, `kubectl`, `cosign`, `gh`, `git`, `curl`, `jq` and a GitHub App installation able to access newly created private repositories.

```bash
cp .env.example .env.local
cp services/control-plane-api/.env.example services/control-plane-api/.env
./scripts/kind-up.sh
cd services/control-plane-api && npm ci && npm run migrate && cd ../..
docker compose --env-file .env.local -f docker/docker-compose.pipeline.yml up --build -d
```

Start the frontend in a separate terminal:

```bash
cd frontend
npm ci
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001 npm run dev
```

Check dependencies before running the acceptance:

```bash
curl -fsS http://127.0.0.1:3001/api/v1/health
curl -fsS http://127.0.0.1:3002/health
kubectl --context kind-platform-local get nodes
curl -fsS http://127.0.0.1:5001/v2/
```

The Kind control-plane maps NodePort 30080 to `127.0.0.1:30080`. The worker reaches it through `host.docker.internal`; the acceptance script translates the recorded endpoint for host access. This is local-only and provides neither ingress, DNS nor TLS.

Run the fresh external-repository acceptance:

```bash
export PLATFORM_BEARER_TOKEN='a valid local platform JWT'
export GITHUB_INSTALLATION_ID='your GitHub App installation ID'
./scripts/golden-path-kind.sh | tee .local/golden-path-evidence.json
```

The script creates a fresh private GitHub sample repository, creates the organization/project/service, connects the installation and repository, deploys two commits, verifies the first endpoint and rolls the second deployment back to the first digest. It exits nonzero on failure and prints evidence only after `rolled_back`.

## Validation commands

```bash
bash -n scripts/*.sh
docker run --rm -v "$PWD:/work:ro" registry.k8s.io/kustomize/kustomize:v5.7.1 build /work/deploy/policy/checkpoint5
docker run --rm -i ghcr.io/yannh/kubeconform:v0.7.0 -strict -summary -ignore-missing-schemas < deploy/policy/checkpoint5/test/secure-resource.yaml
docker run --rm -v "$PWD:/work:ro" ghcr.io/kyverno/kyverno-cli:v1.15.2 test /work/deploy/policy/checkpoint5
kubectl --context kind-platform-local apply --dry-run=server -f deploy/policy/checkpoint5/test/secure-resource.yaml
```

The Kubernetes adapter repeats kubeconform and server-side dry-run for each generated release before server-side apply.

## Rollback and recovery

Rollback requires the centralized `deployment:rollback` permission, an idempotency key and a reason of at least eight characters. The platform creates a new immutable deployment record using the previous healthy deployment's digest and configuration snapshot, emits an audit event, applies it, waits for rollout and repeats health checks. It becomes `rolled_back` only after health succeeds. Database schema compatibility cannot be proven automatically and is prominently recorded as a warning. Local recovery target is five minutes (`KUBERNETES_TIMEOUT_MS=300000`), excluding image availability delays.

Retry registry rate limits and transient provider failures through BullMQ's bounded exponential retry policy. A worker interruption records `WORKER_INTERRUPTED` and resumes through a new attempt. Inspect authorized deployment events/logs and worker Prometheus metrics before retrying.

## Troubleshooting

- `REGISTRY_AUTH_FAILED`: validate GHCR owner/token and `write:packages`.
- `REGISTRY_DIGEST_MISSING`: do not deploy; inspect registry response.
- `CRITICAL_VULNERABILITY_BLOCKED`: patch/rebuild or obtain a time-bound audited exception.
- `SIGNATURE_VERIFICATION_FAILED`: verify key mount, identity/issuer and registry access.
- `KUBERNETES_OPERATION_FAILED`: check worker kubeconfig and namespace RBAC.
- `KUBERNETES_ROLLOUT_TIMEOUT`: inspect pods, image pull and resource scheduling.
- `READINESS_FAILED` or `LIVENESS_FAILED`: verify application paths and read-only filesystem compatibility.

## Known limitations / Phase 2

Production ingress, custom domains and automatic TLS; managed secret-provider implementations; multi-region control plane; autoscaling policy; ECR/GAR/ACR adapters; admission-controller installation automation; database migration compatibility analysis; and long-term log/artifact storage remain Phase 2.
