# REFACTORING PLAN

## Priority-Based Refactoring Recommendation

---

## Phase 0: Immediate Fixes (Week 1)

These bugs block all pipelines and must be fixed immediately. Nothing else works until these are resolved.

### Fix 1: Deploy Script Argument Signature

**Files**: `deploy/deploy.sh`, ALL deploy workflows

**Option A (Recommended)**: Update workflows to match script signature:
```yaml
- name: Deploy
  run: |
    ./deploy/deploy.sh \
      "${{ matrix.service }}" \
      "k8s" \
      "${{ env.ENVIRONMENT }}"
```

**Option B**: Update script to accept workflow argument order (more flexible but requires keeping two conventions straight):
```bash
# Accept either: SERVICE PROVIDER [ENVIRONMENT]
# Or: SERVICE ENVIRONMENT IMAGE_REF TARGET [STRATEGY]
if [[ $# -ge 4 ]]; then
    # New style: SERVICE ENVIRONMENT IMAGE_REF TARGET [STRATEGY]
    SERVICE="$1"
    ENVIRONMENT="$2"
    IMAGE_REF="$3"
    TARGET="$4"
    STRATEGY="${5:-}"
elif [[ $# -ge 2 ]]; then
    # Old style: SERVICE PROVIDER [ENVIRONMENT]
    SERVICE="$1"
    PROVIDER="$2"
    ENVIRONMENT="${3:-dev}"
fi
```

### Fix 2: Fix Deploy Script Paths

**Files**: All deploy workflows (deploy-dev.yml, deploy-staging.yml, deploy-prod.yml, rollback.yml, hotfix.yml)

Change:
```yaml
- deploy/scripts/deploy.sh → ./deploy/deploy.sh
- deploy/scripts/rollback.sh → ./deploy/k8s/rollback.sh
```

### Fix 3: Fix Script Reference Names

**Files**: All Jenkinsfiles and shared library

| Wrong Path | Correct Path |
|-----------|-------------|
| `ci/versioning.sh` | `ci/version.sh` |
| `deploy/rollback.sh` | `deploy/k8s/rollback.sh` |
| `scripts/notify.sh` | Create or remove references |

### Fix 4: Create Terraform Root Configuration

**New files needed**:
- `terraform/main.tf` - Module calls
- `terraform/providers.tf` - Provider configs  
- `terraform/variables.tf` - Input variables

### Fix 5: Fix platform-smoke-test

Either remove the service or add a `package.json`:
```json
{
  "name": "platform-smoke-test",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node test/smoke-test.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

### Fix 6: Create Empty Service Placeholders

For `orders-service` and `payments-service`, either:
1. Remove from CI matrix if not needed yet
2. Create minimal Dockerfile + health endpoint

### Fix 7: Fix Test Files

Either:
1. Create real Jest test files
2. Or for now, create valid JS test stubs:
```javascript
test('placeholder', () => {
  expect(true).toBe(true);
});
```

---

## Phase 1: Structural Refactoring (Weeks 2-3)

### 1.1 CI/CD Unification

**Problem**: Two CI systems (GitHub Actions + Jenkins) with overlapping scripts

**Solution**: 
- Create a `scripts/ci/` directory as the single entry point
- Both CI systems call these scripts
- GitHub Actions composites become thin wrappers
- Jenkins pipelines become thin wrappers

```
scripts/ci/
├── build.sh        # Build and test a service
├── deploy.sh       # Deploy a service (single source of truth)
├── rollback.sh     # Rollback a service
├── security.sh     # Security scanning
├── terraform.sh    # Terraform operations
└── notify.sh       # Notifications (CREATE this file)
```

### 1.2 Service Directory Refactoring

**Problem**: Empty service directories broke CI

**Solution**: 
- Add `services.yml` as a registry of active services
- CI reads from this file instead of directory listing
- Empty directories are ignored

```yaml
# services/services.yml
services:
  - name: auth-service
    enabled: true
    ci: full
    deploy: k8s
  - name: platform-smoke-test
    enabled: false  # Not ready yet
  - name: orders-service
    enabled: false  # Not implemented yet
  - name: payments-service
    enabled: false  # Not implemented yet
```

### 1.3 Terraform Structure Refactoring

**Problem**: Missing root config, duplicate data sources, incomplete modules

**Solution**:
```
terraform/
├── main.tf                    # Module calls
├── providers.tf               # Provider configs
├── variables.tf               # Root variables
├── outputs.tf                 # Root outputs
├── modules/
│   ├── aws/service/           # Fix duplicate data sources
│   ├── azure/service/         # Add missing features
│   └── gcp/service/           # Minor fixes
├── environments/
│   ├── dev/                   # Add main.tf (if separate roots)
│   ├── staging/
│   └── prod/
└── platform/                  # Delete the 1-byte file
```

---

## Phase 2: Architecture Improvements (Weeks 4-6)

### 2.1 Environment Config Fix

**Problem**: Environment files are no-ops (self-referencing variables)

**Solution**: Environment files should provide DEFAULT values:
```bash
# deploy/environments/dev.env
ENVIRONMENT="${ENVIRONMENT:-dev}"
K8S_NAMESPACE="${K8S_NAMESPACE:-default}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-ghcr.io/org}"
LOG_LEVEL="${LOG_LEVEL:-debug}"
REPLICAS="${REPLICAS:-1}"
CPU="${CPU:-250m}"
MEMORY="${MEMORY:-256Mi}"
```

### 2.2 Kustomize Integration

**Problem**: `.env.${ENVIRONMENT}` files don't exist for kustomize generators

**Solution**: 
1. Create the `.env.*` files per environment
2. Or move to a different approach (ConfigMap from literals)

### 2.3 Service Templates

**Problem**: Templates have minor bugs

**Fixes**:
- Go template: Add `ReadHeaderTimeout`
- Node template: Add `/ready` endpoint
- Python template: Add gunicorn production server

---

## Phase 3: Observability (Weeks 7-8)

### 3.1 Add Metrics Endpoints

Add `/metrics` endpoints with Prometheus client libraries:
- Node: `express-prom-bundle` or `prom-client`
- Go: `prometheus/client_golang`
- Python: `prometheus_flask_exporter`

### 3.2 Deploy Prometheus Stack

Create Kubernetes manifests or Terraform to deploy:
- Prometheus Operator
- kube-prometheus-stack
- Grafana

### 3.3 Connect Ops Generators

Wire the existing ops generators into the deployment pipeline:
- `ops/prometheus/generate-prometheus.sh` → PrometheusRule CRDs
- `ops/grafana/generate-dashboards.sh` → Grafana ConfigMaps
- `ops/alerts/generate-alerts.sh` → AlertManagerConfig
- `ops/logging/generate-logging.sh` → Promtail DaemonSet

---

## Phase 4: Production Hardening (Weeks 9-12)

### 4.1 Security Hardening
1. Digest-pin base images
2. Add `RUN apk upgrade --no-cache` to all Dockerfiles
3. Add network policies
4. Add PodDisruptionBudgets
5. Add IAM roles for services
6. Add secrets management (Vault/external-secrets)

### 4.2 Testing
1. Create real test infrastructure
2. Jest config for auth-service (8-10 unit tests)
3. Integration tests with supertest
4. Terraform plan tests
5. Container structure tests

### 4.3 Multi-Cloud Parity
1. Fix Azure module (registry, probes, autoscaling)
2. Add logging to Azure module
3. Fix incorrect Azure→GCP SQL reference

---

## Summary of Files to Create

| File | Reason | Phase |
|------|--------|-------|
| `terraform/main.tf` | Missing root config | 0 |
| `terraform/providers.tf` | Missing provider config | 0 |
| `terraform/variables.tf` | Missing root variables | 0 |
| `terraform/outputs.tf` | Missing root outputs | 0 |
| `scripts/ci/notify.sh` | Referenced but doesn't exist | 0 |
| `deploy/k8s/base/.env.dev` | Referenced by kustomize | 2 |
| `deploy/k8s/base/.env.staging` | Referenced by kustomize | 2 |
| `deploy/k8s/base/.env.prod` | Referenced by kustomize | 2 |
| `platform/profiles/enterprise.env` | Missing production profile | 2 |
| `services/services.yml` | Service registry | 1 |
| `tests/` | Real test infrastructure | 4 |

## Summary of Files to Delete

| File | Reason | Phase |
|------|--------|-------|
| `terraform/platform` (1-byte) | Empty file, not a directory | 0 |
| All 4 test `*.test.js` files | They are shell scripts, not valid JS | 0 |
| `.gitkeep` in orders/payments | Empty dirs handled via services.yml | 1 |

## Summary of Files to Modify

| File | Change | Phase |
|------|--------|-------|
| All deploy workflows | Fix script path + argument order | 0 |
| All Jenkinsfiles | Fix script path references | 0 |
| `ci/sbom.sh` | Fix hardcoded Windows binary path | 0 |
| `deploy/environments/*.env` | Add real default values | 2 |
| AWS Terraform module | Remove duplicate data sources | 0 |
| Azure Terraform module | Add registry, probes, autoscaling | 4 |
| Go template | Add ReadHeaderTimeout | 2 |
| Node template | Add /ready endpoint | 2 |
| Python template | Use gunicorn | 2 |
| `ops/grafana/deploy.sh` | Fix stderr redirection bug | 3 |
| `deploy/k8s/base/deployment.yaml` | Fix misspelled variable | 0 |
