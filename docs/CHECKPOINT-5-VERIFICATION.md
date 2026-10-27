# Checkpoint 5 verification

## Implemented scope

Checkpoint 5 adds GHCR and local-registry providers, deterministic image naming, registry-confirmed digest enforcement, Trivy policy evaluation, CycloneDX SBOM generation/attachment, Cosign signing/attestation/verification, generated restricted Kubernetes resources, kubeconform/server-side dry-run gates, rollout and HTTP health verification, digest/configuration-based rollback, live frontend delivery states and a fresh-external-repository Kind acceptance harness.

## Executed results

| Command/check | Observed result |
| --- | --- |
| Control plane `npm ci` | Pass: 217 locked packages installed |
| Control plane `npm run lint` | Pass |
| Control plane `npm run test:all` | Pass: 13 unit, 1 HTTP, 30 deployment/worker/supply-chain/Kubernetes, 24 authentication/GitHub security tests |
| Control plane `npm run test:migration:contract` | Pass |
| Control plane `npm audit --omit=dev` | Pass: 0 vulnerabilities |
| Frontend `npm ci` | Pass: 494 locked packages installed |
| Frontend `npm run lint` | Pass: 0 errors, 41 pre-existing warnings |
| Frontend `npm run typecheck` | Pass |
| Frontend `npm test` | Pass: 92 tests |
| Frontend `npm run build` | Pass |
| Frontend `npm audit --omit=dev` | Pass: 0 vulnerabilities |
| `bash -n scripts/*.sh` | Pass |
| Golden sample `node --test` | Pass: 1 test |
| YAML/OpenAPI parsing | Pass: 66 YAML files |
| PostgreSQL database migration test | Fail: `ECONNREFUSED 127.0.0.1:5432` because PostgreSQL is unavailable |
| Redis/BullMQ integration test | Fail/timeout: Redis is unavailable |

## Infrastructure-dependent verification

This runner has no Docker, PostgreSQL, Redis, BuildKit, Kind, kubectl, Skopeo, Trivy, Syft, Cosign, Kustomize, Kubeconform or Kyverno executables. Therefore no container was built or pushed, no real digest was obtained, no scan/SBOM/signature was executed, no Kubernetes server-side dry-run or rollout occurred, no endpoint was accessed, and no live rollback occurred. GHCR credentials and an external-cluster kubeconfig were also unavailable.

The controlled automated test exercises provider contracts and verifies the complete ordered state sequence, fail-closed gates and rollback state behavior. Its synthetic values are test fixtures and are not production or end-to-end evidence.

## End-to-end evidence

| Field | Evidence |
| --- | --- |
| Repository | Not verified; fresh external repository creation requires GitHub authentication |
| Commit SHA | Not verified |
| Deployment ID | Not verified |
| Image digest | Not verified |
| Scan result | Not verified |
| Signature result | Not verified |
| Kubernetes namespace | Not verified |
| Endpoint | Not verified |
| Health result | Not verified |
| Rollback target | Not verified |
| Rollback result | Not verified |

Run `scripts/golden-path-kind.sh` in the documented prerequisite environment. It emits these fields only after real health and rollback success.
