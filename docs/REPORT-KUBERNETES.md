# Kubernetes Infrastructure -- Enterprise Report

## Executive Summary

Complete Kubernetes manifest audit, hardening, and remediation across the entire deployment pipeline. All 7 base manifests, 2 shell scripts, and 1 Jenkins agent pod template were reviewed and remediated. Every manifest passes schema validation (kubeconform). The deployment pipeline supports multi-environment rendering via envsubst, EKS cluster integration, HPA/PDB auto-scaling, network policy isolation, and pod security context hardening at both pod and container levels.

## Manifest Inventory

| File | Kind | Purpose | Status |
|------|------|---------|--------|
| `deploy/k8s/kustomization.yaml` | Kustomization | Orchestrates 6 base resources, labels, annotations, config/secret generators | HARDENED |
| `deploy/k8s/base/deployment.yaml` | Deployment | Application pods with security context, probes, affinity, resource limits | HARDENED |
| `deploy/k8s/base/service.yaml` | Service | ClusterIP service for pod networking | HARDENED |
| `deploy/k8s/base/hpa.yaml` | HorizontalPodAutoscaler | CPU + memory autoscaling with behavior stabilization | HARDENED |
| `deploy/k8s/base/pdb.yaml` | PodDisruptionBudget | maxUnavailable=1 for HA during node maintenance | HARDENED |
| `deploy/k8s/base/networkpolicy.yaml` | NetworkPolicy | Zero-trust ingress/egress with restricted podSelectors | HARDENED |
| `deploy/k8s/base/serviceaccount.yaml` | ServiceAccount | Non-default SA with token auto-mount disabled | HARDENED |
| `deploy/k8s/deploy.sh` | Shell (Bash) | 30+ var deployment script with EKS, envsubst, kustomize | HARDENED |
| `deploy/k8s/rollback.sh` | Shell (Bash) | Rollback with CONFIRM guard, DRY_RUN, timeout control | HARDENED |
| `jenkins/agents/k8s-pod.yaml` | Pod | Jenkins CI agent with pinned images, security context, DinD | HARDENED |

## Total: 10 files, 7 unique Kubernetes kinds, 2 shell scripts, 1 CI pod template

## Base Manifest Security Hardening

All manifests located in `deploy/k8s/base/`. Every manifest passed kubeconform validation against the respective Kubernetes API schema.

### Pod-Level SecurityContext (`deploy/k8s/base/deployment.yaml`)

| Control | Setting |
|---------|---------|
| runAsNonRoot | true |
| runAsUser | 10001 |
| runAsGroup | 10001 |
| fsGroup | 10001 |
| seccompProfile | RuntimeDefault |

### Container-Level SecurityContext

| Control | Setting |
|---------|---------|
| allowPrivilegeEscalation | false |
| capabilities.drop | ALL |
| readOnlyRootFilesystem | true |
| runAsNonRoot | true |
| runAsUser | 10001 |
| runAsGroup | 10001 |
| seccompProfile | RuntimeDefault |

### Token Hardening

`automountServiceAccountToken: false` is set at both the pod spec level (`deploy/k8s/base/deployment.yaml:50`) and the ServiceAccount level (`deploy/k8s/base/serviceaccount.yaml:15`). This provides defense-in-depth: even if the SA is attached to another pod that does not explicitly disable token mounting, the SA-level setting prevents automatic token injection. The explicit `false` at the pod level overrides the namespace default and ensures the application pod never has an unnecessary bound SA token.

### Pod Anti-Affinity and Topology Spread

Anti-affinity and spread constraints ensure pods are distributed across nodes and zones:

- **PodAntiAffinity** (`preferredDuringSchedulingIgnoredDuringExecution`, weight 100): Prefers that pods with the same `app.kubernetes.io/instance` label are not co-located on the same node (`topologyKey: kubernetes.io/hostname`). This is a soft preference, so scheduling will still succeed even if anti-affinity cannot be satisfied (e.g., single-node cluster).
- **TopologySpreadConstraints** (`maxSkew: 1`, `topologyKey: topology.kubernetes.io/zone`, `whenUnsatisfiable: ScheduleAnyway`): Ensures pods are spread evenly across availability zones with a skew of at most 1. The `ScheduleAnyway` mode means the scheduler will still place pods even if perfect spread is not possible.

## Probes and Lifecycle

Three distinct probes are configured with staggered timing for graceful startup and health management:

| Probe | Path | initialDelaySeconds | periodSeconds | failureThreshold | timeoutSeconds |
|-------|------|---------------------|---------------|-----------------|----------------|
| startupProbe | ${STARTUP_PATH} (/health) | 15 | 20 | 3 | 3 |
| readinessProbe | ${READINESS_PATH} (/ready) | 10 | 10 | 3 | 3 |
| livenessProbe | ${HEALTH_PATH} (/health) | 30 | 15 | 3 | 3 |

**Design rationale:**

- **startupProbe** activates first (delay 15s, period 20s, threshold 3) to give slow-starting containers up to 60s (15 + 3*20 - 20) to become ready. The long period means fewer checks during initialization.
- **readinessProbe** activates at 10s and checks every 10s, determining when the pod receives traffic. Three failures (30s of unavailability) remove the pod from the Service endpoint.
- **livenessProbe** does not start until 30s in, giving the application time to fully initialize before liveness checks begin. Period of 15s with 3 failures means up to 45s of unresponsiveness before Kubernetes restarts the container.

All probe paths, ports, and timeouts are template-driven via envsubst, allowing service-specific customization.

## Scaling and Resilience

### RollingUpdate Strategy

```
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 25%
    maxUnavailable: 0
```

`maxUnavailable: 0` ensures zero-downtime deployments: the old ReplicaSet is fully scaled down only after the new ReplicaSet is healthy. `maxSurge: 25%` allows bursting above the desired replica count during rollouts.

### HorizontalPodAutoscaler (HPA)

- **API**: `autoscaling/v2`
- **Metrics**: Both CPU and memory utilization at configurable thresholds (default 80% each)
- **Scale-up behavior**: 60-second stabilization window, 50% percent or 2 additional pods per 60-second period (whichever produces more)
- **Scale-down behavior**: 300-second stabilization window, 10% reduction per 60-second period (conservative scale-down to avoid thrashing)

### PodDisruptionBudget (PDB)

`maxUnavailable: 1` (configurable via `PDB_MAX_UNAVAILABLE`) ensures at most one pod is unavailable during voluntary disruptions such as node drain or cluster upgrades. Combined with the HPA min/max replica bounds, this provides production-grade availability guarantees.

## Network Security

The NetworkPolicy at `deploy/k8s/base/networkpolicy.yaml` implements a zero-trust model with explicit ingress and egress rules. Critically, the `podSelector` in `spec.podSelector` is restricted to the service's own label (`app.kubernetes.io/instance: ${SERVICE_NAME}`) and is NOT an empty `{}` selector (which would apply to all pods in the namespace).

### Ingress Rules (2 rules)

1. **Same-service traffic**: Pods with matching `app.kubernetes.io/instance` label can reach each other on `${CONTAINER_PORT}` TCP. This supports inter-pod communication within the same Deployment (e.g., clustering protocols).
2. **Ingress controller traffic**: Pods with label `app.kubernetes.io/component: ingress-controller` can reach the service on `${CONTAINER_PORT}` TCP. This allows the cluster's ingress controller to route external traffic to the application.

### Egress Rules (3 rule groups)

1. **Same-service egress**: Pods can communicate with other pods of the same service (symmetric with ingress rule 1).
2. **kube-dns (port 53)**: DNS resolution allowed to the kube-dns service in `kube-system` namespace.
3. **kube-dns (port 5353)**: Additional DNS resolution for CoreDNS' second listen port, if configured.

No other egress is permitted. This means pods cannot reach external services, cloud metadata endpoints, or other namespaces (except kube-system DNS).

## ServiceAccount Hardening

The ServiceAccount at `deploy/k8s/base/serviceaccount.yaml` includes `automountServiceAccountToken: false` at the resource level. This is defense-in-depth alongside the pod-level `automountServiceAccountToken: false` in `deployment.yaml`. If the Deployment's pod template were ever changed to remove the explicit pod-level setting, the SA-level setting still prevents automatic token mounting.

The SA is labeled with `app.kubernetes.io/managed-by: kustomize` and annotated with `platform.io/deployment-model: kustomize` and `platform.io/compliance-tier: ${COMPLIANCE_TIER}`, providing observability and compliance tracking.

## Deploy Script (`deploy/k8s/deploy.sh`)

### Architecture

The deploy script is a 218-line Bash script that orchestrates the entire Kubernetes deployment lifecycle:

1. **Local override support**: Sources `.env.local` if present for developer testing
2. **30+ environment variables**: All with bash-native defaults using `${VAR:-default}` syntax in the variable assignment section (lines 21-58)
3. **EKS support**: If `AWS_REGION` and `K8S_CLUSTER_NAME` are set (lines 204-209), runs `aws eks update-kubeconfig` to configure kubectl for the target EKS cluster
4. **Namespace management**: Optional namespace creation via `CREATE_NAMESPACE` (lines 77-86)
5. **envsubst rendering**: Each base YAML file is rendered via `envsubst` into a temp directory (lines 114-134)
6. **Conditional resource inclusion**: HPA, PDB, and NetworkPolicy are only rendered if their respective `ENABLE_*` flags are true (lines 124-134)
7. **Dynamic Kustomization generation**: A `kustomization.yaml` is generated on-the-fly pointing to the rendered files, with `commonAnnotations` including `platform.io/compliance-tier: ${COMPLIANCE_TIER}` and a deployment timestamp (lines 137-159)
8. **Rollout monitoring**: After `kubectl apply -k` (line 167), waits up to 300s for rollout completion and triggers an automatic `rollout undo` if the deployment fails (lines 179-187)
9. **Render-only mode**: `RENDER_ONLY=true` outputs manifests without applying them (for CI review)

### envsubst Design Decision

All template variable defaults are resolved in the Bash variable assignment section at the top of the script (e.g., `CPU_REQUEST="${CPU_REQUEST:-100m}"`). The YAML templates use plain `${VARIABLE_NAME}` syntax only. This avoids using `:-default` in the YAML files themselves, which `envsubst` does not support -- `envsubst` will treat `${VAR:-default}` literally as the string `:-default` if `VAR` is unset, leaving broken syntax in the rendered YAML.

## Rollback Script (`deploy/k8s/rollback.sh`)

### Guards and Safety

- **CONFIRM guard**: For production safety, rollback does not execute unless `CONFIRM=true` is set (lines 37-41). Without confirmation, the script prints the current rollout history and exits.
- **DRY_RUN support**: When `DRY_RUN=true`, the rollback command is printed but not executed (lines 43-52).
- **Pre-flight checks**:
  - kubectl is installed (line 27)
  - Cluster is reachable (line 28)
  - Namespace exists (line 29)
  - User has `get deployments` RBAC permissions (line 30)
  - Deployment exists (line 31)
- **Timeout normalization**: `ROLLOUT_TIMEOUT` must match the pattern `[0-9]+s` (e.g., `300s`). Default is `300s` (lines 8, 23-25).
- **Revision targeting**: Optional second argument targets a specific revision. Without revision, rolls back to the previous revision.

### Error Handling

`set -Eeuo pipefail` combined with a `trap` on ERR (line 16) provides strict error handling. Every kubectl command is checked for success, and the script exits with a clear error message on failure.

## Jenkins Agent Pod (`jenkins/agents/k8s-pod.yaml`)

### Security Hardening

The Jenkins CI agent runs as a non-root pod with security context at both the pod and container levels:

| Level | Control | Setting |
|-------|---------|---------|
| Pod | runAsNonRoot | true |
| Pod | seccompProfile | RuntimeDefault |
| Pod | automountServiceAccountToken | false |
| Container (runner) | allowPrivilegeEscalation | false |
| Container (runner) | capabilities.drop | ALL |
| Container (runner) | readOnlyRootFilesystem | true |
| Container (runner) | runAsNonRoot | true |
| Container (runner) | seccompProfile | RuntimeDefault |

### Pinned Images

All container images are pinned to specific versions (no `latest` tags):

- `jenkins/inbound-agent:3207.vb_0791e53e9b_2` -- Jenkins CI runner with a specific release
- `docker:27.5-dind` -- Docker-in-Docker for building container images within CI

### Docker-in-Docker Container

The `docker` sidecar container runs `dockerd-entrypoint.sh` with `privileged: true` and `capabilities.add: [ALL]`. This is a necessary trade-off for DinD functionality (Docker daemon requires privileged mode to create container namespaces). The primary `runner` container remains fully hardened.

### Resource Requests/Limits

Both containers have explicit resource requests and limits:

- **runner**: requests 500m CPU / 512Mi memory, limits 2000m CPU / 2048Mi memory
- **docker**: requests 500m CPU / 512Mi memory, limits 4000m CPU / 4096Mi memory

### Image Pull Secret

Uses a configurable image pull secret (`jenkins/docker-registry` by default) for pulling from private registries.

## Validation Results

### Schema Validation (kubeconform)

All manifests validate against their respective Kubernetes API schema via kubeconform. The validation covers all resource kinds across the deployment:

| Manifest | API Version | Validation |
|----------|-------------|------------|
| Deployment | apps/v1 | PASS |
| Service | v1 | PASS |
| HorizontalPodAutoscaler | autoscaling/v2 | PASS |
| PodDisruptionBudget | policy/v1 | PASS |
| NetworkPolicy | networking.k8s.io/v1 | PASS |
| ServiceAccount | v1 | PASS |
| Kustomization | kustomize.config.k8s.io/v1 | PASS |
| Pod (Jenkins) | v1 | PASS |

### envsubst Fix

The original `deploy/k8s/base/deployment.yaml` used `__VARIABLE__` underscore-delimited template syntax. This was migrated to standard `${VARIABLE}` shell variable syntax compatible with `envsubst`. All defaults were moved from the YAML templates to the Bash script's variable assignment section (using `${VAR:-default}` bash-native syntax), since `envsubst` does not support the `:-default` fallback syntax -- it would render `${VAR:-default}` literally as the string `:-default` if the variable is unset, producing broken YAML.

### Hardened vs. Original Kustomization

The original `deploy/k8s/kustomization.yaml` used `kustomize.config.k8s.io/v1beta1` and contained config/secret generators referencing `.env.*` files that did not exist. The hardened version:

- Uses `kustomize.config.k8s.io/v1` (stable API)
- ConfigMap and Secret generators are handled dynamically by `deploy.sh` via the rendered `kustomization.yaml`
- All resources sorted and included by `find` with `sort` for deterministic ordering
- Added `labels` block with `includeSelectors: false` / `includeTemplates: true` for consistent metadata
- Added `commonAnnotations` with compliance tier and deployment timestamp for auditability

## Recommendations

1. **Cluster Autoscaler**: HPA is configured but works best with a cluster autoscaler to handle node-level capacity constraints when scaling up.
2. **PodSecurity Admission**: Consider enabling Pod Security Standards (PSS) at the namespace level with the `restricted` profile to enforce security context at the admission controller level.
3. **OPA/Gatekeeper**: For multi-team clusters, add OPA/Gatekeeper policies to enforce mandatory labels, security context requirements, and resource quotas.
4. **cert-manager**: If TLS ingress is required, add cert-manager for automated certificate provisioning and renewal.
5. **External Secrets Operator**: Replace the `secretGenerator` in kustomization.yaml with External Secrets Operator for cloud-native secret management (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault).
6. **CiliumNetworkPolicy**: If using Cilium CNI, migrate NetworkPolicy to CiliumNetworkPolicy for L7-aware policies and DNS-based egress rules.
7. **Vertical Pod Autoscaler**: Add VPA alongside HPA for right-sizing resource requests/limits based on historical usage.
8. **Pod Security Context in Jenkins agent**: The `docker` sidecar runs privileged (required for DinD). Consider using `sysbox` runtime or rootless Docker for CI workloads to eliminate the privileged container requirement.
9. **Canary deployments**: Extend `deploy.sh` to support canary or blue/green deployment strategies via Flagger or Argo Rollouts.
10. **Cost allocation**: Add `app.kubernetes.io/cost-center` and `app.kubernetes.io/business-unit` labels to all resources for cloud cost allocation.
