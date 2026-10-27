# GitHub App repository onboarding

Platform login and repository access are deliberately separate. Users log in through the Checkpoint 2 identity adapter. Repository access uses a GitHub App installation and short-lived installation tokens; personal access tokens are not supported as the production credential.

## Create and configure the App

1. In GitHub, create a GitHub App for the platform environment.
2. Set the setup/callback destination to the frontend repository page. The frontend must send the authenticated callback query to `GET /api/v1/organizations/{organizationId}/git/installations/callback` with `state`, `installation_id` and `setup_action` unchanged.
3. Set the webhook URL to `https://CONTROL_PLANE_HOST/api/v1/webhooks/github` and generate a random webhook secret of at least 32 characters.
4. Grant repository permissions: **Metadata: read**, **Contents: read**, **Pull requests: read**, and **Commit statuses: read and write**. Subscribe to **Push**, **Pull request**, **Installation**, **Installation repositories**, and **Repository** events. Do not grant Administration, Actions, Secrets or Organization write permissions.
5. Generate a private key. Store it and the webhook secret in a managed secret store; preserve PEM newlines when setting `GITHUB_APP_PRIVATE_KEY`.
6. Configure `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CALLBACK_URL`, and optionally `GITHUB_API_BASE_URL` and `GITHUB_API_TIMEOUT_MS`. Production requires all values and rejects `GIT_PROVIDER_MODE=mock`.
7. Run `cd services/control-plane-api && npm run migrate && npm start`.

The installation authorization state is random, user- and organization-bound, expires after ten minutes, and is single use. For horizontally scaled production, replace the process-local state store with a shared atomic TTL store. Installation tokens are cached only in server memory until one minute before expiry, are never persisted and are never returned to the browser.

## Onboarding and disconnection

Organization owners, admins and developers have repository-management permission. They select **Connect GitHub**, choose the installation's permitted repositories, select a branch and project, and confirm. Provider repository IDs—not mutable names—are the identity. Disconnecting deletes the GitHub App installation through GitHub and marks local installation and repository records disconnected. A suspended or revoked installation fails closed and the UI offers reconnection.

## Webhooks and future builds

The server verifies `X-Hub-Signature-256` against the exact raw request bytes before parsing JSON. `X-GitHub-Delivery` is unique and replay-safe. Tenant resolution uses stored installation and immutable repository IDs, never organization/project payload fields. Push and pull-request facts are recorded; no build or deployment is claimed. A future build system must withhold all organization secrets from forked pull requests unless a separately authorized trusted workflow explicitly releases them.

## Testing and troubleshooting

Automated tests mock GitHub HTTP responses:

```bash
cd services/control-plane-api
npm run test:git
npm run test:security
```

The optional live test is intentionally skipped unless `RUN_LIVE_GITHUB_APP_ACCEPTANCE=true`; use only an isolated test organization and fixture repository. A 401 webhook response means the URL secret or raw-body forwarding is wrong. A 403 repository response means the installation is revoked, suspended or lacks repository selection. A 429 is surfaced without provider-token details; retry after GitHub's reset window.

Migrations are forward-only. Apply `003_github_repository_onboarding.sql` after earlier migrations. Production rollback is a forward fix; do not drop tenant or delivery data.
