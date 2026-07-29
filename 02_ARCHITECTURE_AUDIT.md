# ARCHITECTURE AUDIT

## Repository Structure Analysis

### Directory Tree (Logical Groups)

```
/workspace/
├── .github/              # GitHub Actions + governance
│   ├── actions/           # 5 reusable composite actions
│   └── workflows/         # 12 workflow definitions
├── ci/                    # CI scripts (18 files)
├── deploy/                # Deployment engine
│   ├── ecs/               # ECS deploy/rollback/taskdef
│   ├── environments/      # Per-env config files (dev/staging/prod)
│   ├── k8s/               # Kustomize base + deploy/rollback scripts
│   └── providers/         # aws/k8s/local provider adapters
├── docker/                # Docker helpers
├── environments/          # Terraform backend + tfvars per env
├── jenkins/               # Jenkins pipelines
│   ├── agents/            # K8s pod template
│   ├── shared-library/    # Groovy shared lib + tests
│   └── Jenkinsfile.*      # 3 pipeline definitions
├── ops/                   # Observability
│   ├── alerts/            # Alert rule generator
│   ├── grafana/           # Dashboard generator + deployer
│   ├── logging/           # Logging config generator
│   └── prometheus/        # Prometheus config generator
├── platform/              # Platform config
│   ├── profiles/          # startup + growth profiles
│   ├── service/           # Multi-cloud Terraform module
│   ├── defaults.env       # Baseline config
│   └── schema.env         # Validation schema
├── scripts/               # Utility scripts (7 files)
├── services/              # Microservices (4 placeholders, 2 actual)
├── templates/             # Service blueprints (Go, Node, Python)
├── terraform/             # Terraform modules (aws, azure, gcp)
│   └── modules/
└── docs/                  # Documentation (8 files)
```

### Strengths

1. **Well-organized monorepo** with clear separation of concerns
2. **Platform-as-code** approach with profiles, schemas, and validation
3. **Multi-cloud target** architecture (AWS ECS, GCP Cloud Run, Azure Container Apps)
4. **Provider abstraction** pattern via `deploy/providers/*.sh`
5. **Environment isolation** via `environments/{dev,staging,prod}/`
6. **Service contract** pattern (`service.yml`) is well-defined

### Architectural Issues

#### 1. Missing Terraform Root Configuration (CRITICAL)
- `terraform/` contains only `modules/` subdirectories plus an empty 1-byte file named `platform`
- No `main.tf`, `variables.tf`, or `outputs.tf` at the terraform root
- The CI workflow runs `terraform -chdir=terraform init -backend=false && terraform -chdir=terraform validate` which will fail with "No configuration files" since `terraform/` has no `.tf` files
- Each environment directory has `backend.hcl` and `terraform.tfvars` but NO corresponding `.tf` file to consume them

#### 2. Inconsistent Config Paths (HIGH)
- `deploy/environments/dev.env` is referenced by `deploy/deploy.sh` but the GitHub workflows reference `deploy/scripts/deploy.sh` which does not exist (the actual file is `deploy/deploy.sh`)
- The AWX provider at `deploy/providers/aws.sh` calls `deploy/ecs/deploy.sh` but the `k8s` provider calls `deploy/k8s/deploy.sh` - these use different argument signatures

#### 3. Script-Not-Found Pattern (CRITICAL)
Multiple scripts are referenced but do not exist:
| Referenced Path | Actual Path | Occurrences |
|----------------|-------------|-------------|
| `ci/versioning.sh` | `ci/version.sh` | Jenkinsfiles, shared library |
| `scripts/notify.sh` | (does not exist) | Jenkinsfiles (6 refs) |
| `infra/terraform-plan.sh` | (does not exist) | Jenkinsfile.ops (2 refs) |
| `infra/terraform-apply.sh` | (does not exist) | Jenkinsfile.ops (2 refs) |
| `ci/release.sh` | (does not exist) | Jenkinsfile.ops |
| `release/release.sh` | (does not exist) | Jenkinsfile.ops, shared library |
| `ci/dependency-update.sh` | (does not exist) | Jenkinsfile.ops, shared library |
| `deploy/scripts/deploy.sh` | `deploy/deploy.sh` | All deploy workflows |
| `deploy/scripts/rollback.sh` | `deploy/k8s/rollback.sh` | All deploy workflows |

#### 4. No Shared Libraries or Packages (MEDIUM)
- `CODEOWNERS` references `packages/`, `libs/`, `shared/` directories that do not exist
- No shared code between services (no internal npm packages, Go modules, etc.)
- Services are siloed with no inter-service communication pattern defined

#### 5. No API Gateway or Service Discovery (HIGH)
- No ingress controller configuration
- No service mesh
- No API gateway for request routing, auth, rate limiting
- Services are expected to communicate directly (no defined pattern)

#### 6. Inconsistent Terraform Module Structure (MEDIUM)
- AWS ECS module is production-grade (Fargate with proper validation)
- GCP Cloud Run module is somewhat complete
- Azure module is incomplete (no proper health check mapping, no autoscaling config, no logging config)
- Azure module uses `azurerm_container_app` but missing `registry` configuration

#### 7. No Root `main.tf` in Environment Directories (CRITICAL)
- `environments/dev/`, `staging/`, `prod/` have `backend.hcl` and `terraform.tfvars` but no `main.tf`
- The terraform-plan workflow tries to run `terraform validate` and `terraform plan` in these directories, which will fail
- No Terraform provider configuration exists anywhere

#### 8. Documentation vs Reality Mismatch (HIGH)
- `README.md` claims `ci/test.sh web-test-service` but `web-test-service` doesn't exist
- Documentation references `deploy/k8s/deploy.sh web-test-service` but that service doesn't exist
- README describes elaborate workflows that don't match the actual code

### Separation of Concerns Analysis

| Layer | Status | Issues |
|-------|--------|--------|
| CI Scripts | OK | Some duplication between `ci/` and `.github/actions/` |
| Deploy Engine | BROKEN | Argument mismatch, missing scripts |
| K8s Manifests | GOOD | Well-structured with envsubst templating |
| Terraform | BROKEN | Missing root config, incomplete modules |
| Jenkins | BROKEN | 7+ references to non-existent scripts |
| Ops/Observability | INCOMPLETE | Generators only, no actual configs |
| Platform Config | GOOD | Schema, validation, profiles all present |
| Services | INCOMPLETE | Only 2 of 4 have code, and those are demo quality |

### Dependency Flow (Broken)

```
Developer Push
  └─> GitHub Actions Trigger
       └─> CI Pipeline
            ├─> shell-lint ✓
            ├─> service-tests → Only runs echo "tests running" (fake)
            ├─> docker-build → Works for services with Dockerfiles
            ├─> terraform-validate → FAILS (no root config)
            └─> secret-scan ✓
       └─> Deploy Pipeline
            ├─> build-and-push ✓
            └─> deploy → FAILS (argument mismatch + missing script)
```

### Recommendation

This architecture needs a **ground-up refactoring** to fix the script reference layering. The pattern of having both GitHub Actions and Jenkins with overlapping scripts creates a maintenance burden. Either:
- Choose one CI system and remove the other
- Or create a single `scripts/` API that both CI systems call consistently
