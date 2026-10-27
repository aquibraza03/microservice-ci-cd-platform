# ADR 0007: Kubernetes and Kind

**Status:** Accepted for Phase 1

## Decision
Use Kubernetes as the deployment target and Kind as the supported local Kubernetes implementation.

## Context
The repository already contains Kubernetes and Kustomize assets, but scripts and manifests are not proof of a functioning cluster deployment.

## Alternatives
Direct VM or ECS deployment fragments the runtime model. Minikube and k3d are viable locally but one documented baseline reduces drift.

## Security implications
Use namespace and service-account isolation, restricted pod security, admission policy, network policy, immutable digests, RBAC and protected kubecredentials. Do not grant tenants cluster-admin.

## Operational implications
Clusters need ingress, DNS, certificates, storage classes, metrics and policy controllers. Local Kind needs Docker, kubectl and explicit local-registry wiring.

## Consequences
One declarative runtime model spans local and production environments, with Kubernetes operational complexity.

## Future extension points
Add managed-cluster providers and environment adapters while retaining a common deployment contract.
