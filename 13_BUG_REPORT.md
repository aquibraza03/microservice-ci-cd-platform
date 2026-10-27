# BUG REPORT

## Verified Bugs Found in Pre-Production Codebase

---

## CRITICAL BUGS (Will Cause Pipeline/Deployment Failure)

### BUG-001: Deploy Script Argument Mismatch

**Severity**: CRITICAL  
**Location**: `deploy/deploy.sh:8-9` → called from ALL deploy workflows  
**Type**: Runtime Failure

**Description**: The `deploy/deploy.sh` script expects arguments in the order `SERVICE PROVIDER [ENVIRONMENT]`:
```bash
SERVICE="${1:?Usage: $0 <service-name> <provider> [environment]}"
PROVIDER="${2:?Provider required (aws|k8s|local)}"
```

But all GitHub Actions workflows pass arguments in the order `SERVICE ENVIRONMENT IMAGE_REF TARGET`:
```yaml
deploy/scripts/deploy.sh \
  "${{ matrix.service }}" \
  "${{ env.ENVIRONMENT }}" \
  "${{ needs.build-and-push.outputs.image_ref }}" \
  "${{ steps.target.outputs.type }}"
```

**Impact**: Every deployment workflow will fail. The `PROVIDER` variable receives the environment name (e.g., "dev"), the `ENVIRONMENT` variable receives the image ref, and the script falls through to error: "Unknown provider: dev".

---

### BUG-002: Non-Existent Deploy Script Path

**Severity**: CRITICAL  
**Location**: All GitHub deploy workflows (deploy-dev.yml:60, deploy-staging.yml:60, deploy-prod.yml:120, rollback.yml:45, hotfix.yml:70)  
**Type**: Runtime Failure

**Description**: All deploy workflows reference scripts at path `deploy/scripts/deploy.sh` and `deploy/scripts/rollback.sh`. These paths do not exist. The actual files are:
- `deploy/deploy.sh` (not in a `scripts/` subdirectory)
- `deploy/k8s/rollback.sh` (not in `deploy/scripts/`)

**Impact**: Every deploy/rollback step will fail with "No such file or directory".

---

### BUG-003: Missing Terraform Root Configuration

**Severity**: CRITICAL  
**Location**: `terraform/`  
**Type**: Validation/Runtime Failure

**Description**: The `terraform/` directory contains only `modules/` subdirectories and a 1-byte empty file named `platform`. There is no `main.tf`, `providers.tf`, `variables.tf`, or `outputs.tf` at the root. The CI workflow runs `terraform -chdir=terraform validate` which will fail with "No configuration files found".

Additionally, `environments/{dev,staging,prod}/` have `backend.hcl` and `terraform.tfvars` but no `main.tf` to consume them.

**Impact**: The `terraform-validate` step in CI always fails. The `terraform-plan.yml` workflow always fails.

---

### BUG-004: Non-Existent Script References (8 scripts)

**Severity**: CRITICAL  
**Location**: Multiple Jenkinsfiles and shared library  
**Type**: Runtime Failure

**Description**: The following scripts are referenced but do not exist in the repository:

| Non-Existent Script | Referenced By | Actual Path (if exists) |
|--------------------|---------------|------------------------|
| `ci/versioning.sh` | Jenkinsfile.deploy, Jenkinsfile.monorepo, Jenkinsfile.ops, ciPipeline.groovy | `ci/version.sh` |
| `scripts/notify.sh` | Jenkinsfile.deploy (x3), Jenkinsfile.ops (x2), ciPipeline.groovy | N/A (does not exist) |
| `infra/terraform-plan.sh` | Jenkinsfile.ops (x2) | N/A |
| `infra/terraform-apply.sh` | Jenkinsfile.ops (x2) | N/A |
| `ci/release.sh` | Jenkinsfile.ops | N/A |
| `release/release.sh` | Jenkinsfile.ops, ciPipeline.groovy | N/A |
| `ci/dependency-update.sh` | Jenkinsfile.ops, ciPipeline.groovy | N/A |
| `deploy/rollback.sh` | Jenkinsfile.deploy | `deploy/k8s/rollback.sh` |

**Impact**: Every Jenkins pipeline will fail at the point where these scripts are called.

---

### BUG-005: platform-smoke-test Missing package.json

**Severity**: CRITICAL  
**Location**: `services/platform-smoke-test/`  
**Type**: Build/Test Failure

**Description**: The `platform-smoke-test` service has a Dockerfile, source code (`src/server.js`), and a test directory, but no `package.json`. This means:
1. `npm ci` will fail (no lockfile + no package.json)
2. `npm test` will fail
3. The Docker build will fail at `COPY package*.json ./` and `RUN npm ci`

**Impact**: The CI pipeline fails for this service. The Docker build fails.

---

### BUG-006: Missing Dockerfile for orders-service and payments-service

**Severity**: CRITICAL  
**Location**: `services/orders-service/`, `services/payments-service/`  
**Type**: Build/Deploy Failure

**Description**: Both directories are empty (only `.gitkeep` file). No Dockerfile, no source code, no package.json. The CI pipeline tries to iterate over all service directories and will fail when trying to build these services.

**Impact**: CI will fail on matrix builds that iterate over all services.

---

### BUG-007: Test Files are Shell Scripts with .js Extension

**Severity**: CRITICAL  
**Location**: `services/auth-service/tests/unit/server.test.js`, `tests/unit/utils.test.js`, `tests/integration/api.test.js`, `tests/e2e/smoke.test.js`  
**Type**: Test Failure

**Description**: All test files are bash scripts with `.test.js` extensions:
```bash
#!/bin/bash -e
echo "unit test"
```

When Jest tries to run these files, it will fail with a syntax error because `#!/bin/bash -e` is not valid JavaScript. If Jest runs with default settings and Node.js tries to execute the shebang line, it will be treated as a syntax error.

**Impact**: `npm test` will fail when Jest attempts to load these files.

---

### BUG-008: `ci/sbom.sh` Hardcoded Windows Binary Path

**Severity**: HIGH  
**Location**: `ci/sbom.sh:10`  
**Type**: Runtime Failure

**Description**: Line 10 hardcodes a path to a Windows binary:
```bash
SYFT="./bin/syft.exe"
```

This will not exist on Linux CI runners. The script does not check the OS or provide a fallback to a Linux binary path.

**Impact**: SBOM generation will fail on Linux runners.

---

### BUG-009: Duplicate Terraform Data Source Declarations

**Severity**: HIGH  
**Location**: `terraform/modules/aws/service/main.tf` and `terraform/modules/aws/service/outputs.tf`  
**Type**: Terraform Plan/Apply Failure

**Description**: Both `main.tf` and `outputs.tf` declare the same data sources:
```hcl
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
```

Terraform will throw an error: "A data resource named 'current' of type 'aws_caller_identity' already exists."

**Impact**: Terraform plan/apply fails for the AWS module.

---

### BUG-010: Dockerfile References Non-Existent package.json for platform-smoke-test

**Severity**: HIGH  
**Location**: `services/platform-smoke-test/Dockerfile:11`  
**Type**: Build Failure

**Description**: The Dockerfile has:
```dockerfile
COPY package*.json ./
RUN npm ci
```

But this service has NO `package.json`. The `COPY` step will fail because the glob pattern matches nothing.

**Impact**: Docker build fails for this service.

---

## HIGH BUGS (Will Cause Operational Issues)

### BUG-011: Environment Config Files Are No-Ops

**Severity**: HIGH  
**Location**: `deploy/environments/dev.env`, `staging.env`, `prod.env`  
**Type**: Configuration Failure

**Description**: All three files contain only variable references without values:
```bash
ENVIRONMENT=${ENVIRONMENT}
K8S_NAMESPACE=${K8S_NAMESPACE}
IMAGE_REGISTRY=${IMAGE_REGISTRY}
```

When sourced by `deploy/deploy.sh`, these set variables to themselves (no-op). They provide zero default values. If the calling context doesn't set these variables, they remain empty or unset.

**Impact**: Deployments will use empty namespace, registry, etc.

---

### BUG-012: terraform.env File Parse Error

**Severity**: HIGH  
**Location**: `.github/workflows/terraform-plan.yml:66`  
**Type**: Runtime Failure

**Description**: Line 66:
```yaml
run: echo "TF_VAR_environment="${{ env.ENVIRONMENT }}"" >> $GITHUB_ENV
```

This has mismatched quotes. The inner double quotes around `${{ env.ENVIRONMENT }}` are inside the outer double quotes, creating invalid YAML/shell syntax.

**Impact**: GITHUB_ENV will be set with incorrect syntax. TF_VAR_environment may not be properly set.

---

### BUG-013: Argument Missing in Jenkins linux-amd64 Build Agent

**Severity**: HIGH  
**Location**: `jenkins/shared-library/vars/ciPipeline.groovy:86`  
**Type**: Build Failure

**Description**:
```groovy
'./ci/docker-buildx.sh',
```

The `ci/docker-buildx.sh` script requires a service name as the first argument. No argument is passed here.

**Impact**: Docker buildx step fails in Jenkins pipeline.

---

### BUG-014: Missing Platform Profile for Staging and Production

**Severity**: HIGH  
**Location**: `platform/profiles/`  
**Type**: Configuration Gap

**Description**: Only `startup.env` (mini config) and `growth.env` (medium config) exist. No production profile with appropriate HA settings (multiple replicas, higher resources, PDB, anti-affinity).

**Impact**: Production deployments will use under-resourced or inappropriate profiles.

---

### BUG-015: `.env.${ENVIRONMENT}` Files Don't Exist for Kustomize

**Severity**: HIGH  
**Location**: `deploy/k8s/base/kustomization.yaml:18-20, 22-24`  
**Type**: Kustomize Build Failure

**Description**: The kustomization.yaml uses `configMapGenerator` and `secretGenerator` with `envs: .env.${ENVIRONMENT}`. These files do not exist anywhere in the deploy directory.

**Impact**: Kustomize build will fail with "reading file .env.dev: file does not exist" (or similar).

---

## MEDIUM BUGS (Will Cause Suboptimal Behavior)

### BUG-016: Multi-line PromQL in YAML Alert Rules

**Severity**: MEDIUM  
**Location**: `ops/alerts/generate-alerts.sh:118-119`  
**Type**: Invalid YAML Output

**Description**: The backslash-continued PromQL expression produces multi-line YAML values that may not be valid or correctly parsed by Prometheus Operator.

---

### BUG-017: Grafana Dashboard Deployer Sends Body to Stderr

**Severity**: MEDIUM  
**Location**: `ops/grafana/deploy-dashboard.sh:36`  
**Type**: Operational Bug

**Description**:
```bash
response=$(curl -s -o /dev/stderr -w "%{http_code}" ...)
```
Response body goes to stderr, `$response` only has HTTP code.

---

### BUG-018: ECS Deploy Temp File Cleanup

**Severity**: MEDIUM  
**Location**: `deploy/ecs/deploy.sh:69-70, 126`  
**Type**: Resource Leak

**Description**: Temp file created but only cleaned up on success path (line 126). If script fails between lines 70-126, temp file is never cleaned up.

---

### BUG-019: HPA CPU-Only Scaling

**Severity**: MEDIUM  
**Location**: `deploy/k8s/base/hpa.yaml`  
**Type**: Configuration Gap

**Description**: HPA only uses CPU utilization for autoscaling. No memory-based or custom metrics. No scaling behavior stabilization.

---

### BUG-020: Missing ReadHeaderTimeout

**Severity**: MEDIUM  
**Location**: `templates/go-service/src/main.go:139-144`  
**Type**: Security/Stability

**Description**: Go server has `ReadTimeout` and `WriteTimeout` but no `ReadHeaderTimeout`, making it vulnerable to slow-header attacks (CVE-2023-44487 related).

---

## LOW BUGS (Cosmetic/Minor)

### BUG-021: Misspelled Template Variable
**Location**: `deploy/k8s/base/deployment.yaml:26`  
**Issue**: `__IMAGE_PULL_PULLICY__` (double "L" in PULLICY)

### BUG-022: Email Notification is a Placeholder
**Location**: `.github/workflows/notify.yml:95-97`  
**Issue**: `run: echo "Would send email..."` - never actually sends

### BUG-023: Makefile Empty
**Location**: `Makefile`  
**Issue**: 0 lines. Contains no targets.

### BUG-024: .platform-version Empty
**Location**: `.platform-version`  
**Issue**: 0 lines. Contains no version.

---

## Bug Summary

| Severity | Count | Examples |
|----------|-------|---------|
| CRITICAL | 10 | Deploy args, script paths, missing configs |
| HIGH | 5 | No-op configs, missing args, missing files |
| MEDIUM | 5 | YAML issues, missing features |
| LOW | 4 | Misspellings, empty files |

**Total Verified Bugs: 24**
**Bugs that Block Deployment: 10** (all CRITICAL)
**Bugs that Block CI: 7** (BUG-003, BUG-005, BUG-006, BUG-007, BUG-008, BUG-010, BUG-012)
