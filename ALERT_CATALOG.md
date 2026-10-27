# Alert catalogue

Canonical rules are in `ops/alerts/platform-slo-rules.yaml`; routing and inhibition are
in `ops/alertmanager/alertmanager.yaml`. All notification names are test receivers.

| Alert                     | Severity | Owner          | Impact                        | Duration  | Missing data                 | Dashboard             | Runbook              | Resolution              |
| ------------------------- | -------- | -------------- | ----------------------------- | --------- | ---------------------------- | --------------------- | -------------------- | ----------------------- |
| ApiFastErrorBudgetBurn    | critical | Platform SRE   | rapid API reliability loss    | 2m        | telemetry companion          | platform-slos         | api-slo              | burn recovers           |
| ApiSlowErrorBudgetBurn    | high     | Platform SRE   | sustained budget loss         | 15m       | telemetry companion          | platform-slos         | api-slo              | long windows recover    |
| ApiAvailabilityDegraded   | high     | Control Plane  | API failures                  | 5m        | unknown                      | api-health            | api-slo              | errors <1%              |
| ApiLatencyHigh            | high     | Control Plane  | slow API                      | 10m       | unknown                      | api-health            | api-slo              | p95 <1s                 |
| WorkerFleetUnavailable    | critical | Platform SRE   | deployments stop              | 2m        | firing                       | queue-workers         | worker-queue         | heartbeat + job success |
| QueueBacklog              | high     | Platform SRE   | deployment delay              | 10m       | unknown                      | queue-workers         | worker-queue         | backlog drains          |
| OldestJobAgeHigh          | high     | Platform SRE   | stuck job                     | 5m        | unknown                      | queue-workers         | worker-queue         | age <300s               |
| DeploymentFailureIncrease | high     | Deployments    | deployments fail              | 10m       | unknown                      | deployment-pipeline   | deployment-providers | failures <5%            |
| BuildCapacityExhausted    | high     | Build Platform | builds delayed                | 10m       | unknown                      | build-system          | worker-queue         | queue <10               |
| DatabaseUnavailable       | critical | Data Platform  | authoritative operations fail | 2m        | firing                       | dependencies          | data-services        | DB metrics restored     |
| DatabasePoolExhausted     | high     | Data Platform  | DB calls queue                | 5m        | unknown                      | dependencies          | data-services        | idle capacity           |
| RedisFailure              | high     | Platform SRE   | queue calls fail              | 5m        | unknown                      | dependencies          | data-services        | errors cease            |
| RegistryFailure           | high     | Deployments    | image push fails              | 10m       | unknown                      | external-providers    | deployment-providers | pushes succeed          |
| KubernetesProviderFailure | high     | Deployments    | rollout fails                 | 10m       | unknown                      | kubernetes-operations | deployment-providers | operations succeed      |
| GitWebhookFailure         | high     | Integrations   | triggers delayed              | 10m       | unknown                      | external-providers    | deployment-providers | deliveries succeed      |
| LogStreamDegraded         | high     | Control Plane  | stale live status/logs        | 10m       | unknown                      | streaming-logs        | live-observability   | freshness <10s          |
| PreviewCleanupBacklog     | warning  | Previews       | resource leak risk            | 30m       | unknown                      | previews              | deployment-providers | backlog <10             |
| CertificateExpiryRisk     | high     | Networking     | TLS expiry risk               | 1h        | unknown                      | previews              | deployment-providers | >14d remaining          |
| AuditIntegrityFailure     | critical | Security       | audit evidence suspect        | immediate | scheduled-job check          | security-governance   | audit-integrity      | incident-owned          |
| TelemetryExportFailure    | high     | Observability  | incomplete visibility         | 10m       | collector absence must alert | telemetry-pipeline    | telemetry-pipeline   | exports 15m             |
| TelemetryDropsHigh        | high     | Observability  | signals discarded             | 10m       | unknown                      | telemetry-pipeline    | telemetry-pipeline   | zero drops              |
| BackupFailure | high | Data Platform | RPO stops advancing | immediate | backup age covers absence | backup-dr | backup-restore | complete encrypted backup |
| BackupAgeExcessive | high | Data Platform | RPO exceeded | 15m | production absent companion fires | backup-dr | backup-restore | age under 24h |
| PitrVerificationFailure | high | Data Platform | PITR untrusted | immediate | unknown until scheduled | backup-dr | database-restore | PITR passes |
| RestoreTestFailure | critical | Reliability | backup unrecoverable | immediate | restore-age covers absence | backup-dr | database-restore | clean-room passes |
| RestoreTestAgeExcessive | high | Reliability | evidence stale | 1h | production absent companion fires | backup-dr | database-restore | age under 7d |
| DeadLetterGrowth | high | Platform SRE | work needs recovery | 5m | unknown | queue-workers | worker-queue | DLQ growth stops |
| ReconciliationFailure | high | Platform SRE | states may diverge | 5m | unknown | backup-dr | reconciliation | reconciliation passes |
| CapacitySaturation | warning | Platform SRE | margin exhausted | 5m | unknown | capacity | capacity-saturation | load below limit |
| FailureTestSafetyAbort | high | Reliability | experiment exceeded safety | immediate | not applicable outside tests | backup-dr | failure-test-safety | recovery verified |
| DrVerificationFailure | critical | Reliability | DR path failed | immediate | tracked by rehearsal schedule | backup-dr | disaster recovery | rehearsal passes |

Maintenance is explicit through the `maintenance="true"` label. Critical alerts inhibit
lower severities for the same service/cluster, and worker unavailability inhibits queue
symptoms. Alertmanager groups by alert, service and cluster and deduplicates repeats for 4h.
