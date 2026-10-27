# Production runbook catalogue

All runbooks must contain: Purpose, Symptoms, User impact, Required access, Diagnostic queries, Safe mitigation, Recovery steps, Escalation criteria, Recovery verification, Evidence preservation, Follow-up, Owner, and Last reviewed. Commands must be target-specific and must not perform broad deletion.

| Incident | Runbook |
|---|---|
| API or authentication outage | [API and authentication](api-authentication-outage.md) |
| Deployment, build, approval, policy | [Release workflow](release-workflow.md) |
| Queue, worker, PostgreSQL, Redis | [Control-plane dependencies](control-plane-dependencies.md) |
| Kubernetes, registry, Git, DNS/TLS, secrets | [Provider incidents](provider-incidents.md) |
| Backup, restore, disaster recovery, audit integrity | [Data recovery](data-recovery.md) |
| Metering, discrepancy, reservation, quota | [Billing operations](billing-operations.md) |
| Credential compromise, security incident | [Security response](security-response.md) |
| Customer-cluster disconnect, status communication | [Customer communication](customer-communication.md) |

## Severity and support model

| Severity | Definition | Initial response target | Updates | Resolution |
|---|---|---:|---:|---|
| SEV-1 | Widespread outage or critical security incident | 15 minutes, provisional/business-hours unless on-call is staffed | 30 minutes | Critical impact contained and recovery verified |
| SEV-2 | Major degradation or multiple organizations blocked | 30 minutes, provisional | 60 minutes | Main journey restored |
| SEV-3 | Limited impact with workaround | 1 business day, provisional | Daily | Durable fix or accepted workaround |
| SEV-4 | Routine support request | 2 business days, provisional | As agreed | Request answered |

The incident commander owns coordination, an engineering owner owns mitigation, and a communication owner owns customer updates. No 24/7 promise is made.

