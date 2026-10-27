# Release-governance operations

- Start new Kyverno assignments in `Audit`. Change to `Enforce` only after the target capability probe confirms an active admission webhook and a negative admission test succeeds.
- A target reporting `unknown`, `unsupported` or `audit` is not enforcing policy.
- Production approval workers must lock the request, create one protected execution key and enqueue one job in the same durable transaction.
- Alert on approvals near expiry, failed executions, emergency overrides, exceptions near expiry, Kyverno status changes and inaccessible drift checks.
- Exception expiry does not delete a running workload. Report noncompliance and reconcile through an authorized deployment.
- Drift reports are diagnostic and never automatically mutate the cluster.
