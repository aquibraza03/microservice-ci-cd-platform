# Regional dependency outage

**Symptoms:** correlated PostgreSQL, registry, Kubernetes, DNS or provider failures in one region. **Impact:** deployments and routing may stop; reads may degrade. **Access:** incident commander, platform/data/network/security owners.

Declare incident scope, freeze unsafe writes/retries, validate independent dependency status and select the DR checkpoint. No automatic multi-region failover is assumed. Restore infrastructure configuration, keys and PostgreSQL in documented order, then queues, workers, registry, Kubernetes and DNS. Reconcile writes after the checkpoint and communicate actual data-loss window. Fail back only after a fresh verified backup and controlled traffic shift. Preserve provider incident IDs, checkpoints, DNS changes and validation output. Owner: Reliability Engineering.
