# SECURITY AUDIT

## Scope: All CI/CD configs, infrastructure code, service code, and dependencies

---

## 1. Vulnerability Management

### Dependency Scanning
- ✅ Weekly scheduled SCA scans via `security.yml`
- ✅ Dependabot configured (`true` in dependabot.yml)
- ✅ npm audit for node services
- ✅ pip-audit for Python services
- ✅ Trivy container scanning in CI pipeline
- ✅ Gitleaks secret scanning in CI pipeline
- ❌ No Snyk or commercial SCA tool integration
- ❌ No CVE feed subscription outside GitHub Dependabot
- ❌ No vulnerability database for Go modules (missing `go.mod`)

### Third-Party Library Risks
- Services use bare-bones dependencies (Express for Node, http.server for Python, net/http for Go)
- No `package-lock.json` for `auth-service` (critical - supply chain risk)
- `platform-smoke-test` has no `package.json` at all
- No SBOM generation for Python or Go services (only Node via cycloneddx)

---

## 2. Identity and Access Management

### Secrets Management
- ✅ GitHub Actions secrets (referenced as `${{ secrets.* }}`)
- ✅ OIDC `id-token: write` configured (AWS auth via OIDC)
- ❌ NO actual OIDC setup - all OIDC references are placeholders
- ❌ No HashiCorp Vault or other secrets engine
- ❌ No secrets rotation policy documented
- ❌ Jenkins credentials are referenced (`jenkins-creds-id`) but no credential store shown

### Service Account and Permissions
- ✅ Workflow permissions are explicitly scoped
- ❌ No principle of least privilege analysis for Terraform IAM roles
- ❌ AWX/Terraform assume-role ARN is hardcoded placeholder (`arn:aws:iam::123456789012:role/terraform-deployer`)
- ❌ No IAM policy documents in the repository

### Container Registry Access
- ✅ GitHub Container Registry (ghcr.io) login configured
- ❌ No registry pull secrets for Kubernetes
- ❌ No image signing or content trust
- ❌ No registry firewall/whitelist configuration

---

## 3. Network Security

### Ingress/Egress Controls
- ❌ No NetworkPolicy manifests in Kubernetes
- ❌ No security group rules in Terraform
- ❌ No WAF configuration
- ❌ No ingress controller deployment (nginx/traefik/istio)
- ❌ No mTLS enforcement between services

### Service Communication
- All services communicate over plain HTTP (no HTTPS between services)
- No service mesh (Istio/Linkerd)
- No API gateway for authentication enforcement
- No rate limiting (no nginx, no envoy, no API gateway)

---

## 4. Container Security

### Dockerfile Issues
- ✅ Multi-stage builds in service Dockerfiles
- ✅ `USER` directive to run as non-root
- ✅ HEALTHCHECK implemented
- ✅ `.dockerignore` present for some services
- ❌ Missing `RUN apk upgrade` or `apt-get upgrade` in Dockerfiles (known vulnerabilities in base images)
- ❌ No `--no-cache` for pip/apk in some cases
- ❌ Base image tags are not pinned with digest (uses `:alpine`, `:20-alpine` instead of `@sha256:...`)
- ❌ No **Dockerfile.builder-bootstrap**: Only `docker-bootstrap.sh` exists which takes a service argument (`.github/workflows/ci.yml:80` calls it), but no Dockerfile is provided for the actual build.

### Container Scan Results (Expected)
- ❌ Trivy configured but NOT integrated with CI gate (scans run but don't block failing workflow)
- ❌ No fix version enforcement in pipeline
- ❌ No runtime security (Falco, AppArmor, Seccomp)

---

## 5. Cloud Security

### AWS
- ❌ Placeholder AWS account in tfvars: `123456789012`
- ❌ Placeholder Terraform state bucket: `your-org-terraform-state-dev`
- ❌ No S3 bucket policy for Terraform state (public/encrypted?)
- ❌ No DynamoDB for state locking
- ❌ No KMS key for state encryption

### All Clouds
- ❌ No security hub / security center integration
- ❌ No CIS benchmark checks
- ❌ No cloudtrail/audit log streaming configured
- ❌ Checkov runs but doesn't fail builds on critical findings

---

## 6. CI/CD Security

### Pipeline Hardening
- ✅ Explicit `permissions:` in workflows
- ✅ OIDC for auth (config, but not operational)
- ❌ No `actions/upload-artifact@v4` with proper retention
- ❌ Build artifacts are not signed/provenanced (no SLSA)
- ❌ No signed commits (no GPG requirement)
- ❌ No branch protection rules documented or enforced in code

### Supply Chain
- ❌ No `package-lock.json` committed for auth-service
- ❌ Dependabot configured but not verified active
- ❌ No attestation or in-toto metadata
- ❌ No provenance for Docker images (SLSA Level 0)

---

## 7. Code Security

### Static Analysis
- ✅ CodeQL configured in security.yml
- ✅ Gitleaks for secret scanning
- ✅ ShellCheck for shell scripts
- ✅ TFLint for Terraform
- ✅ Checkov for IaC security

### OWASP Top 10 Coverage
| Risk | Covered | Notes |
|------|---------|-------|
| A01: Broken Access Control | ❌ | No auth middleware, no RBAC |
| A02: Cryptographic Failures | ❌ | No TLS between services |
| A03: Injection | ⚠️ | SQL injection not applicable (no DB) |
| A04: Insecure Design | ❌ | Missing auth, input validation |
| A05: Security Misconfiguration | ❌ | Many placeholders, hardcoded values |
| A06: Vulnerable Components | ⚠️ | Dependabot configured but not enforced |
| A07: Auth Failures | ❌ | No auth at all |
| A08: Data Integrity | ❌ | No signature verification |
| A09: Logging/Monitoring | ⚠️ | Basic logging, no alerting |
| A10: SSRF | ⚠️ | Not applicable |

---

## 8. Secret Detection

### Current State
- ✅ Gitleaks scans in CI
- ✅ Pre-commit hooks not configured (but Gitleaks CI catches issues)

### Hardcoded Secrets Found
1. `.github/workflows/notify.yml:66-68` - Webhook URLs in workflow context (GitHub Secrets, acceptable)
2. `environments/dev/terraform.tfvars:8` - Placeholder account ID (not a real secret but a pattern risk)
3. `environments/prod/backend.hcl:3` - Placeholder bucket name (not a real secret)

---

## 9. Compliance & Governance

### Frameworks
- ❌ No SOC 2 controls documentation
- ❌ No PCI DSS applicability assessment
- ❌ No GDPR data handling documentation
- ❌ No HIPAA compliance for health-related services
- ❌ No audit log retention policy

### Policy Enforcement
- ❌ No OPA/Gatekeeper policies
- ❌ No Kyverno policies for Kubernetes
- ❌ No compliance-as-code

---

## 10. Security Score

| Category | Score (0-10) | Weight | Weighted |
|----------|--------------|--------|----------|
| Vulnerability Management | 4 | 15% | 0.6 |
| IAM | 3 | 15% | 0.45 |
| Network Security | 1 | 10% | 0.1 |
| Container Security | 4 | 15% | 0.6 |
| Cloud Security | 2 | 15% | 0.3 |
| CI/CD Security | 4 | 10% | 0.4 |
| Code Security | 5 | 10% | 0.5 |
| Compliance | 1 | 10% | 0.1 |

**Overall Security Score: 3.05 / 10**

## Critical Security Issues (Must Fix Before Production)

1. **No authentication on any service** - `/login` endpoint returns a static message
2. **No TLS/mTLS between services** - All communication is plain HTTP
3. **No IAM policy defined** - Placeholder ARNs everywhere
4. **Container images not pinned** - Digest pinning prevents tag mutation attacks
5. **No network policies** - All pods can reach all other pods
6. **Supply chain integrity** - No lockfile, no signing, no provenance
