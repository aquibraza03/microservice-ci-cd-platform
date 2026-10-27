# ADR 0001: Platform authentication

**Status:** Accepted for Phase 1

## Decision
Use GitHub OAuth for user login behind an identity-provider interface. Domain authorization consumes an internal principal and must not depend directly on GitHub payloads.

## Context
Phase 1 targets developers who already use GitHub, while later providers must remain possible. The existing demo/JWT skeleton is not a production login implementation.

## Alternatives
Native passwords increase credential and recovery risk. Generic OIDC is flexible but adds configuration before the first supported provider. GitHub-only coupling would obstruct future providers.

## Security implications
Use Authorization Code flow, state and PKCE; validate redirect URIs; rotate client secrets; use secure, HTTP-only, SameSite cookies; and map identities without trusting mutable usernames. Authentication and authorization remain separate.

## Operational implications
Production needs a GitHub OAuth app, callback URLs, secret storage, and provider-outage handling. Local development uses an explicitly non-production adapter.

## Consequences
GitHub users get a direct login path and the domain stays provider-neutral. GitHub availability is an initial dependency.

## Future extension points
Add OIDC/SAML providers and account linking by implementing the same principal contract.
