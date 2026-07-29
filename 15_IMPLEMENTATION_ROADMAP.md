# IMPLEMENTATION ROADMAP

## Phased Plan to Production Readiness

---

## Overview

**Goal**: Make this microservice platform production-ready  
**Current State**: Not production-ready (24 verified bugs, 0 passing pipelines)  
**Team Estimate**: 3-6 months (2 senior engineers)  
**Total Effort**: ~600-800 engineering hours  

---

## Phase 0: Emergency Fixes (Week 1 | 40 hours / engineer)

**Objective**: Unblock all pipelines and fix immediate failures

### Day 1-2: Pipeline Fixes (16 hours)
| Task | Hours | Owner | Dependencies |
|------|-------|-------|-------------|
| Fix deploy script argument ordering | 2 | DevOps | None |
| Fix deploy script paths in all workflows | 2 | DevOps | None |
| Fix Jenkins script references (8 paths) | 4 | DevOps | None |
| Fix `ci/sbom.sh` Windows binary path | 1 | DevOps | None |
| Output/verify: All 12 GHA workflows parse correctly | 4 | DevOps | None |
| Fix YAML quoting in terraform-plan.yml | 1 | DevOps | None |
| Fix misspelled variable in deployment.yaml | 2 | DevOps | None |

### Day 3-4: Service Fixes (16 hours)
| Task | Hours | Owner | Dependencies |
|------|-------|-------|-------------|
| Create `package.json` for platform-smoke-test | 2 | Backend | None |
| Create minimal Dockerfile for orders-service | 4 | Backend | None |
| Create minimal Dockerfile for payments-service | 4 | Backend | None |
| Fix all 4 auth-service test files (Jest stubs → real tests) | 6 | Backend | None |
| Add default values to environment files | 2 | DevOps | None |
| Create `.env.{dev,staging,prod}` for kustomize | 2 | DevOps | None |

### Day 5: Infrastructure Fixes (8 hours)
| Task | Hours | Owner | Dependencies |
|------|-------|-------|-------------|
| Create `terraform/main.tf` with module calls | 3 | Infra | None |
| Create `terraform/providers.tf` | 1 | Infra | None |
| Create `terraform/variables.tf` | 2 | Infra | None |
| Fix duplicate AWS data sources | 1 | Infra | None |
| Remove `terraform/platform` 1-byte file | 0.5 | Infra | None |
| Create `scripts/ci/notify.sh` (empty stub) | 0.5 | DevOps | None |

### Day 5 Verification (2 hours)
- Run all 12 GitHub Actions workflows locally via `act` or similar
- Verify CI pipeline completes for auth-service
- Verify terraform validate passes
- Verify all Jenkinsfiles parse correctly

---

## Phase 1: Structural Integrity (Week 2-3 | 60 hours / engineer)

**Objective**: Fix architectural issues, establish consistent patterns

| Task | Hours | Dependencies | Description |
|------|-------|-------------|-------------|
| CI/CD unification | 20 | Phase 0 | Create `scripts/ci/` single entry point, both CI systems call same scripts |
| Service registry | 8 | Phase 0 | Create `services/services.yml`, update CI to read from it |
| Terraform environment structure | 16 | Phase 0 | Create proper root + environment structure, add locking |
| Environment config refactoring | 8 | Phase 0 | Fix no-op env files with real defaults |
| Docker security hardening | 8 | Phase 0 | Digest pins, apk upgrade, .dockerignore for all services |
| Container tag strategy | 4 | Phase 0 | Consistent tagging, latest strategy, multi-arch buildx |
| Documentation audit | 8 | None | Update README/docs to match actual code |
| `.dockerignore` for all services | 4 | Phase 0 | Add missing .dockerignore files |
| `.gitignore` audit | 2 | None | Verify ignores are comprehensive |

---

## Phase 2: Services & Templates (Week 4-6 | 80 hours / engineer)

**Objective**: Make services production-quality, fix templates

| Task | Hours | Dependencies | Description |
|------|-------|-------------|-------------|
| auth-service production hardening | 24 | Phase 1 | Real auth logic, JWT, input validation, proper error handling |
| platform-smoke-test implementation | 16 | Phase 1 | Real health check logic, configurable endpoints |
| orders-service implementation | 40 | Phase 1 | Basic CRUD API with persistence |
| payments-service implementation | 40 | Phase 1 | Basic payment API (stripe integration) |
| Node template fixes | 6 | Phase 1 | Add /ready endpoint, proper shutdown |
| Go template fixes | 4 | Phase 1 | Add ReadHeaderTimeout, proper UUIDs |
| Python template fixes | 6 | Phase 1 | Add gunicorn production server, /metrics |
| Inter-service communication pattern | 8 | Phase 1 | Define and implement service-to-service calling convention |
| Shared libraries | 12 | Phase 1 | Create internal npm packages, Go modules |

---

## Phase 3: Observability (Week 7-8 | 60 hours / engineer)

**Objective**: Make the system observable

| Task | Hours | Dependencies | Description |
|------|-------|-------------|-------------|
| Add /metrics to all services | 16 | Phase 2 | Prometheus client libraries |
| Deploy Prometheus stack | 8 | Phase 1 | kube-prometheus-stack + Grafana Operator |
| Wire alert generator outputs | 8 | Phase 1 | PrometheusRule CRDs from generated YAML |
| Wire dashboard generator outputs | 8 | Phase 1 | Grafana dashboards from generated JSON |
| Wire logging generator outputs | 8 | Phase 1 | Promtail DaemonSet + Loki |
| Add structured logging | 8 | Phase 2 | JSON-formatted logs, correlation IDs |
| Alert routing | 4 | Phase 1 | Alertmanager config, PagerDuty/Slack integration |
| Grafana datasource provisioning | 2 | Phase 1 | Prometheus + Loki datasources |
| Distributed tracing | 12 | Phase 2 | OpenTelemetry instrumentation, Jaeger/Zipkin |

---

## Phase 4: Production Hardening (Week 9-12 | 100 hours / engineer)

**Objective**: Make the system reliable, secure, and scalable

### Security (30 hours)
| Task | Hours | Dependencies |
|------|-------|-------------|
| IAM roles for each service | 8 | Phase 1 |
| Network policies | 4 | Phase 1 |
| PodDisruptionBudgets | 2 | Phase 1 |
| Secrets management (external-secrets/Vault) | 8 | Phase 1 |
| TLS between services | 4 | Phase 1 |
| Container image signing | 2 | Phase 2 |
| RBAC for Kubernetes | 2 | Phase 1 |

### Testing (40 hours)
| Task | Hours | Dependencies |
|------|-------|-------------|
| Unit tests for auth-service | 8 | Phase 2 |
| Integration tests (supertest) | 8 | Phase 2 |
| Container structure tests | 4 | Phase 1 |
| Terraform plan tests | 4 | Phase 1 |
| E2E tests with testcontainers | 8 | Phase 2 |
| Load testing (k6) | 4 | Phase 3 |
| Chaos testing | 4 | Phase 4 |

### Multi-Cloud (20 hours)
| Task | Hours | Dependencies |
|------|-------|-------------|
| Fix Azure module (registry, probes, autoscaling) | 8 | Phase 1 |
| Fix Azure → GCP SQL reference | 2 | Phase 1 |
| Add logging to Azure module | 4 | Phase 1 |
| Add logging to GCP module | 4 | Phase 1 |
| Cross-region deployment | 2 | Phase 4 |

---

## Phase 5: SaaS Features (Month 4-6 | 160 hours / engineer)

**Objective**: Add multi-tenancy and SaaS capabilities

| Task | Hours | Dependencies | Description |
|------|-------|-------------|-------------|
| Auth integration (Auth0/Clerk) | 16 | Phase 2 | SSO, MFA, user mgmt |
| API Gateway (Kong/KrakenD) | 24 | Phase 4 | Rate limiting, auth, routing |
| Tenant provisioning API | 24 | Phase 4 | CRUD for tenants |
| Tenant ID in request pipeline | 8 | Phase 4 | Middleware, context propagation |
| Tenant-scoped databases | 16 | Phase 4 | Schema-per-tenant or tenant-id column |
| Usage metering | 16 | Phase 3 | Track requests, compute, storage per tenant |
| Admin dashboard | 24 | Phase 4 | Tenant mgmt, usage, billing |
| Billing integration (Stripe) | 16 | Phase 4 | Subscription plans, invoices |
| Self-service onboarding | 16 | Phase 4 | Signup flow, API key generation |
| Webhook system | 8 | Phase 4 | Outbound webhooks for events |
| Audit logging | 8 | Phase 3 | Immutable audit trail per action |

---

## Resource Estimate

| Phase | Hours/Engineer | Total Hours | Calendar Time | Confidence |
|-------|---------------|-------------|---------------|------------|
| Phase 0: Emergency | 40 | 80 | 1 week | 90% |
| Phase 1: Structural | 60 | 120 | 2 weeks | 80% |
| Phase 2: Services | 80 | 160 | 3 weeks | 70% |
| Phase 3: Observability | 60 | 120 | 2 weeks | 75% |
| Phase 4: Production | 100 | 200 | 4 weeks | 60% |
| Phase 5: SaaS | 160 | 320 | 8 weeks | 50% |
| **Total** | **500** | **1000** | **20 weeks** | |

**With 2 engineers in parallel**: ~12 weeks (3 months) for Phase 0-4 (production-ready)  
**With 3 engineers**: ~9 weeks for Phase 0-4  
**Full SaaS**: Add 4-6 months after production readiness

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pipeline failures continue after fixes | Low | High | Add CI integration tests |
| Terraform state management errors | Medium | High | Plan + manual approval |
| Service integration issues | Medium | Medium | Contract tests |
| Security review delays | Medium | Medium | Shift left with Checkov |
| Scope creep | High | Medium | Strict phase gating |
| Azure/GCP parity incomplete | Medium | Low | Start with single cloud |
| Team availability | Medium | High | Parallelize independent tasks |
