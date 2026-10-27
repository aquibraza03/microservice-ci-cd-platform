# Failure-test safety abort

**Symptoms:** kill switch removed, threshold crossed, unexpected target, cleanup or recovery check failed. **Impact:** controlled experiment may affect more than its approved blast radius. **Access:** experiment operator and incident commander.

Abort injection immediately, block new experiment actions, restore the affected local/staging component and verify authoritative state before cleanup. Never continue to gather more evidence. Escalate if any customer/production target, credential or unrelated resource was contacted. Recovery requires clean health, legal transitions, drained retries and completed ownership-safe cleanup. Preserve test ID, operator, environment fingerprint, commands and timestamps. Owner: Reliability Engineering.
