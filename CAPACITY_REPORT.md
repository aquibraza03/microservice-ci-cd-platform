# Capacity report — Phase 4 Part 2

## Evidence boundary

Only an isolated in-process/local API baseline may be reported from this environment. No PostgreSQL, Redis, worker fleet, BuildKit, registry, Kubernetes, external provider, staging environment or production traffic was available. Consequently, queue, worker, streaming, database and provider capacity are **not tested**, and no production capacity claim is made.

## Method

The Node harness uses an open workload with fixed scheduled arrival times to reduce coordinated-omission bias. It records throughput, p50/p95/p99, errors, timeouts, duration, tool version, configuration and environment fingerprint. Closed concurrency is reserved for stream/connection tests. Safety configuration caps duration, arrival rate and users, refuses production/customer targets, manually handles redirects and requires synthetic credentials/data.

Dataset `phase4-capacity-v1` is generated deterministically from a seed. The standard shape is 4 organizations, 32 projects/services, 800 deployments, 400 audit events, 12 users and 96 configuration versions. Results from a different seed or shape are not comparable without an explicit dataset-difference note.

## Scenario catalogue and results

| Scenario | Model | Highest stable tested | Saturation | Bottleneck | Errors/recovery | Operating limit |
| --- | --- | --- | --- | --- | --- | --- |
| Local health baseline | Open, 5 requests/s for 10s | 5 rps, 50 requests | Not reached | Not identified | 0 errors/timeouts; p50 2.67ms, p95 4.02ms, p99 14.79ms; no recovery event | No production recommendation; local-only ceiling not tested |
| Auth/authz | Open | Not tested | Unknown | Unknown | Not verified | None |
| Project/service reads | Open | Not tested | Unknown | Unknown | Not verified | None |
| Deployment creation/status | Open | Not tested | Unknown | Unknown | Not verified | None |
| SSE streams | Closed | Not tested | Unknown | Unknown | Not verified | None |
| Queue/worker saturation | Open | Not tested | Unknown | Unknown | Not verified | None |
| Webhook/preview/rollback/approval/audit | Open | Not tested | Unknown | Unknown | Not verified | None |
| Provider simulation | Open, controlled doubles | Structurally defined | Not tested | Unknown | Not verified | None |
| Noisy neighbour/recovery | Open | Not tested | Unknown | Unknown | Not verified | None |

For the local baseline, any recommended limit is limited to 50% of the highest passing rate until repeated runs show <1% errors, p95 within the provisional SLO and recovery within 60 seconds. For every untested scenario the stable limit is unknown, safety margin is undefined and autoscaling advice is limited to measuring queue age, CPU, DB pool pressure and provider throttling before changing replicas.

## Measurement prerequisites

Use dedicated staging resources and capture API CPU/RSS, PostgreSQL CPU/I/O/pool/query latency, Redis latency/memory, queue wait/oldest age, worker utilization, build concurrency, stream churn and recovery time. Record commit, resource requests/limits, tool version, dataset manifest, external-provider mode and all aborts. Do not compare runs with different datasets or resources as a capacity trend.
