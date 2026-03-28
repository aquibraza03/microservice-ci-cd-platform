#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="ops/grafana/dashboards"
mkdir -p "$OUTPUT_DIR"

ENVIRONMENT="${ENV:-dev}"
DASHBOARD_FILE="$OUTPUT_DIR/service-overview.json"

echo "📊 Generating enterprise Grafana dashboard (env=$ENVIRONMENT)..."

cat > "$DASHBOARD_FILE" <<EOF
{
  "title": "Service Overview",
  "timezone": "browser",
  "schemaVersion": 36,
  "version": 1,

  "templating": {
    "list": [
      {
        "name": "environment",
        "type": "query",
        "query": "label_values(up, environment)",
        "refresh": 1
      },
      {
        "name": "service",
        "type": "query",
        "query": "label_values(up{environment=\\\"\$environment\\\"}, job)",
        "refresh": 1
      }
    ]
  },

  "panels": [

    {
      "title": "Service Availability",
      "type": "stat",
      "targets": [
        {
          "expr": "up{job=\\\"\$service\\\", environment=\\\"\$environment\\\"}"
        }
      ]
    },

    {
      "title": "Request Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(http_requests_total{job=\\\"\$service\\\", environment=\\\"\$environment\\\"}[1m])"
        }
      ]
    },

    {
      "title": "Error Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(http_requests_total{job=\\\"\$service\\\", status=~\\\"5..\\\", environment=\\\"\$environment\\\"}[1m])"
        }
      ]
    },

    {
      "title": "Latency (P95)",
      "type": "graph",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job=\\\"\$service\\\", environment=\\\"\$environment\\\"}[5m]))"
        }
      ]
    }

  ]
}
EOF

echo "✅ Dashboard generated → $DASHBOARD_FILE"
