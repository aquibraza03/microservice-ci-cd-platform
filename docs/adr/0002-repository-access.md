# ADR 0002: Repository access

**Status:** Accepted for Phase 1

## Decision
Access user repositories through a GitHub App and mint short-lived installation tokens only when required.

## Context
Repository access is machine-to-machine and has a different lifecycle from user login. Long-lived personal access tokens are unsuitable for a multi-tenant platform.

## Alternatives
OAuth user tokens conflate identity and automation. Deploy keys scale poorly. Personal access tokens are long lived and user managed.

## Security implications
Request minimum GitHub App permissions, validate signed webhooks, encrypt the app private key, never persist installation tokens, redact tokens from logs, and bind installations to tenant records.

## Operational implications
Operators must register a GitHub App, configure webhook delivery and rotate its private key. Token minting must tolerate GitHub rate limits and outages.

## Consequences
Repository access is least-privilege and revocable per installation, at the cost of GitHub App lifecycle management.

## Future extension points
Add repository-provider adapters for GitLab or Bitbucket without changing project-domain objects.
