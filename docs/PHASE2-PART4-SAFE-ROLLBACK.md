# Phase 2 Part 4: safe rollback and integration hardening

## Safety model

Rollback is a new immutable deployment. The current and target records are read-only inputs. Eligibility requires tenant-scoped rollback permission, an allowed environment, a previously `ready` target, an immutable SHA-256 digest, a non-empty configuration snapshot, currently passing stored scan/signature evidence, no active operation, approval when required, optimistic state-version agreement, and database compatibility policy acceptance.

Production requires approval by default. Policies can warn or block when the target would remove known application migrations and backward compatibility is not explicitly recorded. Emergency override requires the separate `deployment:rollback:emergency` permission, available only to owners and administrators, plus a justification. The worker never reverses database migrations.

## Runtime sequence

```text
rollback_queued -> rolling_back -> verifying -> rolled_back
                                      |
                                      +-> failed
```

The worker applies the digest-pinned target, waits for rollout, reads the controller-observed Deployment, compares its digest, verifies readiness and health, verifies the generated route when configured, records ordered stages/logs, and only then writes `rolled_back`. A failed command, rollout, observed digest, readiness, health, route, or controller confirmation uses the existing `failed` representation and emits remediation and optional alert events.

Operation locks are scoped to organization, service and environment. They have a bounded expiry, idempotent request identity, restart recovery, and stale-lock reconciliation. Repeated requests return the same rollback deployment.

## API and dashboard

- `GET .../rollback-targets`
- `GET .../rollback-comparison?targetDeploymentId=...`
- `POST .../rollback-approvals`
- `POST .../rollback` with `Idempotency-Key`
- `PUT .../environments/{environment}/rollback-policy`

The deployment detail page lists eligible targets and compares commits, digests, configuration/resource differences, environment-variable names, secret-reference names, database migrations, compatibility and approval state. A mandatory reason and explicit confirmation are required. Progress and logs use the existing authoritative deployment/SSE interface, and related deployment IDs remain on the new record.

## Integration hardening

- Production rejects test deployment, mock Git provider, demo/test authentication, non-PostgreSQL storage and development dashboard data.
- Normal deployment creation rejects concurrent service/environment operations at the API boundary.
- Rollback route is now reachable and tenant-authorized; the prior feature-unavailable response was removed.
- Rollback logs use the existing redacted, ordered event contract.
- The Kind acceptance script now sends an explicit target and optimistic state version.
- `scripts/phase2-acceptance.sh` performs the complete external-repository workflow and emits JSON only after all real checks pass.

## Operations

Apply migration `009_safe_rollback.sql`, restart the API/workers, and run stale-lock recovery on a schedule. Configure an alert sink and route verifier for production workers. Do not grant emergency rollback to operators or developers.

