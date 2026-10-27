# GitHub Actions OIDC Trust Policies

This directory contains **least-privilege trust policies** that allow GitHub
Actions workflows to obtain **short-lived cloud credentials** via OIDC.

Long-lived static credentials (AWS access keys, Azure SPN client secrets,
GCP service-account keys, `kubeconfig` files) are **not** permitted.

## How OIDC works here

1. GitHub signs a JWT with the `id-token` claim during workflow execution.
2. The cloud provider verifies the token against its OIDC provider.
3. The workflow receives a short-lived credential bound to:
   - the repository (`repo: org/platform`),
   - the branch/environment (`ref: refs/heads/main`, `environment: prod`),
   - and optional claims such as the environment name.

## AWS

| Artifact | Purpose |
|----------|---------|
| `aws/trust-policy.json` | IAM role trust policy bound to repo + environment |

The deploy workflows use `aws-actions/configure-aws-credentials` with
`role-to-assume` — no `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets
are required.

## Azure

| Artifact | Purpose |
|----------|---------|
| `azure/federated-credentials.json` | Federated identity credential for an app registration bound to repo |

## GCP

| Artifact | Purpose |
|----------|---------|
| `gcp/workload-identity-pool.json` | Workload identity pool provider bound to repo |
| `gcp/workload-identity-provider.json` | Provider mapping `sub` -> `repository_owner:repository` |

## Enforcement

- `deploy-service.yml`, `deploy-dev.yml`, `deploy-staging.yml`,
  `deploy-prod.yml`, `rollback.yml`, `terraform-plan.yml` and `release.yml`
  all request `permissions: id-token: write`.
- No workflow accepts or uses static cloud credentials.
- `kubeconfig` is obtained at runtime from an OIDC-federated cluster or a
  secrets manager, never stored in the repository.
