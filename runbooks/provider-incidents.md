# Provider incidents
## Purpose
Handle Kubernetes, registry, Git, DNS/TLS, secret-provider, or customer-cluster disconnection.
## Symptoms
Normalized provider timeout/rate limit, rollout failure, image pull, route/certificate failure, or secret resolution failure.
## User impact
Deployments/previews may fail or routes may be unavailable.
## Required access
Platform Engineer; Security Admin for credentials/secrets.
## Diagnostic queries
Inspect provider category, target capability, credential status/version, immutable digest, certificate expiry, and safe controller status.
## Safe mitigation
Pause new work, honor rate limits, rotate/revoke compromised credentials, retain healthy runtime; never weaken TLS or expose plaintext.
## Recovery steps
Revalidate identity and scope, retry idempotently, verify admission/rollout/route externally, reconcile state.
## Escalation criteria
SEV-1 for credential compromise or widespread outage; SEV-2 for multiple organizations blocked.
## Recovery verification
Provider test, target permission check, expected digest/health, route and certificate truthfully ready.
## Evidence preservation
Preserve safe provider request IDs, target fingerprint, timestamps, and audit IDs.
## Follow-up
Credential rotation and provider-limit review.
## Owner
Platform Integrations.
## Last reviewed
2026-09-20.

