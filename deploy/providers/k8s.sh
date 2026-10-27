#!/usr/bin/env bash
set -euo pipefail

SERVICE="$1"

bash deploy/k8s/deploy.sh "$SERVICE"
