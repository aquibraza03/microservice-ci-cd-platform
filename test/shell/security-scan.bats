#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export FAKE_BIN="$TEMPDIR/fakebin"
  mkdir -p "$FAKE_BIN"

  cat > "$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "info" ]]; then
  exit 0
fi
if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  exit 0
fi
exit 0
EOF

  cat > "$FAKE_BIN/trivy" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "${TRIVY_CALLS:-/dev/null}"
echo "scan complete"
exit 0
EOF

  chmod +x "$FAKE_BIN/docker" "$FAKE_BIN/trivy"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "requires a service name argument" {
  run bash -c "PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/security.sh'"
  [ "$status" -eq 1 ]
}

@test "fails when docker is not installed" {
  run bash -c "PATH='$TEMPDIR/nodocker:/usr/bin:/bin' bash '$BATS_TEST_DIRNAME/../../ci/security.sh' auth-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Docker not installed"* ]]
}

@test "fails when docker daemon is not reachable" {
  cat > "$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "info" ]]; then
  echo "Cannot connect to the Docker daemon" >&2
  exit 1
fi
exit 0
EOF
  run bash -c "PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/security.sh' auth-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Docker daemon is not reachable"* ]]
}

@test "fails when image is not present locally" {
  cat > "$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "info" ]]; then
  exit 0
fi
if [[ "$1" == "image" && "$2" == "inspect" ]]; then
  exit 1
fi
exit 0
EOF
  run bash -c "PATH='$FAKE_BIN:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/security.sh' auth-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Image auth-service:dev not found locally"* ]]
}

@test "fails when trivy is not installed" {
  mkdir -p "$TEMPDIR/notrivy"
  cat > "$TEMPDIR/notrivy/docker" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod +x "$TEMPDIR/notrivy/docker"
  run bash -c "PATH='$TEMPDIR/notrivy:$PATH' bash '$BATS_TEST_DIRNAME/../../ci/security.sh' auth-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Trivy not installed"* ]]
}

@test "scans image with HIGH,CRITICAL severity and passes" {
  export TRIVY_CALLS="$TEMPDIR/trivy-calls.txt"
  run bash -c "PATH='$FAKE_BIN:$PATH' TRIVY_CALLS='$TRIVY_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/security.sh' auth-service v1.0.0"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Security scan passed for auth-service:v1.0.0"* ]]
  [[ "$(cat "$TRIVY_CALLS")" == *"auth-service:v1.0.0"* ]]
  [[ "$(cat "$TRIVY_CALLS")" == *"HIGH,CRITICAL"* ]]
}

@test "honors registry prefix" {
  export TRIVY_CALLS="$TEMPDIR/trivy-calls.txt"
  run bash -c "PATH='$FAKE_BIN:$PATH' REGISTRY='ghcr.io/acme' TRIVY_CALLS='$TRIVY_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/security.sh' auth-service"
  [ "$status" -eq 0 ]
  [[ "$(cat "$TRIVY_CALLS")" == *"ghcr.io/acme/auth-service:dev"* ]]
}
