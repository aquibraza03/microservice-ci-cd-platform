# OBSERVABILITY AUDIT

## Monitoring, Logging, and Alerting Analysis

---

## Ops Scripts Overview

```
ops/
├── alerts/
│   └── generate-alerts.sh    # Generates PrometheusRule YAML
├── grafana/
│   ├── generate-dashboards.sh # Generates Grafana dashboard JSON
│   └── deploy-dashboard.sh    # Deploys dashboard via Grafana API
├── logging/
│   └── generate-logging.sh    # Generates logging config (Loki/Promtail)
└── prometheus/
    └── generate-prometheus.sh # Generates Prometheus config
```

**Common Pattern**: All generators produce output files, but NONE of them are integrated into the deployment pipeline or loaded by any runtime system.

---

## Alerting (`ops/alerts/generate-alerts.sh`)

### What it does
- Reads list of services from `services/` directory
- Generates PrometheusRule manifests with CPU/memory/error rate alerts
- Outputs to `ops/alerts/generated/`

### Generated Alert Rules
| Alert Name | Severity | Expression | Condition |
|-----------|----------|-----------|-----------|
| HighCPUUsage | warning | `container_cpu_usage_ratio > 0.8 for 5m` | CPU > 80% for 5 min |
| HighMemoryUsage | warning | `container_memory_usage_ratio > 0.85 for 5m` | Memory > 85% for 5 min |
| ServiceDown | critical | `up{job="__SERVICE__"} == 0 for 1m` | Target down for 1 min |
| HighErrorRate | critical | `rate(http_requests_total{status=~"5.."}[5m]) > 0.05` | Error rate > 5% |
| HighLatency | warning | `http_request_duration_seconds{quantile="0.95"} > 2.0 for 5m` | p95 latency > 2s |

### Issues

1. **CRITICAL**: No Prometheus metrics endpoint in ANY service. The service code doesn't expose `/metrics` or export Prometheus metrics. All alert expressions will evaluate to NODATA.

2. **HIGH**: The generated output is NOT loaded by any Prometheus instance. The `generate-alerts.sh` script writes to `ops/alerts/generated/` but no pipeline loads this into a PrometheusRule CRD.

3. **MEDIUM**: Alert expressions use `container_cpu_usage_ratio` which isn't a standard cAdvisor metric. The correct metric is `container_cpu_usage_seconds_total` or `rate(container_cpu_usage_seconds_total[5m])`.

4. **LOW**: The alert generation doesn't create silences or inhibition rules.

---

## Grafana (`ops/grafana/`)

### `generate-dashboards.sh`
- Generates dashboard JSON for each service
- Creates CPU, memory, request rate, error rate, and latency panels
- Outputs to `ops/grafana/dashboards/`

### `deploy-dashboard.sh`
- Reads dashboard JSON files
- Pushes to Grafana instance via API
- Uses `GRAFANA_URL`, `GRAFANA_API_TOKEN` environment variables

### Issues

1. **CRITICAL**: Dashboard panels reference metrics that don't exist in any service. The dashboards query for `http_request_duration_seconds` but no service exports this metric.

2. **HIGH**: `deploy-dashboard.sh` sends response body to stderr instead of capturing it properly (line 36):
   ```bash
   response=$(curl -s -o /dev/stderr -w "%{http_code}" ...)
   ```
   The response body goes to stderr, but `$response` only contains the HTTP status code. Error handling based on `$response` checking against 200 will fail if the API returns 200 but the body contains an error.

3. **MEDIUM**: No dashboard versioning. Overwrites existing dashboards by UID.

4. **LOW**: No Grafana datasource configuration. Assumes a Prometheus datasource named "Prometheus" exists.

---

## Logging (`ops/logging/generate-logging.sh`)

### What it does
- Generates Promtail configuration for log collection
- Configures Loki as the log aggregation backend
- Outputs to `ops/logging/generated/`

### Issues

1. **CRITICAL**: Services log to stdout (Node.js `console.log`), but there's no structured logging. JSON-formatted logs are required for Loki to parse fields properly.

2. **HIGH**: The generated Promtail config is never deployed. No Kubernetes DaemonSet, no ConfigMap, no pipeline to apply it.

3. **MEDIUM**: No log retention policy configured in generated config.

4. **LOW**: No multi-tenancy support for log isolation between environments.

---

## Prometheus (`ops/prometheus/generate-prometheus.sh`)

### What it does
- Generates Prometheus server configuration
- Sets scrape intervals, targets based on detected services
- Outputs to `ops/prometheus/generated/`

### Issues

1. **CRITICAL**: Generated config is never applied. No Prometheus Operator configuration, no ServiceMonitor, no PodMonitor.

2. **HIGH**: Scrape targets are based on service names (e.g., `auth-service:3000`), but there's no service discovery mechanism. In Kubernetes, Prometheus should use pod annotations (e.g., `prometheus.io/scrape: "true"`).

3. **MEDIUM**: No alertmanager configuration in the generated Prometheus config.

4. **LOW**: No remote write configuration for long-term storage.

---

## Observability Components Missing Entirely

| Component | Status | Required For |
|-----------|--------|-------------|
| Metrics endpoint in services | ❌ | All observability |
| Prometheus Operator/Stack | ❌ | Metrics collection |
| Grafana instance | ❌ (config only) | Visualization |
| Loki stack | ❌ (config only) | Log aggregation |
| Promtail DaemonSet | ❌ (config only) | Log collection |
| Alertmanager | ❌ | Alert routing |
| ServiceMonitor/PodMonitor | ❌ | K8s service discovery |
| Distributed tracing | ❌ | Request tracing |
| Dashboards-as-code | ⚠️ (generators exist) | Visualization |
| SLI/SLO definitions | ❌ | Service reliability |
| Uptime monitoring | ❌ | External monitoring |
| Synthetic checks | ❌ | Proactive monitoring |

---

## Observability Gaps

### Metrics Gap
```
Service Code → ❌ No /metrics endpoint
     ↓
Prometheus → ❌ No configuration loaded
     ↓
Grafana → ❌ Dashboard generated but not deployed
     ↓
Alertmanager → ❌ Not configured
```

### Logging Gap
```
Service Stdout → console.log (unstructured JSON)
     ↓
Promtail → ❌ Config generated but not deployed
     ↓
Loki → ❌ Not deployed
     ↓
Grafana → ❌ Not connected
```

---

## Score: 2/10

The observability scripts are well-structured as standalone generators, but they are completely disconnected from the actual runtime:

| Component | Completeness | Real Impact |
|-----------|-------------|-------------|
| Alert Generation | 60% (syntax correct) | 0% (never loaded) |
| Dashboard Generation | 70% (proper JSON) | 0% (never loaded, wrong metrics) |
| Logging Config | 50% (basic output) | 0% (never deployed) |
| Prometheus Config | 50% (service targets) | 0% (never applied) |
| Service Metrics | 0% (no /metrics) | N/A |
| Runtime Integration | 0% | N/A |

The observability implementation has the right structure but zero runtime value. Every component needs metrics instrumentation in the service code and actual deployment of the monitoring stack before it provides any real observability.
