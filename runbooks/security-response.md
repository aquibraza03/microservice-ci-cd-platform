# Security response
## Purpose
Contain credential compromise or another security incident.
## Symptoms
Unauthorized access, leaked credential indicator, anomalous audit event, or policy bypass.
## User impact
Confidentiality, integrity, or availability may be at risk.
## Required access
Security incident commander and narrowly authorized operators.
## Diagnostic queries
Audit by correlation, actor/session, credential version and scope; avoid retrieving secret plaintext.
## Safe mitigation
Revoke affected credentials/sessions, block new work, contain scope, preserve evidence; revocation is quota-exempt.
## Recovery steps
Rotate from a trusted system, revalidate waiting/retried jobs, reconcile resources and notify affected owners.
## Escalation criteria
SEV-1 for confirmed compromise, tenant escape, or unsafe production execution.
## Recovery verification
Old credentials fail, new identity/scope validates, audit chain verifies, no waiting job uses revoked state.
## Evidence preservation
Forensic timeline, audit export, key versions, hashes and access record under legal guidance.
## Follow-up
Post-incident review and trust-boundary correction.
## Owner
Security.
## Last reviewed
2026-09-20.

