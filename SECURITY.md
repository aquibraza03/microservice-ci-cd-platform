# Security Policy

## Enterprise audit trust boundary

Audit HMAC keys must be injected from a secret manager through
`AUDIT_INTEGRITY_KEY`; they must not be stored in PostgreSQL or exports. Application
roles cannot update or delete enterprise audit rows. Database owners remain in the
trust boundary and can bypass database triggers, so hash-chain verification detects
tampering but does not prevent it. Export grants are short-lived, header-carried,
hashed at rest by the durable schema, organization-scoped, and single-use.

Revoked provider credentials and changed secret references are revalidated before a
waiting approved deployment is queued. Jobs already in flight cannot always be
cancelled at the provider boundary; rotate/revoke upstream credentials, contain the
target, preserve correlated audit evidence, and reconcile observed runtime state.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

Report security vulnerabilities by opening an issue with the "security" label.

Do not disclose security vulnerabilities publicly until they have been addressed.

## Security Practices

- No secrets in code - use environment variables or secrets managers
- All container images are scanned for vulnerabilities in CI
- Dependency updates are automated via Dependabot
- Infrastructure changes require Terraform plan review
- Production deployments require approval gate
- Least-privilege IAM roles for all services
- Container images run as non-root users
- Network policies restrict pod-to-pod communication

Managed secrets are external references, not a platform vault. Provider secret values must never enter configuration snapshots, deployment records, approval records, queues, audits, API responses, browser storage, or logs. Runtime delivery uses External Secrets Operator references where supported. Build-time secrets are unsupported until an isolated BuildKit secret-mount path is separately verified.

Authorization is decided by the backend from current organization membership and trusted resource relationships. UI controls are advisory only. Report cross-tenant access, stale-permission access, final-owner removal, unmasked identifiers, or secret-value disclosure as security vulnerabilities.

## Release governance and Kubernetes admission

Protected actions use a canonical JSON snapshot and SHA-256 digest. Execution revalidates the policy version, current approver membership and authorization version, resource state and snapshot digest. Separation of duties denies self-approval, and an execution key makes approval consumption single-use.

Emergency override is owner-only, requires a recorded justification and emits a redacted security event. It does not bypass immutable-digest, signature, target-health or runtime verification performed by the deployment pipeline.

Kyverno is the only admission-policy engine. Platform preflight checks are feedback, not proof of admission enforcement. Target policy states retain `audit`, `unsupported`, `unknown` and `error` without converting them to compliant. Policy exceptions are exact-scope, approved, version-bound and time-limited. Exception expiry reports an already-running workload as noncompliant; it does not silently delete or overwrite it.

Drift detection reads workload metadata and desired state only. It does not resolve external secret values and performs no automatic remediation.
