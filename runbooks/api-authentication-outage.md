# API and authentication outage
## Purpose
Restore authenticated API journeys safely.
## Symptoms
Availability burn, login failures, elevated 5xx, or authorization latency.
## User impact
Users cannot authenticate or manage deployments.
## Required access
Incident commander and production read; deploy rights only for the engineering owner.
## Diagnostic queries
Inspect SLO dashboards, normalized routes, auth result categories, DB/Redis health, and recent releases.
## Safe mitigation
Drain a bad replica, halt rollout, or revert to a previously verified immutable release; do not bypass authentication.
## Recovery steps
Restore dependencies, redeploy verified artifact, expire compromised sessions if needed, and reconcile waiting jobs.
## Escalation criteria
SEV-1 if widespread or security-related; SEV-2 for major degradation.
## Recovery verification
Synthetic login, tenant denial test, API SLO recovery, and deployment read succeed.
## Evidence preservation
Preserve request/trace IDs, sanitized logs, release digest, and timeline.
## Follow-up
Post-incident review and regression test.
## Owner
Identity and Platform SRE.
## Last reviewed
2026-09-20.

