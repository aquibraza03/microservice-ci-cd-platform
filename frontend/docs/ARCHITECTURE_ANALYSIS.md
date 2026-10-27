# Architecture Analysis Report

Frontend Foundation for the Enterprise SaaS platform at `/workspace`.

## Architectural Decisions

### 1. Frontend Monorepo (`/workspace/frontend`)

The backend platform owns the repo root. The frontend is isolated in `frontend/` with **npm
workspaces** (npm 10, no extra tooling). Everything the frontend ships is inside this monorepo:

```
frontend/
├── apps/web/                 Next.js 15 (App Router) application
├── packages/
│   ├── config/               tsconfigs, eslint, prettier, tailwind preset, design tokens (CSS)
│   ├── types/                Shared domain/contract types
│   ├── utils/                Pure utilities (cn, formatters, storage, guards)
│   ├── lib/                  Environment resolver, application config, logger
│   ├── hooks/                Framework-agnostic React hooks
│   ├── services/             Centralized HTTP/API layer (Axios) + typed services
│   ├── features/             Feature modules (auth, theme); each owns components/hooks/api/types/validation/utils/constants
│   └── ui/                   Enterprise design system (shadcn/ui pattern on Radix + Tailwind)
├── docs/                     Frontend architecture + analysis reports
├── scripts/                  Monorepo scripts (verify, test)
└── tests/                    Shared test utilities/fixtures
```

### 2. Package Strategy

- **Source-first consumption**: packages export TypeScript source, consumed by Next.js via
  `transpilePackages` and by Vitest via esbuild. No per-package build step in V1 — removes build
  orchestration duplication while staying production-viable (standard monorepo pattern).
- **Barrel exports** (`index.ts`) per package, no circular imports (each package imports only
  `types`, `utils`, `config`, `services` — never `ui`).
- Dependency direction is strict: `apps/web → features → services → lib/utils/types/config → ∅`.

### 3. Feature-Based + Clean Architecture

Code is organized by feature, not file type. The `auth` feature owns its components, hooks, api,
types, validation, utils, and constants. Business logic lives in services/features, never in
`ui` components and never in React components.

### 4. State Management (three layers, no duplication)

- **Server state** → TanStack Query (single `QueryClientProvider`, per-feature query hooks).
- **UI state** → Zustand stores split by concern (`ui` store for sidebar/theme toggles, etc.),
  persist where appropriate.
- **React Context** used only for Authentication, Theme, and Application Configuration.

### 5. API Layer (single client, no direct `fetch`/Axios in components)

`packages/services` provides a configured Axios instance factory with: auth token injection,
automatic single-flight token refresh, idempotent retry with exponential backoff + jitter, timeout
strategy, AbortController wiring, request/response interceptors, unified typed error
normalization, and Zod response validation. Typed services (`authService`, `healthService`) map
the existing backend contracts. Backend gaps are documented and modeled as interfaces, never
invented.

### 6. Authentication (provider-based, config-driven, future-proof)

The backend `/login` stub is treated as **development-only**. A strategy interface
(`AuthProviderStrategy`) prepares JWT, refresh tokens, OAuth2/OIDC, GitHub/Google/Microsoft Entra,
Keycloak, Okta, Auth0. `AuthProvider` exposes `AuthContext` (session, tokens, restore, refresh,
logout, status). Endpoints come from `NEXT_PUBLIC_AUTH_*` configuration. Permission **hooks**
prepare for RBAC without implementing it. Full RBAC is deferred by design.

### 7. Design System (`packages/ui`)

Component governance: reusable, independently testable, accessible, keyboard-navigable,
dark/light/system theme, loading/error/disabled states, minimal typed props, no business logic,
no HTTP, no global state reads. Implemented on Radix UI primitives + `class-variance-authority`

- Tailwind design tokens (CSS variables). A chart wrapper uses Recharts; `CodeViewer` uses
  Monaco; `Terminal` uses xterm.js — all client-only, loaded via `next/dynamic` with fallbacks.

### 8. Routing (Next.js App Router)

- Root layout + providers; public layout (`(public)`); protected layout (`(protected)`) behind an
  auth guard; `login` route; future modules mount as sibling route groups without touching the
  routing architecture.
- `not-found.tsx` (404), global `error.tsx` (500), `loading.tsx` skeletons, error boundaries,
  middleware for route protection, and maintenance-mode / offline-mode flags.

### 9. Theme

`next-themes` provider; CSS custom-property design tokens (light/dark/system); components consume
tokens exclusively (no hardcoded colors).

### 10. Testing

- **Vitest + React Testing Library** unit tests for design-system components, hooks, utils,
  services (client/interceptors with mocked adapters), and the auth feature.
- **Playwright** E2E smoke in `apps/web/e2e`.
- Coverage gate enforced via Vitest (`--coverage`, thresholds in config).

### 11. CI / Docker

Follows the repo's per-service model: `frontend/Dockerfile` (Next standalone output) and a
`.github/workflows/frontend-ci.yml` running install → lint → typecheck → test → coverage → build.
Reuses the existing `ci/build.sh` conventions.

## Architecture Risks & Mitigations

| Risk                                        | Mitigation                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Backend auth is a stub                      | Provider-based strategy abstraction; config-driven endpoints; dev stub only as one strategy |
| Heavy client libs (Monaco/xterm) in bundles | `next/dynamic` (ssr:false) + lazy loading; isolated route-level chunks                      |
| Workspace version skew                      | Lockfile committed; root `engines`; central `packages/config` for tooling                   |
| Rerender churn in design system             | All composables use `useCallback`/`useMemo`; stores select slices; `memo` where valuable    |
| Monorepo circular deps                      | Strict import direction; verified by ESLint import rules + build                            |
| No backend frontend-auth contract           | `authService` models the stub; strategy interface documents the future contract             |

## Missing Functionality to Build (this phase)

1. Monorepo scaffolding + tooling configs.
2. Design token system + theme provider.
3. Full enterprise design system.
4. Centralized API client with refresh/retry/timeout/abort + typed services.
5. Auth architecture (provider, token/session manager, guards, hooks).
6. Next.js application shell (layouts, routes, error/loading/404/500, maintenance/offline).
7. Test foundation (Vitest + RTL + Playwright) with real tests.
8. Frontend CI workflow + Dockerfile.
