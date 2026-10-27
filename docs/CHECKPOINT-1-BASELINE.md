# Checkpoint 1 baseline and verification report

**Observed:** 2026-09-13 UTC  
**Scope:** Baseline, frontend dependency remediation, repository hygiene, Phase 1 ADRs and reproducible local dependencies. Authentication, GitHub integration, workers and Kubernetes deployment were not implemented.

## Environment

Available: Node.js 24.19.0, npm 11.9.0, Python 3.12.14 and Java 17. The repository declares Node.js 22+ for the frontend, and CI now verifies it on Node.js 22.

Unavailable: Docker/Compose, Terraform, kubectl, Kind, Bats, Go, Maven, yq, pytest and gitleaks. Checks requiring these tools could not be executed. External hosted GitHub Actions and Jenkins were inspected only.

## Untouched baseline

| Check | Result before changes | Evidence |
| --- | --- | --- |
| Frontend `npm ci` | Pass | 494 packages installed from lockfile |
| Frontend production audit | **Fail** | 3 vulnerable packages: 1 critical (`next`) and 2 high (`postcss`, `sharp`) |
| Frontend lint | Pass with 41 warnings | 0 errors; existing TypeScript/Fast Refresh warnings retained |
| Frontend typecheck | Pass | `tsc --noEmit` |
| Frontend unit tests | Pass | 12 files, 92 tests |
| Frontend production build | Pass | Next.js 15.5.0; 19 pages generated |
| `auth-service` install/audit/lint/unit tests | Pass | 0 production vulnerabilities; 58 unit tests |
| `control-plane-api` install/audit/lint/unit tests | Pass | 0 production vulnerabilities; 5 unit tests |
| Control-plane migration contract | Pass | Static migration contract checks |
| `platform-smoke-test` install/audit/lint/unit tests | Pass | 0 production vulnerabilities; 8 unit tests |
| Python template tests | Blocked | `pytest` was not installed |
| Shell Bats suite | Blocked | `bats` was not installed |
| `make validate` | **Fail** | Archive shipped CI scripts without executable mode (exit 126) |
| Container builds and Compose health | Blocked | Docker/Compose unavailable |
| Terraform, Kubernetes and Kind validation | Blocked | Required CLIs unavailable; no cloud or cluster credentials supplied |

The archive also contained stale/generated `.coverage`, Python bytecode/cache, `junit.xml`, `frontend/tsconfig.tsbuildinfo`, and an ignored `.env.local`. Test and build runs generate `coverage/`, `.next/`, `node_modules/` and further TypeScript build information; these are not deliverable source.

## Changes and final results

The frontend now resolves `next@15.5.24`, `postcss@8.5.23` and `sharp@0.35.4`. PostCSS and Sharp are reviewed overrides because Next.js otherwise resolves vulnerable transitive versions. No forced audit fix was used.

| Check | Final result |
| --- | --- |
| `npm ci` (frontend) | Pass |
| `npm ls next postcss sharp --all` | Pass; secure versions resolved without invalid packages |
| `npm audit --omit=dev` (frontend) | Pass; **0 vulnerabilities** |
| `npm run lint` (frontend) | Pass with the same 41 warnings and 0 errors |
| `npm run typecheck` (frontend) | Pass |
| `npm test` (frontend) | Pass; 12 files, 92 tests |
| `npm run build` (frontend) | Pass; Next.js 15.5.24, 19 pages generated |
| All three Node package production audits | Pass; 0 vulnerabilities each |
| All three Node package lint commands | Pass |
| `auth-service npm run test:all` | Pass, including integration, contract and process-local E2E checks |
| `platform-smoke-test npm run test:all` | Pass, including integration and process-local E2E checks |
| `control-plane-api npm test` | Pass; 5 unit tests |
| `control-plane-api npm run test:migration` | Pass; static contract only |
| `control-plane-api npm run test:all` | Blocked/fail; real integration test could not connect to PostgreSQL at `127.0.0.1:5432` |
| Frontend Playwright E2E | Blocked/fail; Next development server hit `uv_interface_addresses` in this runtime before tests started |
| `make validate` | Pass after restoring script executable modes; YAML parsing skipped because yq is unavailable |

The GitHub CI frontend gate runs locked installation, the production audit at high severity, lint, typecheck, tests and build. A high or critical production advisory makes the job fail. Existing rules and tests were not weakened.

## Repository inspection summary

- Frontend: npm workspace containing a Next.js app and shared TypeScript packages.
- Backend: an early Node control-plane API with provider/repository abstractions and a PostgreSQL migration; no production OAuth or worker implementation.
- Reference workloads: `auth-service` and `platform-smoke-test`; these are validation fixtures, not built-in platform services.
- Automation: GitHub Actions, Jenkins pipelines/shared library, shell CI/deploy scripts and pinned action references exist. Hosted execution was not available.
- Infrastructure: Terraform environments and Kubernetes/Kustomize/policy manifests exist. They were not applied.
- Security/observability: gitleaks, Semgrep, dependency, image-scanning and observability assets exist, but external scanners and running collectors were not verified here.
- Secret review: targeted patterns for common private keys, GitHub, AWS, Google and Slack token formats returned no matches outside dependencies/build output. This is not a substitute for gitleaks history scanning because the ZIP has no Git history and gitleaks is unavailable.

## Architecture decisions

The ten accepted Phase 1 ADRs select: GitHub OAuth with a provider abstraction; GitHub App short-lived installation tokens; PostgreSQL; Redis/BullMQ; ephemeral isolated rootless BuildKit without a host Docker socket; GHCR; Kubernetes and Kind; SSE; local/managed secret adapters; structured logs and Prometheus-compatible metrics.

## Remaining external prerequisites

1. Docker Engine and Compose v2 to verify local PostgreSQL, Redis and optional registry health.
2. PostgreSQL runtime to execute the real control-plane repository integration suite and migration end to end.
3. Kind, kubectl and local-registry wiring to validate local Kubernetes deployment.
4. Terraform, provider credentials and a deliberately selected remote-state backend to validate/plan infrastructure.
5. GitHub OAuth app, GitHub App private key/webhook secret, GHCR permissions and callback/webhook URLs for later checkpoints.
6. A Kubernetes cluster, least-privilege service account, ingress/DNS/TLS, policy controller and managed secret provider for later deployment work.
7. Bats, Go, pytest, yq, Maven, shellcheck, hadolint, Checkov/tflint/tfsec, gitleaks, Semgrep and image scanners for their respective suites.
8. A supported Playwright environment and browser installation to rerun frontend E2E.

## Local dependency commands

```bash
cp .env.example .env.local
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml up -d --wait
```

Add `--profile kind` before `up` to start the registry. Stop while retaining data with:

```bash
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml --profile kind down
```

See `docs/local-development.md` for migration, health and deliberate volume-removal commands.
