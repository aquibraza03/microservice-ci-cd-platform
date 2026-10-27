# CODE AUDIT

## Source Code Analysis

### Files Analysed: 90+ source files

---

## SHELL SCRIPTS (45 files analysed)

### Critical Issues

#### 1. `deploy/deploy.sh` - Argument Signature Mismatch (CRITICAL)
```
Line 8-9: SERVICE="${1:?Usage: $0 <service-name> <provider> [environment]}"
           PROVIDER="${2:?Provider required (aws|k8s|local)}"
```
The script expects `SERVICE PROVIDER [ENVIRONMENT]` but ALL GitHub workflow call sites pass:
```
deploy/scripts/deploy.sh \
  "${{ matrix.service }}" \
  "${{ env.ENVIRONMENT }}" \
  "${{ needs.build-and-push.outputs.image_ref }}" \
  "${{ steps.target.outputs.type }}"
```
This passes `SERVICE ENVIRONMENT IMAGE_REF TARGET` - the provider (2nd arg) receives the environment name, which is never valid, so the script will fail with "Unknown provider: dev" (or similar).

#### 2. `deploy/environments/*.env` - Variable Indirection Broken (HIGH)
All three environment files contain only variable references without values:
```
ENVIRONMENT=${ENVIRONMENT}
K8S_NAMESPACE=${K8S_NAMESPACE}
IMAGE_REGISTRY=${IMAGE_REGISTRY}
```
When sourced by `deploy/deploy.sh` via `source "$ENV_FILE"`, these lines set variables to themselves (no-op). They do nothing because the variables are already set in the calling context. The files are essentially empty in terms of providing default values.

#### 3. `deploy/k8s/rollback.sh` - Unreachable Defaults (MEDIUM)
Lines 7-8 require NAMESPACE and ROLLOUT_TIMEOUT to be set:
```
: "${NAMESPACE:?NAMESPACE must be set}"
: "${ROLLOUT_TIMEOUT:?ROLLOUT_TIMEOUT must be set}"
```
But the GitHub workflows call `deploy/scripts/rollback.sh` (which doesn't exist) and pass `SERVICE ENVIRONMENT TARGET [IMAGE_REF]`. Even if the path was correct, NAMESPACE and ROLLOUT_TIMEOUT are never set anywhere.

#### 4. `ci/sbom.sh` - Hardcoded Windows Binary Path (HIGH)
Line 10: `SYFT="./bin/syft.exe"` - Hardcoded path to a `.exe` binary on Linux.

#### 5. `ci/build.sh` - Image Tag Collisions (MEDIUM)
Line 70: `LATEST_IMAGE="${REGISTRY:+$REGISTRY/}$SERVICE:latest"` - Always tags with `:latest`, which can cause race conditions with concurrent builds.

#### 6. `ci/security.sh` - Windows Detection (LOW)
Line 33: `command -v where >/dev/null 2>&1` - Checks for Windows `where` command on what is presumably a Linux CI runner.

#### 7. ShellCheck Warnings (HIGH)
All scripts should pass ShellCheck. Expected issues:
- Unquoted variable expansions (common in many scripts)
- `set -e` usage with commands that may fail legitimately
- `cd` without error checking in subshells

#### 8. `deploy/k8s/deploy.sh` - Main Function Called Without Arguments (MEDIUM)
Line 264: `main "$@"` - but the function `main()` doesn't use its arguments. The SERVICE variable is read from `$1` on line 4 before `main()` is invoked, so `$@` is empty at that point.

Wait, actually looking more carefully at the code structure - the script does `SERVICE="${1:?...}"` at the top level (line 4), then defines functions that use environment variables, and calls `main "$@"` at the end. But `$@` has already been consumed by line 4's assignment. The `main` function doesn't accept arguments, so `main "$@"` passes nothing. This works by accident because SERVICE is already set as a global variable.

### Potential Runtime Errors

#### 1. `ci/detect-services.sh` - Empty Array (MEDIUM)
Line 32: `if [ ${#SERVICES[@]} -eq 0 ]` - If no services changed and no fallback finds services, this exits 0 without setting any GITHUB_OUTPUT. Downstream jobs that depend on the matrix may fail.

#### 2. `ci/policy.sh` - Matrix Mode Recursion (MEDIUM)
Line 48: `"${BASH_SOURCE[0]}" "$svc"` - Recursively calls itself for each service. This works but is inefficient and could hit recursion limits with many services.

#### 3. `ops/grafana/deploy-dashboard.sh` - Stderr Redirection Bug (MEDIUM)
Line 36: `response=$(curl -s -o /dev/stderr -w "%{http_code}" ...)` - Outputs response body to stderr instead of capturing it. The `response` variable will only contain the HTTP status code, but the body will be printed to stderr.

#### 4. `ops/alerts/generate-alerts.sh` - Multi-line YAML Value (MEDIUM)
Lines 118-119: Multi-line PromQL expression is not valid YAML when embedded this way. The backslash continuation may not produce valid YAML.

---

## JAVASCRIPT / NODE.JS (4 files analysed)

### `services/auth-service/src/server.js`

#### Issue 1: No Error Handling for Missing Endpoints (LOW)
Line 38: Default handler writes "Auth service running" but doesn't set content-type consistently for root-level paths.

#### Issue 2: No Input Validation (MEDIUM)
Lines 21-27: The `/login` endpoint returns a static message with no validation, no authentication, and no credential handling. This is dangerously misleading - it suggests authentication exists when it does not.

#### Issue 3: Missing `package-lock.json` (HIGH)
The `package.json` exists but there is no `package-lock.json`. The GitHub Actions CI calls `npm ci` which will FAIL if there's no lockfile. The CI workflow has a fallback to `npm install --package-lock=false` in `ci.yml` but not in `test-matrix.yml`.

#### Issue 4: No health endpoint change propagation (LOW)
The Dockerfile's HEALTHCHECK (line 13-14) hardcodes the health path as `/health`, which works for the current code but should use the service.yml configuration.

### `services/platform-smoke-test/src/server.js`

#### Issue 1: No `package.json` (HIGH)
This service has a Dockerfile and source code but NO `package.json`. Therefore `npm test`, `npm ci`, and all Node.js tooling will fail. The CI pipeline will fail on this service.

#### Issue 2: No graceful shutdown logging (LOW)
Line 30: `console.log("SIGTERM received, shutting down")` - basic logging, no structured output.

### `templates/node-service/src/server.js`

#### Issue 1: Missing Ready Endpoint (MEDIUM)
The template only implements `/health` and `/` but not `/ready`. The deployment manifests reference `READINESS_PATH=/ready`.

#### Issue 2: Process Exit on SIGINT (MEDIUM)
Line 69: `process.exit(0)` in shutdown handler - this forces exit instead of letting the server close naturally.

---

## PYTHON (1 file analysed)

### `templates/python-service/src/app.py`

#### Issue 1: HTTPServer Not Production-Grade (MEDIUM)
The built-in `http.server.HTTPServer` is single-threaded and not suitable for production. Should use gunicorn or uvicorn.

#### Issue 2: No Metrics Endpoint (LOW)
No `/metrics` endpoint for Prometheus scraping.

---

## GO (1 file analysed)

### `templates/go-service/src/main.go`

#### Issue 1: Race Condition in Shutdown (MEDIUM)
Lines 151-162: The graceful shutdown goroutine calls `server.Shutdown()` but the main goroutine may be blocked on `server.ListenAndServe()`. This is actually the correct pattern. However, there's no synchronization to ensure the shutdown completes before `os.Exit`.

#### Issue 2: Request ID Generation (LOW)
Line 71: `requestID = fmt.Sprintf("%d", time.Now().UnixNano())` - This is not a proper UUID. Not a security issue but not best practice for distributed tracing.

#### Issue 3: No ReadHeaderTimeout Set (MEDIUM)
Line 139-144: `ReadTimeout` and `WriteTimeout` are set, but `ReadHeaderTimeout` is not, which could allow slow-header attacks.

---

## TERRAFORM (7 files analysed)

### Root Configuration Missing (CRITICAL)
- `terraform/` has no `main.tf`, `providers.tf`, `variables.tf`, or `outputs.tf`
- `terraform/platform` is an empty 1-byte file
- The CI workflow runs `terraform -chdir=terraform validate` which will fail

### `terraform/modules/aws/service/variables.tf`

#### Issue 1: `scaling_sanity_check` Validation Bug (MEDIUM)
Lines 100-112: This variable is a `bool` with a validation that references `var.desired_count`, `var.min_count`, and `var.max_count`. However, the validation will only run if the variable is explicitly set. The default is `true`, so the validation always runs. This works but is an unusual pattern that can confuse operators.

#### Issue 2: `load_balancer` Validation Regex Too Strict (LOW)
Line 142: `can(regex("^arn:.*:elasticloadbalancing:.*:targetgroup/.*", var.load_balancer.target_group_arn))` - This regex requires "elasticloadbalancing" which is AWS-specific. For NLB or ALB, the ARN format differs slightly.

### `terraform/modules/aws/service/outputs.tf`

#### Issue 1: Duplicate Data Sources (LOW)
Lines 4-6: `data "aws_caller_identity" "current" {}` and `data "aws_region" "current" {}` are declared in both `outputs.tf` AND `main.tf`. This is a Terraform error - duplicate data source declarations.

### `terraform/modules/azure/service/main.tf`

#### Issue 1: Missing `registry` Configuration (MEDIUM)
The container app needs registry credentials to pull private images but no `registry` block is configured.

#### Issue 2: Missing Liveness Probes (MEDIUM)
Only startup probe is configured, no liveness or readiness probes.

### `platform/service/variables.tf`

#### Issue 1: Undefined Variables (MEDIUM)
Variables like `container_port`, `allow_public_access`, `max_instance_request_concurrency`, `timeout_seconds` are declared here but some are not passed from environment files or have no defaults for all cloud providers.

---

## JENKINS GROOVY (7 files analysed)

### `jenkins/Jenkinsfile.monorepo`

#### Issue 1: Missing Service Argument in docker-buildx (CRITICAL)
Line 87: `sh './ci/docker-buildx.sh'` - This script requires a service name as the first argument (`Usage: $0 <service-name> [load|push] [image-prefix]`). Will fail with "Service not found" error.

#### Issue 2: Missing Service Argument in smoke-test (CRITICAL)
Line 94: `sh './ci/smoke-test.sh'` - This script expects a service URL as the first argument (`Usage: $0 <service-url>`). Will fail.

#### Issue 3: Wrong Deploy Argument (CRITICAL)
Line 106: `sh "./deploy/deploy.sh ${PLATFORM_ENV}"` - Script expects `SERVICE PROVIDER [ENVIRONMENT]`, but only `ENVIRONMENT` is passed. Missing service name and provider.

### `jenkins/Jenkinsfile.deploy`

#### Issue 1: Non-Existent Script References (CRITICAL)
Line 76: `script: './ci/versioning.sh'` - File is `ci/version.sh`
Line 170: `./deploy/rollback.sh` - File is `deploy/k8s/rollback.sh`
Line 157,181: `./scripts/notify.sh` - File does not exist

### `jenkins/Jenkinsfile.ops`

#### Issue 1: Multiple Non-Existent Scripts (CRITICAL)
Lines 105-109: References `./infra/terraform-plan.sh` and `./terraform/plan.sh` - neither exists
Lines 146-149: References `./infra/terraform-apply.sh` and `./terraform/apply.sh` - neither exists
Line 165: References `./ci/versioning.sh` - should be `./ci/version.sh`
Lines 197-202: References `./release/release.sh` and `./ci/release.sh` - neither exists
Line 90: References `./ci/dependency-update.sh` - does not exist

### `jenkins/shared-library/vars/ciPipeline.groovy`

#### Issue 1: Non-Existent Script References (CRITICAL)
Line 103: `./ci/versioning.sh` - does not exist
Line 166: `./scripts/notify.sh` - does not exist

---

## BASH SCRIPTING PATTERN ISSUES

### 1. `set -euo pipefail` with `curl || true` (LOW)
Many scripts use `set -euo pipefail` but then run `curl ... || true` to prevent pipefail from killing the script. This is a common pattern but can mask real network errors.

### 2. Missing Trap for Temp Files (MEDIUM)
Several scripts create temp files but don't clean them up on error. Examples:
- `deploy/ecs/deploy.sh` line 69-70: Creates a temp file but only cleans up on success (line 126)
- If the script fails between lines 70 and 126, the temp file persists

### 3. Redundant `chmod +x` (LOW)
Multiple workflow steps run `chmod +x` on scripts that are already committed with execute permissions (or should be).

### 4. Debug `console.log` in Production Code (LOW)
- `services/auth-service/src/server.js` line 7: Logs every single request at info level
- No log level filtering
