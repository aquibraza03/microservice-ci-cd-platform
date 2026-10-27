# Phase 2 Part 1 verification

**Observed:** 2026-09-14 UTC

## Entry-gate baseline

The Phase 1 ADRs and Checkpoint 1–5 reports were reviewed. Before editing, control-plane install, lint, 13 unit tests, 1 HTTP test, 30 deployment tests, 24 security tests, migration contract and production audit passed. Frontend locked install, lint (0 errors, 41 existing warnings), typecheck, 92 tests, production build and production audit passed. Authentication, centralized role boundaries, tenant isolation, GitHub repository ownership, deployment creation/state behavior all passed their existing automated suites.

Real PostgreSQL repository and migration tests failed before changes with `ECONNREFUSED 127.0.0.1:5432`; Docker and PostgreSQL were unavailable. This is the same documented infrastructure prerequisite, not a Phase 1 code regression. No Phase 1 repair or architecture amendment was required.

## Implemented verification

The focused backend suite covers service.yml precedence/evidence, Dockerfile-only, Node/Next.js, multiple monorepo candidates, stable IDs, conflicts, unsupported/low-confidence output, traversal input, symlinks, file count, file size, timeout, `.env` exclusion, draft recovery, optimistic conflict, invalid resources/context, commit drift, cross-tenant rejection and secret non-disclosure. The frontend test covers browser-persistence secret stripping. Production uses the real GitHub App checkout path; there is no detection mock fallback.

Tier 2 rules are experimental recognition only and are not claimed as runtime support.

## Final command results

| Command | Status | Result |
| --- | --- | --- |
| Control-plane `npm ci` | Passed | 217 locked packages |
| Control-plane `npm run lint` | Passed | No errors |
| Control-plane `npm run test:all` | Passed | 13 unit, 1 HTTP, 30 deployment, 9 detection/configuration and 24 security tests |
| Control-plane migration contract | Passed | Additive/static contract accepted |
| Control-plane production audit | Passed | 0 vulnerabilities |
| Frontend `npm ci` | Passed | 494 locked packages |
| Frontend lint | Passed | 0 errors; 41 pre-existing warnings |
| Frontend typecheck | Passed | TypeScript no-emit check |
| Frontend tests | Passed | 13 files, 93 tests |
| Frontend production build | Passed | 20 routes; `/services/configure` generated |
| Frontend production audit | Passed | 0 vulnerabilities |
| Real PostgreSQL repository tests | Blocked | `ECONNREFUSED 127.0.0.1:5432` |
| Real migration database test | Blocked | `ECONNREFUSED 127.0.0.1:5432` |
| Live GitHub immutable-checkout detection | Not run | GitHub App credentials unavailable |

No streaming logs, preview deployments, generated domains or rollback work was added in this checkpoint.
