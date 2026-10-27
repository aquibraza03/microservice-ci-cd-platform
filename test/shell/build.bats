#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export FAKE_BIN="$TEMPDIR/fakebin"
  mkdir -p "$FAKE_BIN"

  cat > "$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "${DOCKER_CALLS:-/dev/null}"
case "$1" in
  info) exit "${DOCKER_INFO_EXIT:-0}" ;;
  buildx)
    if [[ "$2" == "version" ]]; then
      exit "${BUILDX_VERSION_EXIT:-0}"
    fi
    exit 0
    ;;
  build) exit 0 ;;
esac
exit 0
EOF
  chmod +x "$FAKE_BIN/docker"

  export PATH="$FAKE_BIN:$PATH"
  export SERVICES_DIR="$TEMPDIR/services"
  export SVC="$SERVICES_DIR/demo-service"
  mkdir -p "$SVC/src"
  echo "FROM node:20" > "$SVC/Dockerfile"
  printf 'name: demo-service\nlanguage: node\ndocker:\n  port: 8080\ndeploy:\n  healthcheck: /health\n' > "$SVC/service.yml"
  echo "console.log('x')" > "$SVC/src/main.js"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "requires a service name argument" {
  run bash "$BATS_TEST_DIRNAME/../../ci/build.sh"
  [ "$status" -eq 1 ]
}

@test "fails when service does not exist" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/build.sh' ghost-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Service not found"* ]]
}

@test "fails when Dockerfile is missing" {
  rm "$SVC/Dockerfile"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/build.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Dockerfile not found"* ]]
}

@test "fails when docker daemon is not reachable" {
  run bash -c "cd '$TEMPDIR' && DOCKER_INFO_EXIT=1 bash '$BATS_TEST_DIRNAME/../../ci/build.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Docker daemon is not reachable"* ]]
}

@test "builds with buildx and --load when available" {
  export DOCKER_CALLS="$TEMPDIR/docker-calls.txt"
  run bash -c "cd '$TEMPDIR' && DOCKER_CALLS='$DOCKER_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/build.sh' demo-service v1.0"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Build completed"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"buildx build"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"--load"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"demo-service:v1.0"* ]]
}

@test "builds with legacy docker build when buildx is unavailable" {
  export DOCKER_CALLS="$TEMPDIR/docker-calls.txt"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' BUILDX_VERSION_EXIT=1 DOCKER_CALLS='$DOCKER_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/build.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$(cat "$DOCKER_CALLS")" != *"buildx build"* ]]
  [[ "$(cat "$DOCKER_CALLS")" != *"--platform"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"--tag demo-service:dev"* ]]
}

@test "pushes when PUSH_IMAGE is true" {
  export DOCKER_CALLS="$TEMPDIR/docker-calls.txt"
  run bash -c "cd '$TEMPDIR' && PUSH_IMAGE=true DOCKER_CALLS='$DOCKER_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/build.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$(cat "$DOCKER_CALLS")" == *"--push"* ]]
}

@test "rejects multi-platform local build without push" {
  run bash -c "cd '$TEMPDIR' && PLATFORMS='linux/amd64,linux/arm64' bash '$BATS_TEST_DIRNAME/../../ci/build.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Multi-platform local builds cannot use --load"* ]]
}

@test "applies registry prefix to image tag" {
  export DOCKER_CALLS="$TEMPDIR/docker-calls.txt"
  run bash -c "cd '$TEMPDIR' && REGISTRY='ghcr.io/acme' DOCKER_CALLS='$DOCKER_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/build.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$(cat "$DOCKER_CALLS")" == *"ghcr.io/acme/demo-service:dev"* ]]
}
