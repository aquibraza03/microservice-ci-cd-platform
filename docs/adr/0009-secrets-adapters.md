# ADR 0009: Secret adapters

**Status:** Accepted for Phase 1

## Decision
Define a secret-store interface with a local-development adapter and production managed-secret implementations. Local examples contain no real secrets.

## Context
OAuth, GitHub App, registry and cluster integrations require secrets, but production storage must not be tied to local environment files.

## Alternatives
Plain database values or repository secrets create unacceptable exposure. A single cloud vault would constrain deployment options.

## Security implications
Encrypt at rest and in transit, use workload identity, least privilege, rotation, audited access and redaction. Return secret references where possible and never place values in logs or queue payloads.

## Operational implications
Local `.env.local` is ignored and explicitly non-production. Production operators configure a managed provider, identity policy, rotation and availability procedures.

## Consequences
Secret handling is portable and testable, with an interface that must preserve provider-specific security guarantees.

## Future extension points
Adapters can support cloud secret managers, Vault and customer-managed key policies.
