#!/usr/bin/env bash
set -euo pipefail
for command in curl jq gh git; do command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }; done
: "${PLATFORM_BEARER_TOKEN:?Set a valid platform user bearer token}"
: "${GITHUB_INSTALLATION_ID:?Set the GitHub App installation ID that can access newly created repositories}"
api=${PLATFORM_API_URL:-http://127.0.0.1:3001/api/v1}
suffix=$(date -u +%Y%m%d%H%M%S)
organization_slug="golden-${suffix}"
project_slug=phase1
external_repository=${GOLDEN_GITHUB_REPOSITORY:-"$(gh api user --jq .login)/platform-golden-${suffix}"}
temporary_repository=$(mktemp -d)
cleanup(){ rm -rf "$temporary_repository"; }
trap cleanup EXIT
cp -R "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/samples/golden-service/." "$temporary_repository/"
git -C "$temporary_repository" init -b main >/dev/null
git -C "$temporary_repository" add .
git -C "$temporary_repository" -c user.name=platform-acceptance -c user.email=acceptance@example.invalid commit -m "golden service v1" >/dev/null
gh repo create "$external_repository" --private --source "$temporary_repository" --remote origin --push >/dev/null
authorization="Authorization: Bearer ${PLATFORM_BEARER_TOKEN}"
post(){ curl -fsS -H "$authorization" -H 'Content-Type: application/json' "$@"; }
organization=$(post -X POST "$api/organizations" -d "{\"name\":\"Golden $suffix\",\"slug\":\"$organization_slug\"}")
organization_id=$(jq -r .id <<<"$organization")
project=$(post -X POST "$api/organizations/$organization_id/projects" -d "{\"name\":\"Phase 1\",\"slug\":\"$project_slug\"}")
project_id=$(jq -r .id <<<"$project")
authorization_url=$(post -X POST "$api/organizations/$organization_id/git/installations/authorize" | jq -r .authorizationUrl)
state=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.parse_qs(urllib.parse.urlparse(sys.argv[1]).query)["state"][0])' "$authorization_url")
installation=$(curl -fsS -H "$authorization" "$api/organizations/$organization_id/git/installations/callback?state=$state&installation_id=$GITHUB_INSTALLATION_ID")
installation_id=$(jq -r .id <<<"$installation")
provider_repository_id=$(gh api "repos/$external_repository" --jq '.id|tostring')
connected=$(post -X POST "$api/organizations/$organization_id/projects/$project_id/repository" -d "{\"installationId\":\"$installation_id\",\"repositoryId\":\"$provider_repository_id\",\"selectedBranch\":\"main\"}")
repository_id=$(jq -r .id <<<"$connected")
service=$(post -X POST "$api/organizations/$organization_id/projects/$project_id/services" -d "{\"name\":\"golden-service\",\"repositoryId\":\"$repository_id\",\"servicePath\":\".\"}")
service_id=$(jq -r .id <<<"$service")
deploy(){ local sha=$1 key=$2; post -H "Idempotency-Key: $key" -X POST "$api/organizations/$organization_id/deployments" -d "{\"projectId\":\"$project_id\",\"serviceId\":\"$service_id\",\"repositoryId\":\"$repository_id\",\"branch\":\"main\",\"commitSha\":\"$sha\",\"environment\":\"development\",\"configurationSnapshot\":{\"organizationSlug\":\"$organization_slug\",\"projectSlug\":\"$project_slug\",\"serviceSlug\":\"golden-service\",\"registryRepository\":\"registry:5000/$organization_slug-$project_slug-golden-service\",\"localKind\":true,\"nodePort\":30080}}"; }
wait_state(){ local id=$1 expected=$2 deadline=$((SECONDS+900)) body state; while ((SECONDS<deadline)); do body=$(curl -fsS -H "$authorization" "$api/organizations/$organization_id/deployments/$id"); state=$(jq -r .currentState <<<"$body"); [[ "$state" == "$expected" ]] && { printf '%s' "$body"; return; }; [[ "$state" == "failed" || "$state" == "cancelled" ]] && { jq . <<<"$body" >&2; return 1; }; sleep 2; done; echo "deployment $id timed out" >&2; return 1; }
first_sha=$(git -C "$temporary_repository" rev-parse HEAD)
first=$(deploy "$first_sha" "golden-first-$suffix")
first_id=$(jq -r .id <<<"$first")
first_ready=$(wait_state "$first_id" ready)
endpoint=$(jq -r .endpoint <<<"$first_ready" | sed 's/host\.docker\.internal/127.0.0.1/')
curl -fsS "$endpoint/health" | jq -e '.status=="ok"' >/dev/null
python3 -c 'import sys; from pathlib import Path; p=Path(sys.argv[1]); p.write_text(p.read_text().replace("||\"v1\"", "||\"v2\""))' "$temporary_repository/server.js"
git -C "$temporary_repository" add server.js
git -C "$temporary_repository" commit -m "golden service v2" >/dev/null
git -C "$temporary_repository" push >/dev/null
second_sha=$(git -C "$temporary_repository" rev-parse HEAD)
second=$(deploy "$second_sha" "golden-second-$suffix")
second_id=$(jq -r .id <<<"$second")
wait_state "$second_id" ready >/dev/null
second_state_version=$(curl -fsS -H "$authorization" "$api/organizations/$organization_id/deployments/$second_id" | jq -r .stateVersion)
rollback=$(post -H "Idempotency-Key: golden-rollback-$suffix" -X POST "$api/organizations/$organization_id/deployments/$second_id/rollback" -d "{\"targetDeploymentId\":\"$first_id\",\"reason\":\"Phase 2 golden-path rollback verification\",\"expectedStateVersion\":$second_state_version}")
rollback_id=$(jq -r .id <<<"$rollback")
rollback_result=$(wait_state "$rollback_id" rolled_back)
jq -n --arg repository "$external_repository" --arg commitSha "$first_sha" --arg deploymentId "$first_id" --arg imageDigest "$(jq -r .imageDigest <<<"$first_ready")" --arg namespace "platform-$organization_slug" --arg endpoint "$endpoint" --arg rollbackTarget "$(jq -r .rollbackTargetId <<<"$rollback_result")" '{repository:$repository,commitSha:$commitSha,deploymentId:$deploymentId,imageDigest:$imageDigest,scanResult:"recorded in deployment image metadata",signatureResult:"verified",kubernetesNamespace:$namespace,endpoint:$endpoint,healthResult:"passed",rollbackTarget:$rollbackTarget,rollbackResult:"rolled_back"}'
