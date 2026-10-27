#!/usr/bin/env bash
set -euo pipefail
repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
kind delete cluster --name platform-local
docker compose --env-file "$repository_root/.env.local" -f "$repository_root/docker/docker-compose.local-dependencies.yml" --profile kind down
