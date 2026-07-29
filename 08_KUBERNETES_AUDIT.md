# KUBERNETES AUDIT

## Manifests Analysis

---

## Base Manifests Overview

```
deploy/k8s/base/
├── deployment.yaml     (55 lines)
├── service.yaml        (28 lines)
├── ingress.yaml        (38 lines)
├── hpa.yaml            (33 lines)
├── configmap.yaml      (18 lines)
├── kustomization.yaml  (31 lines)
└── namespace.yaml      (10 lines)
```

**Purpose**: Kustomize base overlays used by `deploy/k8s/deploy.sh` to render Kubernetes manifests via `envsubst`.

---

## deployment.yaml

```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: __SERVICE__
  namespace: __NAMESPACE__
  labels:
    app: __SERVICE__
    environment: __ENVIRONMENT__
```

### Issues

1. **Template Variables**: Uses `__SERVICE__`, `__NAMESPACE__`, `__ENVIRONMENT__`, `__IMAGE__`, `__IMAGE_PULL_POLICY__`, `__REPLICAS__`, `__CPU__`, `__MEMORY__`, `__MIN_READY_SECONDS__`, `__GRACEFUL_SHUTDOWN__`, health/readiness paths, probe settings - 15+ template variables that must be resolved via envsubst.

2. **No Resource Limits** (MEDIUM): Only `resources.requests` are defined (template variables). No `resources.limits` are set, which could lead to resource starvation on the cluster.

3. **Missing PodDisruptionBudget** (MEDIUM): No PDB defined for production workloads, could cause downtime during node maintenance.

4. **Default Image Pull Policy** (LOW): `__IMAGE_PULL_PULLICY__` is a misspelled template variable (double L in PULLICY). The envsubst will work regardless, but the misspelling is confusing.

5. **No Topology Spread Constraints** (MEDIUM): No pod anti-affinity or topology spread constraints for multi-AZ deployments.

---

## service.yaml

```
apiVersion: v1
kind: Service
metadata:
  name: __SERVICE__
  namespace: __NAMESPACE__
```

### Issues

1. **ClusterIP Default**: Uses default ClusterIP type. For internal services this is correct, but external services need LoadBalancer or NodePort.

2. **No Session Affinity** (LOW): Session affinity not configured. For stateful services, this could cause issues.

3. **No ExternalName Support**: No support for external service references.

---

## ingress.yaml

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: __SERVICE__-ingress
  annotations:
    kubernetes.io/ingress.class: __INGRESS_CLASS__
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
```

### Issues

1. **TLS Secret Hardcoded** (HIGH): Line 30: `secretName: __TLS_SECRET__` - TLS secret name is templated but the ingress always assumes TLS is configured. For dev environments without TLS, this will fail.

2. **No Custom Annotation Support**: Annotations are hardcoded. Cannot pass custom annotations (e.g., for rate limiting, CORS, auth URLs).

3. **Single Host**: Only supports a single host. For multi-domain services, this would need to be duplicated.

4. **Path Type Default** (LOW): `pathType: Prefix` is correct but not explicitly stated in the YAML (uses default). Best practice to be explicit.

---

## hpa.yaml

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: __SERVICE__
  minReplicas: __MIN_REPLICAS__
  maxReplicas: __MAX_REPLICAS__
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: __CPU_TARGET__
```

### Issues

1. **CPU-Only Autoscaling** (MEDIUM): Only CPU-based autoscaling. For memory-bound or custom metric-based services, this is insufficient.

2. **No behavior block** (MEDIUM): No `behavior` configuration for stabilizing scaling decisions. Default Kubernetes behavior can cause thrashing.
   ```yaml
   behavior:
     scaleDown:
       stabilizationWindowSeconds: 300
   ```

---

## configmap.yaml

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: __SERVICE__-config
  namespace: __NAMESPACE__
data:
  SERVICE_NAME: __SERVICE__
  ENVIRONMENT: __ENVIRONMENT__
  LOG_LEVEL: __LOG_LEVEL__
```

### Issues

1. **Limited Variables** (LOW): Only 3 config values. Most service configuration would need additional env-specific data.

2. **No Binary Data Support**: ConfigMap only uses `data` (text), no `binaryData` for binary configs.

---

## kustomization.yaml

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: __NAMESPACE__

resources:
  - namespace.yaml
  - deployment.yaml
  - service.yaml
  - ingress.yaml
  - hpa.yaml

configMapGenerator:
- name: __SERVICE__-config
  envs:
  - .env.${ENVIRONMENT}

secretGenerator:
- name: __SERVICE__-secrets
  envs:
  - .env.${ENVIRONMENT}
```

### Issues

1. **`envsubst` + Kustomize Conflict** (HIGH): The file uses both bash-style `__VARIABLE__` template vars AND Kustomize-style `${ENVIRONMENT}` template vars. These are resolved at different times:
   - `__VARIABLE__` is resolved by `envsubst` in `deploy/k8s/deploy.sh` before applying
   - `${ENVIRONMENT}` is NOT resolved by `envsubst` (envsubst only replaces `$VARIABLE` or `${VARIABLE}`)
   - Actually, looking at the script `deploy/k8s/deploy.sh`, it uses `envsubst` which DOES replace `${ENVIRONMENT}` too
   - But the `.env.${ENVIRONMENT}` file references will ONLY work if `ENVIRONMENT` is set in the shell environment AND envsubst is run on this file
   - **The problem**: `envsubst` is called on each YAML file individually in `deploy/k8s/deploy.sh` (line 24-32), but there's no `.env.dev` or `.env.staging` file in the `base/` directory! These files are referenced but don't exist.

2. **Missing Secret Files** (HIGH): The `secretGenerator` references `.env.${ENVIRONMENT}` files which don't exist anywhere in `deploy/k8s/`. The `configMapGenerator` has the same issue.

3. **namespace.yaml Included as Resource**: The namespace resource is included in the kustomize build, but `kubectl create namespace` may fail if the namespace already exists. Using `kubectl apply` would be safer.

---

## namespace.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: __NAMESPACE__
```

Standard namespace manifest with no issues.

---

## Deployment Script Integration

The `deploy/k8s/deploy.sh` script:

1. Sources `deploy/environments/${ENVIRONMENT}.env` (which are no-op files as noted earlier)
2. Sets template variables from environment or defaults
3. Runs `envsubst` on each YAML file
4. Applies via `kubectl apply -k deploy/k8s/base/`

### Issues

1. **Missing Defaults for Template Variables**: The script doesn't define all template variables used in the YAML files:
   - `__TLS_SECRET__` is not set anywhere
   - `__INGRESS_CLASS__` is not set
   - `__IMAGE_PULL_POLICY__` is misspelled and not set
   - `__CPU_TARGET__` is not set for HPA

2. **envsubst and kustomize Double Rendering**: Running `envsubst` on the files BEFORE kustomize potentially causes issues with kustomize's own variable substitution. The `${ENVIRONMENT}` in kustomization.yaml will be resolved by envsubst into a concrete value like `dev`, making it impossible to reuse the base for multiple environments without re-running envsubst.

---

## Kubernetes Cluster Requirements

The manifests assume:
- A Kubernetes cluster with `networking.k8s.io/v1` Ingress API
- NGINX Ingress Controller (or compatible with `nginx.ingress.kubernetes.io/ssl-redirect` annotation)
- Horizontal Pod Autoscaler (autoscaling/v2)
- Kustomize v4+ (configMapGenerator and secretGenerator with envs)
- Container runtime with image pull support

### Missing Cluster Components
- Cluster autoscaler configuration
- Metrics server (required for HPA)
- cert-manager for TLS certificates
- ExternalDNS for DNS management
- Prometheus/Grafana for monitoring

---

## Score: 4/10

Kubernetes manifests are structurally sound but have critical issues with:
1. Missing `.env.*` files for configMapGenerator and secretGenerator
2. Template variables not fully defined in the deploy script
3. No limits set on resources
4. CPU-only autoscaling with no stabilization
5. No PodDisruptionBudget for production workloads
