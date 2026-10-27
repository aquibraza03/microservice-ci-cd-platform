# ADR 0011: Preview isolation, Ingress routing, DNS and TLS

Status: Accepted — Phase 2 Part 3

## Decision

Use a shared namespace per organization (`platform-{organization-slug}`), with every preview revision identified by immutable deployment, preview, revision and isolation labels. Workload and route names derive from a collision-resistant isolation key. This avoids namespace explosion while retaining label ownership, restricted service accounts, NetworkPolicy and bounded CPU, memory, ephemeral-storage and TTL policy. Fork trust comes only from the HMAC-verified provider payload and provider repository IDs. Fork revisions use the `untrusted-preview` secret profile: no protected secrets, production credentials or production database references.

Use immutable preview revisions. A stable PR hostname selects only the latest healthy revision; old revisions remain addressable by stored identity until cleanup. Duplicate webhook delivery IDs and duplicate `(preview, commit)` revisions are idempotent.

Use Kubernetes `networking.k8s.io/v1` Ingress only. Gateway API is intentionally not supported in this checkpoint. Ingress matches the deployment architecture and existing NetworkPolicy allowance for ingress-controller pods. Route state is separate from deployment state.

Local Kind uses ingress-nginx, `*.preview.local` development hostname mapping, and either no TLS or a local CA issuer. A result is labeled `local`; it never proves public reachability.

Production uses a delegated `PREVIEW_BASE_DOMAIN`, a real DNS provider adapter, publicly resolvable A/AAAA/CNAME records, and an external HTTP check. DNS operations retain provider record IDs and tenant ownership. Without a configured provider, public DNS remains pending and is not reported verified.

TLS uses cert-manager `Certificate` resources and one configured `ClusterIssuer`. Manifest acceptance means requested, not ready. Only the Certificate Ready condition moves state to ready. Expiry is stored and surfaced as warnings; failed, renewal-pending, expired and removed remain distinct.

Cleanup is desired-state reconciliation, not webhook-only. Close/merge requests cleanup immediately; TTL scanning handles missed webhooks. Deletion checks exact stored IDs and ownership labels, retries exponentially, respects a finalizer deadline, detects labeled orphans, emits metrics, and writes audit events. Prefix-only deletion is forbidden.

## Consequences

Cluster namespace count stays proportional to organizations rather than pull requests. Shared namespace policy must be maintained carefully. Only one routing API and one certificate controller are supported, reducing ambiguity. Public DNS and trusted TLS require external infrastructure and cannot be claimed from local Kind tests.
