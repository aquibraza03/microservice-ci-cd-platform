# Phase 2 Part 3

Phase 2 Part 3 adds immutable preview revisions, deterministic generated hostnames, Ingress routing, custom-domain proof and cert-manager certificate lifecycle tracking. Rollback remains unavailable.

## Lifecycle

Verified GitHub pull-request events map `opened`, `reopened`, and `synchronize` to revisions. `closed` and merged PRs schedule cleanup. Manual previews require a tenant-authorized immutable deployment reference. TTL reconciliation catches missed close events.

A preview is not ready until the referenced deployment is health-ready, Ingress exists, its Service backend resolves, Certificate is Ready when TLS is required, and the configured HTTP verifier reaches the expected service. Route status is stored independently.

Forks are marked from signed provider repository metadata, never branch names. Their revision explicitly disables protected secrets and chooses the untrusted secret profile. Shared organization namespaces use unique isolation labels and bounded policy values.

## Generated hostnames

Labels are lowercase DNS-safe values containing service/PR context and a 40-bit deterministic SHA-256 suffix over organization, service and PR identity. Reserved names, wildcards, invalid labels and overlength values are rejected.

## Custom domains

Input is normalized through IDNA to canonical ASCII. A cryptographically random token is returned once as a TXT instruction; only its SHA-256 hash is stored. Challenges expire, can be requested again, and activation is forbidden before verification. The database has a global unique hostname constraint, preventing cross-tenant double claims. Removal deletes owned route/certificate resources and invalidates the challenge.

## TLS

Certificate states are requested, pending, ready, failed, renewal pending, expired and removed. Readiness comes only from cert-manager status. Expiry warnings are exposed by reconciliation metrics/state.

## Operations

Set `PREVIEW_BASE_DOMAIN`, `PREVIEW_INGRESS_CLASS`, `CERT_MANAGER_CLUSTER_ISSUER`, preview TTL and challenge TTL. Kind hostname mapping is local-only. Production requires a DNS adapter and public HTTP verifier; their absence fails closed.
