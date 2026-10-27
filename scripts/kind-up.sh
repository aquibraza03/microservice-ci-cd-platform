#!/usr/bin/env bash
set -euo pipefail
for command in docker kind kubectl cosign; do command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }; done
repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
mkdir -p "$repository_root/.local"
docker compose --env-file "$repository_root/.env.local" -f "$repository_root/docker/docker-compose.local-dependencies.yml" --profile kind up -d --wait
kind get clusters | grep -qx platform-local || kind create cluster --config "$repository_root/kind/kind-config.yaml"
registry_id=$(docker compose --env-file "$repository_root/.env.local" -f "$repository_root/docker/docker-compose.local-dependencies.yml" --profile kind ps -q registry)
docker network inspect kind --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}' | grep -qx "$(docker inspect --format '{{.Name}}' "$registry_id" | sed 's#^/##')" || docker network connect kind "$registry_id"
kind get kubeconfig --name platform-local > "$repository_root/.local/kubeconfig"
chmod 0644 "$repository_root/.local/kubeconfig"
if [[ ! -f "$repository_root/.local/cosign.key" ]]; then
  COSIGN_PASSWORD=${LOCAL_COSIGN_PASSWORD:-local_cosign_9c7e_change_me} cosign generate-key-pair --output-key-prefix "$repository_root/.local/cosign"
fi
echo "Kind context kind-platform-local is ready; NodePort endpoint range includes http://127.0.0.1:30080"
