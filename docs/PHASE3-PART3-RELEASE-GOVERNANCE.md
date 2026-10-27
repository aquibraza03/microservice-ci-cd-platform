# Phase 3 Part 3 release governance

## Protected-action workflow

Security administrators or owners define narrowly scoped approval policies. A protected production deployment is persisted in `waiting_for_approval`; it is not queued. Eligible approvers inspect the immutable snapshot digest and safe summary, then approve or reject it. Once the threshold is met, the backend revalidates current authority, policy version, resource state and snapshot digest before creating a single execution and queueing the deployment.

The approval inbox distinguishes pending, approved, rejected, expired, cancelled, invalidated, overridden, executing, consumed and failed. A changed commit, configuration hash, secret-reference version, target version or policy result invalidates the approval.

## Bootstrap and recovery

The first policy is created by an owner or security administrator using existing `approval_policy:manage` authority. Activation is rejected unless enough active eligible members exist. Approval-policy changes can themselves be protected, but an empty or impossible approver set is rejected. Pending approvals prevent removal or demotion of the last eligible approver.

Emergency recovery requires `approval:override` (owner only), explicit justification and a security event. Revoked, expired, invalidated and consumed approvals cannot be revived; create a new request and snapshot.

## Kubernetes policy workflow

Kyverno is the selected engine. The platform separates:

1. Platform preflight feedback.
2. Manifest validation.
3. Kyverno admission enforcement.
4. Post-deployment compliance and drift inspection.

Only layer 3 with a confirmed active enforcing target is reported as `enforce`. The checked-in bootstrap policy defaults to `Audit`. Promote it only after rendered validation, server-side dry run and a real negative admission test on the selected target.

Validation policies cover privileged containers, host namespaces, hostPath and Docker socket mounts, non-root execution, privilege escalation, capability drops, seccomp, resources, registries, immutable digests, signature/provenance posture, ownership labels, probes, service-account token automount, namespaces, preview isolation, egress and read-only filesystems. Read-only root filesystems are validation-only because blind mutation can break workloads.

## Exceptions and drift

Exceptions are scoped to one organization, project, environment, target, policy, service and optional workload. They require business justification, compensating control, elevated request and approval permissions, exact policy/resource versions and an expiry no later than 30 days. They never modify the base policy.

On expiry, an existing workload is reported noncompliant and requires authorized reconciliation. It is not deleted automatically.

On-demand drift compares immutable digest, configuration hash, target/namespace, secret-reference IDs and versions, ownership labels, policy state, Service and Ingress metadata. It never reads secret plaintext and never remediates automatically.
