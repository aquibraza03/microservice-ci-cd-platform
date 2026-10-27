# Release workflow incidents
## Purpose
Recover deployment failure, stuck build, approval blockage, or policy failure truthfully.
## Symptoms
Stage timeout, queue age, waiting approval without eligible approver, or admission rejection.
## User impact
New releases are delayed or fail; healthy workloads should remain serving.
## Required access
Operator for operations, Approver for decisions, Security Admin for policy; no self-approval.
## Diagnostic queries
Inspect deployment state/version, stage events, queue attempts, approval snapshot hash, policy mode, and target health.
## Safe mitigation
Cancel idempotently, restore worker capacity, correct policy input, or use authorized emergency override with justification.
## Recovery steps
Revalidate credentials/snapshot, resume exactly once, verify immutable digest, readiness, health, route, and audit chain.
## Escalation criteria
SEV-2 for production blocked; SEV-1 if policy bypass or unsafe image executed.
## Recovery verification
Ordered status/logs, legal state, no duplicate deployment, expected digest healthy.
## Evidence preservation
Preserve deployment, job, approval, policy, request and trace IDs.
## Follow-up
Regression, policy review, capacity correction.
## Owner
Release Engineering.
## Last reviewed
2026-09-20.

