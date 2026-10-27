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
  exit "${DOCKER_INSPECT_EXIT:-0}"
fi
exit 0
EOF

  cat > "$FAKE_BIN/trivy" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "${TRIVY_CALLS:-/dev/null}"
echo "scan complete"
exit "${TRIVY_EXIT:-0}"
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

@test "scans local image when present locally" {
  export TRIVY_CALLS="$TEMPDIR/trivy-calls.txt"
  run bash -c "PATH='$FAKE_BIN:$PATH' TRIVY_CALLS='$TRIVY_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/security.sh' auth-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Security scan passed for auth-service:dev"* ]]
  [[ "$(cat "$TRIVY_CALLS")" == *"auth-service:dev"* ]]
}

@test "scans remote reference when local image is absent" {
  export TRIVY_CALLS="$TEMPDIR/trivy-calls.txt"
  run bash -c "PATH='$FAKE_BIN:$PATH' DOCKER_INSPECT_EXIT=1 TRIVY_CALLS='$TRIVY_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/security.sh' auth-service"
  [ "$status" -eq 0 ]
  [[ "$output" == *"not found locally; scanning remote reference"* ]]
  [[ "$(cat "$TRIVY_CALLS")" == *"auth-service:dev"* ]]
}

@test "fails when trivy reports HIGH/CRITICAL vulnerabilities" {
  export TRIVY_CALLS="$TEMPDIR/trivy-calls.txt"
  run bash -c "PATH='$FAKE_BIN:$PATH' TRIVY_EXIT=1 TRIVY_CALLS='$TRIVY_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/security.sh' auth-service"
  [ "$status" -ne 0 ]
  [[ "$output" != *"Security scan passed"* ]]
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

@test "uses trivy.exe fallback on Windows-style environments" {
  mkdir -p "$TEMPDIR/exe"
  cp "$FAKE_BIN/docker" "$TEMPDIR/exe/docker"
  cat > "$TEMPDIR/exe/trivy.exe" <<'EOF'
#!/usr/bin/env bash
echo "trivy.exe $*" >> "${TRIVY_CALLS:-/dev/null}"
exit 0
EOF
  chmod +x "$TEMPDIR/exe/trivy.exe" "$TEMPDIR/exe/docker"
  export TRIVY_CALLS="$TEMPDIR/trivy-calls.txt"
  run bash -c "PATH='$TEMPDIR/exe:$PATH' TRIVY_CALLS='$TRIVY_CALLS' bash '$BATS_TEST_DIRNAME/../../ci/security.sh' auth-service"
  [ "$status" -eq 0 ]
  [[ "$(cat "$TRIVY_CALLS")" == *"trivy.exe"* ]]
}
