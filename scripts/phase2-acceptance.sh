#!/usr/bin/env bash
set -euo pipefail

# This runner intentionally emits no evidence until every real external step
# succeeds. It does not substitute fixtures or provider adapters for GitHub,
# BuildKit, the registry, Kubernetes, routing, health, or cleanup evidence.
for command in curl jq gh git docker kind kubectl; do
  command -v "$command" >/dev/null || { echo "BLOCKED: missing required command: $command" >&2; exit 2; }
done
: "${PLATFORM_BEARER_TOKEN:?Set a real platform bearer token}"
: "${GITHUB_INSTALLATION_ID:?Set the installed GitHub App installation ID}"
: "${GITHUB_WEBHOOK_SECRET:?Set the configured webhook secret}"

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
api=${PLATFORM_API_URL:-http://127.0.0.1:3001/api/v1}
suffix=$(date -u +%Y%m%d%H%M%S)
work=$(mktemp -d)
cleanup(){ rm -rf "$work"; }
trap cleanup EXIT
cp -R "$root/samples/golden-service/." "$work/"
git -C "$work" init -b main >/dev/null
git -C "$work" add .
git -C "$work" -c user.name=platform-acceptance -c user.email=acceptance@example.invalid commit -m 'phase2 v1' >/dev/null
account=$(gh api user --jq .login)
repository="$account/platform-phase2-$suffix"
gh repo create "$repository" --private --source "$work" --remote origin --push >/dev/null

auth="Authorization: Bearer $PLATFORM_BEARER_TOKEN"
post(){ curl -fsS -H "$auth" -H 'Content-Type: application/json' "$@"; }
org=$(post -X POST "$api/organizations" -d "{\"name\":\"Phase 2 $suffix\",\"slug\":\"phase2-$suffix\"}")
org_id=$(jq -r .id <<<"$org")
project=$(post -X POST "$api/organizations/$org_id/projects" -d '{"name":"Acceptance","slug":"acceptance"}')
project_id=$(jq -r .id <<<"$project")
authorize=$(post -X POST "$api/organizations/$org_id/git/installations/authorize")
state=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.parse_qs(urllib.parse.urlparse(sys.argv[1]).query)["state"][0])' "$(jq -r .authorizationUrl <<<"$authorize")")
installation=$(curl -fsS -H "$auth" "$api/organizations/$org_id/git/installations/callback?state=$state&installation_id=$GITHUB_INSTALLATION_ID")
installation_id=$(jq -r .id <<<"$installation")
provider_repo_id=$(gh api "repos/$repository" --jq '.id|tostring')
connected=$(post -X POST "$api/organizations/$org_id/projects/$project_id/repository" -d "{\"installationId\":\"$installation_id\",\"repositoryId\":\"$provider_repo_id\",\"selectedBranch\":\"main\"}")
repository_id=$(jq -r .id <<<"$connected")
service=$(post -X POST "$api/organizations/$org_id/projects/$project_id/services" -d "{\"name\":\"golden-service\",\"repositoryId\":\"$repository_id\",\"servicePath\":\".\"}")
service_id=$(jq -r .id <<<"$service")
v1_sha=$(git -C "$work" rev-parse HEAD)
detection=$(post -H "Idempotency-Key: detect-$suffix" -X POST "$api/organizations/$org_id/projects/$project_id/detections" -d "{\"repositoryId\":\"$repository_id\",\"commitSha\":\"$v1_sha\"}")
detection_id=$(jq -r .id <<<"$detection")
candidate_id=$(jq -r '.candidates[0].id' <<<"$detection")
configuration=$(post -X POST "$api/organizations/$org_id/projects/$project_id/configuration" -d "{\"detectionId\":\"$detection_id\",\"repositoryId\":\"$repository_id\",\"commitSha\":\"$v1_sha\",\"candidateId\":\"$candidate_id\",\"configuration\":{\"serviceName\":\"golden-service\",\"servicePath\":\".\",\"port\":3000,\"health\":{\"startup\":\"/health\",\"readiness\":\"/ready\",\"liveness\":\"/health\"}},\"confirmConflicts\":true}")
configuration_version=$(jq -r '.version // .id' <<<"$configuration")
deploy(){ post -H "Idempotency-Key: $2" -X POST "$api/organizations/$org_id/deployments" -d "{\"projectId\":\"$project_id\",\"serviceId\":\"$service_id\",\"repositoryId\":\"$repository_id\",\"branch\":\"main\",\"commitSha\":\"$1\",\"environment\":\"development\",\"configurationSnapshot\":{\"organizationSlug\":\"phase2-$suffix\",\"projectSlug\":\"acceptance\",\"serviceSlug\":\"golden-service\",\"registryRepository\":\"registry:5000/phase2-$suffix-acceptance-golden-service\",\"localKind\":true,\"nodePort\":30080}}"; }
wait_state(){ local dep=$1 desired=$2 body state deadline=$((SECONDS+900)); while (( SECONDS < deadline )); do body=$(curl -fsS -H "$auth" "$api/organizations/$org_id/deployments/$dep"); state=$(jq -r .currentState <<<"$body"); [[ $state == "$desired" ]] && { printf '%s' "$body"; return; }; [[ $state == failed || $state == cancelled ]] && { jq . <<<"$body" >&2; return 1; }; sleep 2; done; return 1; }
first=$(deploy "$v1_sha" "phase2-v1-$suffix"); first_id=$(jq -r .id <<<"$first"); first_ready=$(wait_state "$first_id" ready)
digest_v1=$(jq -er .imageDigest <<<"$first_ready"); endpoint=$(jq -er .endpoint <<<"$first_ready" | sed 's/host\.docker\.internal/127.0.0.1/')
health_v1=$(curl -fsS "$endpoint/health")

# A signed PR webhook and preview are required. The runner stops instead of
# fabricating provider trust when the API is not publicly reachable by GitHub.
: "${GITHUB_WEBHOOK_DELIVERY_URL:?Set the externally reachable webhook URL for this control plane}"
git -C "$work" checkout -b preview >/dev/null
sed -i 's/v1/v1-preview/g' "$work/server.js"
git -C "$work" add server.js && git -C "$work" commit -m 'preview revision' >/dev/null && git -C "$work" push -u origin preview >/dev/null
pr_url=$(gh pr create --repo "$repository" --head preview --base main --title 'Acceptance preview' --body 'Verified Phase 2 acceptance preview')
pr_number=${pr_url##*/}
preview_deadline=$((SECONDS+900)); preview_id=""
while (( SECONDS < preview_deadline )); do preview_id=$(curl -fsS -H "$auth" "$api/organizations/$org_id/previews" | jq -r --argjson pr "$pr_number" '.items[]|select(.pullRequestNumber==$pr)|.id' | head -1); [[ -n $preview_id ]] && break; sleep 2; done
[[ -n $preview_id ]]
preview=$(curl -fsS -H "$auth" "$api/organizations/$org_id/previews/$preview_id"); preview_url="https://$(jq -er .generatedHostname <<<"$preview")"
curl -fsS "$preview_url/health" >/dev/null
gh pr close "$pr_number" --repo "$repository" >/dev/null
post -X POST "$api/organizations/$org_id/previews/reconcile" -d '{}' >/dev/null
cleanup_result=$(curl -fsS -H "$auth" "$api/organizations/$org_id/previews/$preview_id" | jq -r .cleanupStatus)
[[ $cleanup_result == completed ]]

git -C "$work" checkout main >/dev/null
sed -i 's/v1/v2/g' "$work/server.js"
git -C "$work" add server.js && git -C "$work" commit -m 'phase2 v2' >/dev/null && git -C "$work" push >/dev/null
v2_sha=$(git -C "$work" rev-parse HEAD); second=$(deploy "$v2_sha" "phase2-v2-$suffix"); second_id=$(jq -r .id <<<"$second"); second_ready=$(wait_state "$second_id" ready)
version=$(jq -r .stateVersion <<<"$second_ready")
rollback=$(post -H "Idempotency-Key: phase2-rollback-$suffix" -X POST "$api/organizations/$org_id/deployments/$second_id/rollback" -d "{\"targetDeploymentId\":\"$first_id\",\"reason\":\"Phase 2 complete acceptance restoration\",\"expectedStateVersion\":$version}")
rollback_id=$(jq -r .id <<<"$rollback"); restored=$(wait_state "$rollback_id" rolled_back); final_digest=$(jq -er .imageDigest <<<"$restored"); [[ $final_digest == "$digest_v1" ]]
final_health=$(curl -fsS "$endpoint/health")
jq -n --arg repository "$repository" --arg branch main --arg commitSha "$v1_sha" --arg detectionResultId "$detection_id" --arg configurationVersion "$configuration_version" --arg deploymentId "$first_id" --arg imageDigest "$digest_v1" --arg namespace "platform-phase2-$suffix" --arg generatedUrl "$endpoint" --argjson healthResult "$health_v1" --arg previewId "$preview_id" --arg previewUrl "$preview_url" --arg cleanupResult "$cleanup_result" --arg secondDeployment "$second_id" --arg rollbackDeployment "$rollback_id" --arg targetDigest "$digest_v1" --arg finalObservedDigest "$final_digest" --argjson finalHealthResponse "$final_health" '{repository:$repository,branch:$branch,commitSha:$commitSha,detectionResultId:$detectionResultId,configurationVersion:$configurationVersion,deploymentId:$deploymentId,imageDigest:$imageDigest,kubernetesNamespace:$namespace,generatedUrl:$generatedUrl,healthResult:$healthResult,previewId:$previewId,previewUrl:$previewUrl,cleanupResult:$cleanupResult,secondDeployment:$secondDeployment,rollbackDeployment:$rollbackDeployment,targetDigest:$targetDigest,finalObservedDigest:$finalObservedDigest,finalHealthResponse:$finalHealthResponse}'
