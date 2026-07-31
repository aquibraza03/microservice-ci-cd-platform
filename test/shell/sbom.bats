#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export FAKE_BIN="$TEMPDIR/fakebin"
  mkdir -p "$FAKE_BIN"
  export PROJ="$TEMPDIR/project"
  mkdir -p "$PROJ/services/demo-service"

  cat > "$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "${DOCKER_CALLS:-/dev/null}"
if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  exit "${DOCKER_INSPECT_EXIT:-0}"
fi
exit 0
EOF

  cat > "$FAKE_BIN/syft" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "${SYFT_CALLS:-/dev/null}"
if [[ "${SYFT_EMPTY:-}" == "true" ]]; then
  exit 0
fi
echo '{"bomVersion":1}'
EOF

  chmod +x "$FAKE_BIN/docker" "$FAKE_BIN/syft"

  echo "FROM node:20" > "$PROJ/services/demo-service/Dockerfile"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "requires a service name argument" {
  run bash -c "cd '$PROJ' && PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/sbom.sh'"
  [ "$status" -eq 1 ]
}

@test "fails when Dockerfile is missing" {
  rm "$PROJ/services/demo-service/Dockerfile"
  run bash -c "cd '$PROJ' && PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/sbom.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Dockerfile missing"* ]]
}

@test "fails when syft is not installed" {
  run bash -c "cd '$PROJ' && PATH='$TEMPDIR/nosyft:/usr/bin:/bin' bash '$BATS_TEST_DIRNAME/../../ci/sbom.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Syft not found"* ]]
}

@test "reuses existing image when already present" {
  export SYFT_CALLS="$TEMPDIR/syft-calls.txt"
  run bash -c "cd '$PROJ' && PATH='$FAKE_BIN:$PATH' SYFT_CALLS='$SYFT_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/sbom.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Using existing image"* ]]
  [[ "$output" == *"SBOM generated"* ]]
  [ -s "$PROJ/artifacts/sbom/demo-service.json" ]
  [[ "$(cat "$SYFT_CALLS")" == *"cyclonedx-json"* ]]
}

@test "builds image when not present locally" {
  export SYFT_CALLS="$TEMPDIR/syft-calls.txt"
  export DOCKER_CALLS="$TEMPDIR/docker-calls.txt"
  run bash -c "cd '$PROJ' && PATH='$FAKE_BIN:$PATH' DOCKER_INSPECT_EXIT=1 SYFT_CALLS='$SYFT_CALLS' DOCKER_CALLS='$DOCKER_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/sbom.sh' demo-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Building image"* ]]
  [[ "$(cat "$DOCKER_CALLS")" == *"build"* ]]
}

@test "fails when generated SBOM is empty" {
  export SYFT_EMPTY=true
  run bash -c "cd '$PROJ' && PATH='$FAKE_BIN:$PATH' SYFT_EMPTY=true bash '$BATS_TEST_DIRNAME/../../ci/sbom.sh' demo-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"SBOM generation failed"* ]]
}
