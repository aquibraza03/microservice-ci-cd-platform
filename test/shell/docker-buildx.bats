#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export FAKE_BIN="$TEMPDIR/fakebin"
  mkdir -p "$FAKE_BIN"

  cat > "$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "${DOCKER_CALLS:-/dev/null}"
if [[ "$1" == "buildx" ]]; then
  case "$2" in
    version) exit "${BUILDX_VERSION_EXIT:-0}" ;;
    inspect)
      if [[ "$*" == *"--bootstrap"* ]]; then exit 0; fi
      exit "${BUILDX_INSPECT_EXIT:-0}"
      ;;
    create) exit "${BUILDX_CREATE_EXIT:-0}" ;;
  esac
  exit 0
fi
exit 0
EOF
  chmod +x "$FAKE_BIN/docker"

  export PATH="$FAKE_BIN:$PATH"
  export SERVICES_DIR="$TEMPDIR/services"
  export SVC="$SERVICES_DIR/demo-service"
  mkdir -p "$SVC/src"
  echo "FROM node:20" > "$SVC/Dockerfile"
  echo "x" > "$SVC/src/main.js"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "requires a service name argument" {
  run bash "$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh"
  [ "$status" -eq 1 ]
}

@test "rejects an invalid mode" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh' demo-service bogus"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Mode must be 'load' or 'push'"* ]]
}

@test "fails when service does not exist" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh' ghost-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Service not found"* ]]
}

@test "fails when Dockerfile is missing" {
  rm "$SVC/Dockerfile"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' bash '$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Dockerfile missing"* ]]
}

@test "fails when docker is not installed" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' PATH='$TEMPDIR/nodocker:/usr/bin:/bin' bash '$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Docker not installed"* ]]
}

@test "fails when buildx is not available" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' BUILDX_VERSION_EXIT=1 bash '$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Docker buildx not available"* ]]
}

@test "creates a builder when it does not exist" {
  export DOCKER_CALLS="$TEMPDIR/docker-calls.txt"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' BUILDX_INSPECT_EXIT=1 DOCKER_CALLS='$DOCKER_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$(cat "$DOCKER_CALLS")" == *"buildx create"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"buildx build"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"--load"* ]]
}

@test "uses an existing builder" {
  export DOCKER_CALLS="$TEMPDIR/docker-calls.txt"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' BUILDX_INSPECT_EXIT=0 DOCKER_CALLS='$DOCKER_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$(cat "$DOCKER_CALLS")" != *"buildx create"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"buildx use"* ]]
}

@test "uses multi-arch platforms in push mode" {
  export DOCKER_CALLS="$TEMPDIR/docker-calls.txt"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' DOCKER_CALLS='$DOCKER_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh' demo-service push"
  [ "$status" -eq 0 ]
  [[ "$(cat "$DOCKER_CALLS")" == *"--push"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"linux/amd64,linux/arm64"* ]]
}

@test "includes latest tag when IMAGE_TAG_LATEST is set" {
  export DOCKER_CALLS="$TEMPDIR/docker-calls.txt"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' IMAGE_TAG_LATEST=1 IMAGE_TAG=v1.0 DOCKER_CALLS='$DOCKER_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$(cat "$DOCKER_CALLS")" == *"-t local/demo-service:v1.0"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"-t local/demo-service:latest"* ]]
}

@test "falls back to default builder when builder creation fails" {
  export DOCKER_CALLS="$TEMPDIR/docker-calls.txt"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' BUILDX_INSPECT_EXIT=1 BUILDX_CREATE_EXIT=1 DOCKER_CALLS='$DOCKER_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/docker-buildx.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Builder creation failed"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"buildx use default"* ]]
}
