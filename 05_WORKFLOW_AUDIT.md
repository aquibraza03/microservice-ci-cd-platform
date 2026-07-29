# WORKFLOW AUDIT

## GitHub Actions Workflow Analysis

### 12 Workflows Audited

| # | Workflow | Lines | Complexity | Status |
|---|----------|-------|-----------|--------|
| 1 | ci.yml | ~120 | Medium | FAIL (2 blockers) |
| 2 | deploy-dev.yml | ~90 | Medium | FAIL (2 blockers) |
| 3 | deploy-staging.yml | ~90 | Medium | FAIL (2 blockers) |
| 4 | deploy-prod.yml | ~105 | High | FAIL (3 blockers) |
| 5 | rollback.yml | ~75 | Low | FAIL (1 blocker) |
| 6 | security.yml | ~145 | Medium | PASS (warnings) |
| 7 | release.yml | ~85 | Medium | PASS (no deploy) |
| 8 | terraform-plan.yml | ~80 | Medium | FAIL (3 blockers) |
| 9 | hotfix.yml | ~85 | Medium | FAIL (1 blocker) |
| 10 | dependency-update.yml | ~85 | Medium | PASS |
| 11 | test-matrix.yml | ~65 | Medium | PASS |
| 12 | notify.yml | ~100 | Medium | PASS (stub) |

---

## Reusable Actions

### 5 Composite Actions Analysed

| Action | Lines | Inputs | Usage | Issues |
|--------|-------|--------|-------|--------|
| shell-lint/action.yml | ~20 | 1 | CI pipeline | None |
| terraform-checkov/action.yml | ~30 | 39 | Security pipeline | Good validation |
| docker-buildx/action.yml | ~60 | 7 | CI, Deploy, Release | Missing timeout |
| slack-notify/action.yml | ~40 | 8 | Notify pipeline | None |
| version-calc/action.yml | ~45 | 5 | CI, Release, Test-matrix | None |

### Detailed Issues

#### docker-buildx/action.yml
- **Missing Timeout**: No step-level timeout. A build that hangs could run indefinitely (runner default is 360 min).
- **No Cache Configuration**: Does not configure Docker layer caching, making repeated builds slower than necessary.
- **No BuildKit Configuration**: No `DOCKER_BUILDKIT=1` export for BuildKit features.

#### terraform-checkov/action.yml
- **Missing Output Handling**: Lines 59-64: The summarizer script checks results but doesn't fail the workflow on critical/severe findings. It only sets up the GitHub Summary. This means security issues are reported but not enforced.

#### version-calc/action.yml
- **Hardcoded `github.ref_name` Assumption**: Assumes branch name follows a specific format. If a tag is pushed, `github.ref_name` will be the tag name, not a branch name, which could break version calculation.

---

## Configuration Issues

### 1. Missing Concurrency Groups for Shared Resources
- `ci.yml` (line 9): `concurrency: ci-${GITHUB_REF}}` - Has concurrency per ref, good.
- `security.yml`: No concurrency group. If two PRs trigger the security workflow simultaneously, scans could conflict on image artifacts.
- `release.yml`: No concurrency group. Could run multiple releases concurrently, causing tag collisions.

### 2. Environment Configuration
- Deploy-dev (line 30): `environment: dev` - Correct
- Deploy-staging (line 30): `environment: staging` - Correct
- Deploy-prod (line 38): `environment: prod` - Correct but NO REQUIRED REVIEWERS configured at environment level in the workflow. This relies on GitHub environment configuration being set up separately.

### 3. Missing Matrix Strategy
- `deploy-dev.yml`: Matrix is defined but only runs all services when triggered by push. For `workflow_dispatch`, missing the `services` input.
- `deploy-staging.yml`: Same issue.
- `deploy-prod.yml`: Missing `services` input for `workflow_dispatch` entirely.

### 4. Conditional Triggers
- `deploy-dev.yml` (line 17): `paths: ['services/**', '.github/workflows/**', 'deploy/**', 'docker/**', 'environments/**']` - Does NOT include `ci/` directory, so CI script changes won't trigger a deployment. This is intentional but could cause confusion when CI fixes aren't deployed.
- `security.yml` (line 17): `paths-ignore: ['*.md', 'docs/**']` - Correct for ignoring documentation changes.

### 5. Job Dependencies
```
ci.yml:
  detect-services ──> shell-lint, service-tests, docker-build, terraform-validate, secret-scan
         │                              │
         └──────────────────────────────┴──> All run in parallel after detect-services
         │                                              │
         └──────────────────────────────────────────────┴──> ci-summary (always())

security.yml:
  secret-scan, dependency-scan, codeql ──> parallel
                │                                 │
                └─────────────────────────────────┴──> container-scan (needs: dependency-scan)
                │                                 │
                └─────────────────────────────────┴──> terraform-security (parallel)
                │                                 │
                └─────────────────────────────────┴──> sbom (needs: dependency-scan)
```

### 6. Path Filtering Issue in `ci.yml`
- Line 17-20: `paths-ignore: ['*.md', 'docs/**', '.github/**', '*.env']` - Ignores `.github/**` which includes workflow changes. This may be intentional, but workflow changes are CI-controlling files that should ideally trigger CI.

### 7. Workflow_call Usage
- `deploy-dev.yml` (line 8): `workflow_call` is defined but no workflow currently calls it. This pattern is useful but unused.
- `test-matrix.yml` (line 10): `workflow_call` with `service` input - properly consumed by `dependency-update.yml` (line 68).

---

## Workflow Pattern Analysis

### Best Practices Used:
- ✅ Explicit `permissions:` blocks in all workflows
- ✅ OIDC token configuration (`id-token: write`)
- ✅ Environment protection where applicable
- ✅ Matrix builds for multi-service deployments
- ✅ `if: always()` for summary steps
- ✅ Concurrency groups for deploy workflows

### Best Practices Missing:
- ❌ No workflow-level timeout
- ❌ No `ACTIONS_STEP_DEBUG` secret handling
- ❌ No status badge generation
- ❌ No workflow version pinning (uses `action/checkout@v4` which is fine, but `docker/setup-buildx-action@v3` and `docker/login-action@v3` should also be pinned)
- ❌ No `run-name` on workflows for better visibility in GH UI
- ❌ No force-cleanup/cancel logic for stuck builds

---

## Workflow Size Analysis

| Workflow | Steps | Jobs | Affected Services | Run Time (est) |
|----------|-------|------|-------------------|----------------|
| ci.yml | ~16 | 6 (+1 matrix) | Per detected changes | ~15 min |
| deploy-dev.yml | ~12 | 3 (+1 matrix) | All services | ~10 min |
| deploy-staging.yml | ~12 | 3 (+1 matrix) | All services | ~10 min |
| deploy-prod.yml | ~14 | 5 (+1 matrix) | All services | ~15 min |
| rollback.yml | ~10 | 3 | Single service | ~8 min |
| security.yml | ~18 | 6 (+1 matrix) | All services | ~20 min |
| release.yml | ~14 | 4 | All services | ~25 min |
| terraform-plan.yml | ~10 | 3 (+1 matrix) | N/A | ~5 min |
| hotfix.yml | ~12 | 3 | Single service | ~12 min |
| notify.yml | ~16 | 1 | N/A | ~1 min |
| dependency-update.yml | ~12 | 5 | Auto-detected | ~10 min |
| test-matrix.yml | ~10 | 2 (+1 matrix) | Per service | ~5 min |
