# Enterprise SaaS Platform — Frontend

Frontend foundation for the Enterprise SaaS platform. A TypeScript monorepo built with Next.js
(App Router), React 19, TailwindCSS, shadcn/ui-pattern components, TanStack Query, Zustand,
React Hook Form, Zod, Axios, Recharts, Framer Motion, xterm.js, and Monaco Editor.

## Structure

```
frontend/
├── apps/web/                 Next.js application
├── packages/
│   ├── config/               tsconfig, eslint, prettier, tailwind preset, design tokens
│   ├── types/                shared domain/contract types
│   ├── utils/                pure utilities
│   ├── lib/                  environment resolver, app config, logger
│   ├── hooks/                reusable React hooks
│   ├── services/             centralized API layer (Axios) + typed services
│   ├── features/             feature modules (auth, theme)
│   └── ui/                   enterprise design system
├── docs/                     architecture + analysis reports
├── tests/                    shared test utilities
└── scripts/                  monorepo scripts
```

## Prerequisites

- Node.js >= 22
- npm >= 10

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Commands

| Command                 | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | Start the web app in development                    |
| `npm run build`         | Production build of the web app                     |
| `npm run lint`          | ESLint across the monorepo                          |
| `npm run format`        | Prettier format                                     |
| `npm run format:check`  | Prettier check                                      |
| `npm run typecheck`     | TypeScript check across the monorepo                |
| `npm test`              | Vitest unit/integration tests                       |
| `npm run test:coverage` | Vitest with coverage gate                           |
| `npm run test:e2e`      | Playwright end-to-end tests                         |
| `npm run verify`        | Full gate: format → lint → typecheck → test → build |

## Configuration

Frontend configuration is environment-driven. See `apps/web/.env.example` and
`packages/lib/src/env.ts`. No URLs or endpoints are hardcoded.

## Architecture

See `docs/ARCHITECTURE_ANALYSIS.md` and `docs/REPOSITORY_ANALYSIS.md`.

## Design System

`packages/ui` implements the enterprise design system (shadcn/ui pattern on Radix UI). Every
component supports dark/light/system themes, keyboard navigation, loading/error/disabled states,
and consumes design tokens exclusively.
