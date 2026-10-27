# Billing and quotas

## Boundaries

The billing domain separates measurement, append-only ledger ingestion, aggregation, reconciliation, entitlements, quota enforcement, price estimation, and invoice preparation. Payment collection, card data, tax, and legally compliant invoicing are not implemented. Dashboard counters are never a charging source.

All billing boundaries use UTC and half-open periods `[start, end)`. Trusted server or durable source-event timestamps determine periods. A timestamp over five minutes in the future is rejected. Late events enter an open original period; closed-period changes require a linked adjustment. Raw events are retained independently from rebuildable aggregates. No end-to-end exactly-once claim is made: uniqueness constraints and idempotency keys provide effectively-once accounting.

## Meter catalogue

| Meter/version | Unit | Durable source | Included | Excluded |
|---|---:|---|---|---|
| `build_execution_seconds/v1` | second | Build stage start/end | Executed elapsed time, including failed/cancelled elapsed time | Queue wait, stages never started |
| `active_preview_seconds/v1` | second | Preview ready/cleanup lifecycle | Ready lifetime | Pre-ready failures |
| `deployment_count/v1` | count | Deployment creation | Accepted unique deployments | Rejected/idempotent duplicates |
| `organization_seat_count/v1` | seat-day | Active membership daily snapshot | Active humans | Invitations/service accounts |
| `custom_domain_count/v1` | domain-day | Domain daily snapshot | Verified active domains | Pending/failed/removed |
| `deployment_target_count/v1` | target-day | Target daily snapshot | Active validated targets | Draft/disabled/revoked |

Every definition in `src/billing/catalog.js` includes start/stop, rounding, minimum unit, deduplication, failure/cancellation, late-event, correction, and reconciliation rules. Bandwidth, artifact storage, and log bytes are deliberately unsupported until authoritative byte accounting exists.

## Ledger and corrections

`usage_events` is organization scoped and append oriented. The uniqueness key is organization, meter, meter version, and idempotency key. Raw quantity is an integer in the meter base unit. Corrections append a linked adjustment; finalized history is not rewritten. Aggregates are caches and can be rebuilt. Reconciliation records expected quantity, recorded quantity, difference, status, safe reason, and optional correction.

## Plans and entitlements

Plans are immutable versioned definitions. Subscriptions reference plan and version; time-bounded overrides are distinct records. Effective entitlement evaluation does not compare plan names in deployment code. `foundation/v1` and `team/v1` are technical examples, not commercial offers. The `standard_provisional` support tier is expressly provisional.

Plan changes apply at their effective time. Existing reservations continue until completion/expiry; new work uses the current entitlement. Downgrades do not terminate running production work or delete data.

## Quotas

Reservations are atomic in PostgreSQL via transaction/row-lock design and uniquely idempotent by organization/resource/key. The in-memory reference implementation is single-process only. A reservation has an owner operation, expiry, status, and version. Completion, cancellation, timeout, duplicate release, and crash reconciliation are explicit.

Quota exhaustion denies only new chargeable work with `QUOTA_EXCEEDED`. Preview cleanup, credential revocation, security remediation, required deletion, approved rollback, and incident recovery are always exempt. No active production deployment is terminated because a periodic quota was exhausted.

## Pricing

Estimates use integer minor units (`BigInt`), a three-letter currency, and immutable pricing versions. Binary floating point is forbidden. Amounts are estimates only. Payment collection, taxation, invoice legality, and automatic charging are absent.

## Security and access

Organization scope must come from authenticated server context and trusted resource relationships. Tenant IDs, prices, and resource IDs are forbidden metric labels. Billing administration and adjustment require dedicated authorization and audit events. There is no secret or payment credential field in the schema.

## Recovery

Restore raw ledger rows before rebuilding aggregates. Restore reservations, then reconcile active rows against durable operations before accepting new chargeable work. Unique keys make source replay safe. Audit-chain verification and tenant-boundary checks are mandatory after restore.

