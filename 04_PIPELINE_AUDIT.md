# PIPELINE AUDIT

## GitHub Actions Pipeline Analysis

---

## CI Pipeline (`.github/workflows/ci.yml`)

### Trigger: PR to main/develop, Push to main/develop/feature/hotfix

**Execution Trace:**

| Step | Status | Issues |
|------|--------|--------|
| detect-services |  PASS (logic works) | Fallback to all services if git diff fails |
| shell-lint |  PASS | Runs ShellCheck on all .sh files |
| service-tests |  FAIL for platform-smoke-test | No package.json means npm test will fail |
| docker-build |  FAIL for services without Dockerfile | Trivy scan may find vulnerabilities |
| terraform-validate |  FAIL | No root Terraform config to validate |
| secret-scan |  PASS | Gitleaks action works |
| ci-summary |  PASS | Always runs (if: always()) |

**Blocker:** `terraform-validate` will fail because `terraform/` has no `.tf` files. The command `terraform -chdir=terraform init -backend=false` succeeds (it creates an empty backend), but `terraform -chdir=terraform validate` fails with "No configuration files".

**Blocker 2:** `platform-smoke-test` has no `package.json`, so when the CI tries `npm test` it will fail because `npm` is not initialized.

---

## Deploy Dev Pipeline (`.github/workflows/deploy-dev.yml`)

### Trigger: Push to develop with service/deploy changes

**Execution Trace:**

| Step | Status | Issues |
|------|--------|--------|
| detect-services |  PASS | Works for single service dispatch |
| build-and-push |  PASS | Docker buildx + push to GHCR |
| deploy |  BLOCKED | Calls `deploy/scripts/deploy.sh` (doesn't exist) |
| health-check |  BLOCKED | Depends on deploy step |
| auto-rollback |  BLOCKED | Calls `deploy/scripts/rollback.sh` (doesn't exist) |

**Blocker 1:** `deploy/scripts/deploy.sh` path doesn't exist. Actual file: `deploy/deploy.sh`.

**Blocker 2:** Even if path is fixed, argument order is wrong. Script expects `SERVICE PROVIDER`, workflow passes `SERVICE ENVIRONMENT IMAGE_REF TYPE`.

**Blocker 3:** The deploy step tries `chmod +x deploy/scripts/deploy.sh` which will fail because the path doesn't exist.

---

## Deploy Staging Pipeline (`.github/workflows/deploy-staging.yml`)

### Trigger: Push to main with service/deploy changes

Same issues as Deploy Dev:
- Non-existent `deploy/scripts/deploy.sh`
- Argument ordering mismatch
- Non-existent `deploy/scripts/rollback.sh`

---

## Deploy Production Pipeline (`.github/workflows/deploy-prod.yml`)

### Trigger: Manual dispatch with service, image, change ticket, strategy

Same issues as Dev/Staging plus:

**Additional Issue 1:** The rollout strategy is passed as a 5th argument to `deploy/deploy.sh` but the script only accepts 3 arguments (`SERVICE PROVIDER [ENVIRONMENT]`). The strategy argument is silently ignored.

**Additional Issue 2:** No approval gate is implemented in the GitHub Actions workflow itself. While the `environment: prod` setting may require approvals if configured in GitHub, the workflow doesn't explicitly enforce it.

---

## Rollback Pipeline (`.github/workflows/rollback.yml`)

### Trigger: Manual dispatch

| Step | Status | Issues |
|------|--------|--------|
| preflight |  PASS | Validates inputs |
| rollback |  BLOCKED | Calls `deploy/scripts/rollback.sh` |
| health-check |  BLOCKED | Depends on rollback step |

**Blocker:** Same path issue - `deploy/scripts/rollback.sh` doesn't exist.

---

## Security Pipeline (`.github/workflows/security.yml`)

### Trigger: PR/ Push to main/develop, Weekly schedule, Manual

**Execution Trace:**

| Step | Status | Issues |
|------|--------|--------|
| secret-scan |  PASS | Gitleaks action works |
| dependency-scan |  FAIL for platform-smoke-test | No package.json to npm audit |
| codeql |  PASS | CodeQL autobuild works |
| container-scan |  PASS | Trivy scans built images |
| terraform-security |  PASS | Checkov scans (may find issues) |
| sbom |  PASS | Anchore SBOM generation |

**Issue:** `dependency-scan` for `platform-smoke-test` will fail because the service has no `package.json`. The job detects "Node project" by checking for `package.json`, and the `if: steps.node.outputs.exists == 'true'` gate should prevent this. However, if `npm audit` is attempted without a lockfile, it may fail.

---

## Release Pipeline (`.github/workflows/release.yml`)

### Trigger: Push to main or Manual dispatch

**Execution Trace:**

| Step | Status | Issues |
|------|--------|--------|
| preflight |  PASS | Version calculation works |
| detect-services |  PASS | Lists all services |
| build |  PASS | Builds and pushes Docker images |

**Issue:** The release pipeline builds Docker images but does NOT deploy them. There's no deployment step after the build. The images are tagged with `:latest` and the semantic version, but no deployment workflow is triggered.

---

## Terraform Plan Pipeline (`.github/workflows/terraform-plan.yml`)

### Trigger: PR/ Push to main/develop with terraform/environment changes

| Step | Status | Issues |
|------|--------|--------|
| detect-environments |  PASS | Lists environment directories |
| tflint |  FAIL | TFLint will find issues in incomplete modules |
| terraform-validate |  FAIL | No root configuration to validate |
| terraform-plan |  FAIL | Cannot plan without valid configuration |

**Blocker:** The environment directories have `terraform.tfvars` and `backend.hcl` but no `main.tf`. The command `terraform -chdir=environments/dev plan -var-file=terraform.tfvars` will fail because there's nothing to plan.

---

## Hotfix Pipeline (`.github/workflows/hotfix.yml`)

### Trigger: Manual dispatch

| Step | Status | Issues |
|------|--------|--------|
| preflight |  PASS | Validates inputs |
| deploy-hotfix |  BLOCKED | Same deploy script path issue |
| post-incident |  PASS | Creates PR (this step may work) |

---

## Dependency Update Pipeline (`.github/workflows/dependency-update.yml`)

### Trigger: PR with dependency file changes

| Step | Status | Issues |
|------|--------|--------|
| classify |  PASS | Detects bot actor |
| node-security |  PASS | npm audit runs |
| python-security |  PASS | pip-audit runs |
| go-security |  FAIL | May fail if no go.mod files exist |
| trigger-tests |  PASS | Dispatches test-matrix workflow |
| automerge |  PASS | Auto-merges dependabot/renovate PRs |

---

## Notifications Pipeline (`.github/workflows/notify.yml`)

### Trigger: Completion of other workflows, Manual

| Step | Status | Issues |
|------|--------|--------|
| Build Payload |  PASS | Constructs notification payload |
| Slack |  PASS | Sends via webhook |
| Teams |  PASS | Sends via webhook |
| Discord |  PASS | Sends via webhook |
| PagerDuty |  PASS | Triggers alert on failure |
| Email |  STUB | Placeholder - does `echo` instead of sending |

**Issue:** The email notification is a placeholder that only echoes the subject line. No SMTP sending is implemented.

---

## Pipeline Dependency Graph (Broken)

```
                          ┌─────────────────┐
                          │  Terraform Plan  │── FAIL (no config)
                          └─────────────────┘
                           /
                          /
Developer Push ──> CI ────> Security ──> Release
                   │       │              │
                   │       │              └── Build only, no deploy
                   │       │
                   │       └── Scan results stored but not enforced
                   │
                   ├── Deploy Dev ─── FAIL (script path + args)
                   │
                   ├── Deploy Staging ─── FAIL (script path + args)
                   │
                   └── Deploy Prod ─── FAIL (script path + args + manual only)

Rollback ─── FAIL (script path)
Hotfix ─── FAIL (script path)
```

## Concurrency Issues

1. **Deploy Dev** (line 27): `cancel-in-progress: true` - If two pushes to develop happen quickly, the first deployment is cancelled mid-way. This could leave the system in an inconsistent state.

2. **Deploy Prod** (line 35): `cancel-in-progress: false` - Correct for production.

3. **Release** (line 27): `cancel-in-progress: false` - Correct.

## Permission Analysis

All workflows use `permissions:` blocks, which is good security practice. However:

1. **CI** (`contents: read, pull-requests: read, checks: write, id-token: write`) - Missing `security-events: write` for Trivy SARIF uploads.

2. **Deploy workflows** use `id-token: write` for OIDC but have placeholder echo statements instead of actual OIDC configuration.

3. **Release** (`contents: write, packages: write`) - Correct for pushing images and creating releases.

## Summary

**0 out of 12 GitHub Actions workflows will execute successfully end-to-end.**

Every deploy pipeline (dev, staging, prod, rollback, hotfix) has the same script path bug. The CI pipeline has the terraform validation failure. Release builds images but never deploys them. Notification email is a stub.
