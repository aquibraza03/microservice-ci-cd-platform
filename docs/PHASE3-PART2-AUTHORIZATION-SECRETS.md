# Phase 3 Part 2 authorization and managed secrets

Every backend decision is evaluated as actor, action, resource, scope and context. Missing or invalid inputs deny by default. Organization assignments inherit downward only for actions in the fixed registry; project assignments inherit only to their environments, deployments, secret references and domains. Resource organization IDs are resolved on the server and must match the evaluated organization.

The nine built-in roles are owner, admin, security admin, platform engineer, developer, operator, approver, auditor and viewer. Owner-only ownership actions and security-administration separation prevent ordinary administrators from managing secret-provider credentials. Custom roles remain planned and have no API or UI.

Tokens do not contain durable permissions. Every repository operation revalidates current membership. Removal is effective on the next request; active SSE streams retain their existing periodic authorization recheck. Sensitive membership updates use versions. The final-active-owner check and update must execute in one PostgreSQL transaction with an organization membership lock when the PostgreSQL repository is completed.

Managed secrets store references only. Supported beta reference types are AWS Secrets Manager ARNs attached to an active matching AWS connection and Kubernetes External Secret keys attached to a target where External Secrets Operator was discovered. API responses mask identifiers. There is no plaintext read endpoint.

Runtime delivery is designed around External Secrets resources so the customer cluster resolves values. Historical deployment snapshots contain only reference ID, reference version, injection key, destination and provider type. Protected references fail closed for previews and verified fork events. Build-time secret delivery is unsupported; Docker build arguments are never used as a fallback.
