#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export PLATFORM_DIR="$TEMPDIR"
  export DEFAULTS_FILE="$TEMPDIR/defaults.env"
  export PROFILES_DIR="$TEMPDIR/profiles"
  mkdir -p "$PROFILES_DIR"
  unset PROFILE
  unset ENV
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "exits non-zero when defaults file is missing" {
  run bash "$BATS_TEST_DIRNAME/../../platform/load-profile.sh"
  [ "$status" -ne 0 ]
}

@test "loads with default startup profile" {
  cat > "$DEFAULTS_FILE" <<'EOF'
CPU=500m
MEMORY=512Mi
EOF
  cat > "$PROFILES_DIR/startup.env" <<'EOF'
CPU=250m
EOF
  run bash "$BATS_TEST_DIRNAME/../../platform/load-profile.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Loading platform profile: startup"* ]]
}

@test "loads with specified profile" {
  export PROFILE="growth"
  cat > "$DEFAULTS_FILE" <<'EOF'
CPU=500m
MEMORY=512Mi
EOF
  cat > "$PROFILES_DIR/growth.env" <<'EOF'
CPU=1000m
EOF
  run bash "$BATS_TEST_DIRNAME/../../platform/load-profile.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Loading platform profile: growth"* ]]
}

@test "uses ENV variable as fallback profile" {
  export ENV="production"
  cat > "$DEFAULTS_FILE" <<'EOF'
CPU=500m
EOF
  run bash "$BATS_TEST_DIRNAME/../../platform/load-profile.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"production"* ]]
}

@test "warns when profile file is missing but uses defaults" {
  export PROFILE="nonexistent"
  cat > "$DEFAULTS_FILE" <<'EOF'
CPU=500m
MEMORY=512Mi
EOF
  run bash "$BATS_TEST_DIRNAME/../../platform/load-profile.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Profile not found"* ]]
}

@test "exports variables from defaults file" {
  cat > "$DEFAULTS_FILE" <<'EOF'
TEST_EXPORT_VAR=hello_world
EOF
  run bash -c "source '$BATS_TEST_DIRNAME/../../platform/load-profile.sh' && echo \"\$TEST_EXPORT_VAR\""
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"hello_world"* ]]
}

@test "skips invalid lines in env files" {
  cat > "$DEFAULTS_FILE" <<'EOF'
VALID_KEY=value
this is invalid line
=bad
EOF
  run bash "$BATS_TEST_DIRNAME/../../platform/load-profile.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Skipping invalid line"* ]]
}

@test "skips invalid variable names" {
  cat > "$DEFAULTS_FILE" <<'EOF'
VALID=value
123invalid=bad
has-hyphen=bad
EOF
  run bash "$BATS_TEST_DIRNAME/../../platform/load-profile.sh"
  [ "$status" -eq 0 ]
}

@test "normalizes boolean values" {
  cat > "$DEFAULTS_FILE" <<'EOF'
FLAG=TRUE
ENABLED=FALSE
EOF
  run bash -c "source '$BATS_TEST_DIRNAME/../../platform/load-profile.sh' && echo \"\$FLAG \$ENABLED\""
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"true"* ]]
  [[ "$output" == *"false"* ]]
}
