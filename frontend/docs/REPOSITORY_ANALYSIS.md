# Repository Analysis Report

Scope: `/workspace` microservice platform — analysis performed once prior to frontend implementation.

## Repository Layout

```
/workspace
├── .github/            GitHub Actions workflows + actions (versioning, deploy, etc.)
├── ci/                 Per-stage CI scripts (build, test-*, policy, sbom, security, terraform-validate, ...)
├── scripts/            Tooling (setup, doctor, env-validate, generate-env, new-service, notify, aws-auth-check)
├── platform/           Platform config: schema.env, defaults.env, profiles/, load/validate scripts
├── services/           Microservices: auth-service, platform-smoke-test, orders-service (empty), payments-service (empty)
├── templates/          Service templates: node-service, go-service, python-service
├── deploy/             Docker + Kubernetes + Terraform deployment tooling
├── terraform/          Infrastructure as Code
├── docker/             Dockerfile templates / build assets
├── ops/                Observability (grafana, alerts) + operational scripts
├── test/               Bats test suites for ci/ and scripts/
├── docs/               Audit + enterprise reports
└── (frontend/)         NEW — frontend monorepo created by this implementation
```

## Existing Frontend

**None.** There is no `app/`, `pages/`, `components/`, `tailwind.config`, or Next.js/Vite project anywhere.
The frontend is greenfield and must be built as a self-contained monorepo (`frontend/`) to avoid
colliding with the backend platform's root tooling (root `eslint.config.mjs` targets plain Node `.js`).

## Existing Backend & Contracts

| Service               | Port | Contract                                                                                                                                                        |
| --------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-service`        | 3000 | GET/HEAD only; `/health` → `{status:"ok"}`; `/ready` → `{ready:true}`; `/login` → `{message}`; `/env` → `{service,env}`; unknown → 404 `{error}`; non-GET → 405 |
| `platform-smoke-test` | 3000 | Same shape as auth-service                                                                                                                                      |
| `orders-service`      | —    | Empty placeholder                                                                                                                                               |
| `payments-service`    | —    | Empty placeholder                                                                                                                                               |

**Key finding:** the backend `auth-service` is a _development stub_ (returns a static message at
`/login`, no real JWT/OIDC flow). Per the frontend mandate, the frontend auth layer must be
**provider-based and configuration-driven**, decoupled from the stub, so real identity providers
(JWT, OAuth2/OIDC, Keycloak, Okta, Auth0, Entra ID) can be plugged in without architectural change.

All backend services are Node 22 + plain CommonJS; no TypeScript. Services expose health endpoints
under `/health` and `/ready` which the frontend can use for connection/status checks.

## Toolchain

- Node v22.22.0, npm 10.9.4, registry reachable.
- No TypeScript config exists anywhere in the repo.
- Root lint is `eslint.config.mjs` (Node/CommonJS, mocha globals) — scoped to backend JS.
- No formatting config for frontend; Prettier is not installed.

## Environment Configuration

Backend env is driven by `platform/schema.env`, `platform/defaults.env`, and `environments/*/env.example`.
There are **no** `NEXT_PUBLIC_*` frontend variables. The frontend must introduce its own
`NEXT_PUBLIC_*` configuration surface (via `packages/lib` env resolver) so no URL/endpoint is hardcoded.

## Testing Strategy (existing)

- Bats (shell) suites under `test/shell/` — 26 suites / 194 tests.
- Mocha + chai + c8 per service; pytest (python template); Go test (go template).
- **No frontend test framework exists.** Vitest + React Testing Library + Playwright must be introduced.

## CI/CD (existing)

- GitHub Actions + Jenkins + per-stage `ci/*.sh` scripts with a service-based build model
  (`ci/build.sh <service> <env>`, Dockerfile per service).
- The frontend should follow the same model: its own Dockerfile + a `frontend` pipeline stage.

## Reusable Code & Assets to Extend (not duplicate)

- `ci/build.sh`, `ci/docker-buildx.sh`, `ci/test-unit.sh`, `ci/test-e2e.sh` — generic enough to
  drive a `frontend` service build/test once a `frontend/package.json` exists.
- `platform/schema.env` design-token philosophy — the frontend mirrors it with its own CSS design
  tokens rather than hardcoded colors.
- `.github/workflows/*` — pattern for adding a `frontend-ci.yml`.
