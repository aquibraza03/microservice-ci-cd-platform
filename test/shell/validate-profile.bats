#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export SCHEMA_FILE="$TEMPDIR/schema.env"
  export VALIDATION_MODE="relaxed"
  unset CPU MEMORY REPLICAS AUTOSCALE_ENABLED
  unset DB_HOST SERVICE_PORT LOG_LEVEL
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "exits zero when no schema file exists" {
  export SCHEMA_FILE="$TEMPDIR/nonexistent.env"
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"No schema file found"* ]]
}

@test "fails when required variable is missing" {
  cat > "$SCHEMA_FILE" <<'EOF'
DB_HOST=string:true:::
EOF
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Missing required variable"* ]]
}

@test "passes when all required variables are set" {
  cat > "$SCHEMA_FILE" <<'EOF'
DB_HOST=string:true:::
PORT=number:false:::8080
EOF
  export DB_HOST="localhost"
  export PORT=8080
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Platform config is valid"* ]]
}

@test "warns on type mismatch in relaxed mode" {
  cat > "$SCHEMA_FILE" <<'EOF'
REPLICAS=number:false:::1
EOF
  export REPLICAS="abc"
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"not numeric"* ]]
}

@test "fails on type mismatch in strict mode" {
  export VALIDATION_MODE="strict"
  cat > "$SCHEMA_FILE" <<'EOF'
REPLICAS=number:false:::1
EOF
  export REPLICAS="abc"
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [ "$status" -ne 0 ]
  [[ "$output" == *"must be numeric"* ]]
}

@test "validates boolean type" {
  cat > "$SCHEMA_FILE" <<'EOF'
AUTOSCALE_ENABLED=boolean:false:::false
EOF
  export AUTOSCALE_ENABLED="yes"
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [[ "$output" == *"not boolean"* ]]
}

@test "validates number range below minimum" {
  cat > "$SCHEMA_FILE" <<'EOF'
REPLICAS=number:false:2:10:
EOF
  export REPLICAS=1
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [[ "$output" == *"below min"* ]]
}

@test "validates number range above maximum" {
  cat > "$SCHEMA_FILE" <<'EOF'
REPLICAS=number:false:2:10:
EOF
  export REPLICAS=20
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [[ "$output" == *"above max"* ]]
}

@test "validates autoscale cross-field" {
  cat > "$SCHEMA_FILE" <<'EOF'
AUTOSCALE_ENABLED=boolean:false:::false
AUTOSCALE_MIN_REPLICAS=number:false:::1
AUTOSCALE_MAX_REPLICAS=number:false:::5
EOF
  export AUTOSCALE_ENABLED=true
  export AUTOSCALE_MIN_REPLICAS=10
  export AUTOSCALE_MAX_REPLICAS=2
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [[ "$output" == *"Autoscale bounds invalid"* ]]
}

@test "handles unknown schema types" {
  cat > "$SCHEMA_FILE" <<'EOF'
CUSTOM_VAR=unknown_type:false:::
EOF
  export CUSTOM_VAR="test"
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [[ "$output" == *"Unknown type"* ]]
}

@test "skips invalid schema lines" {
  cat > "$SCHEMA_FILE" <<'EOF'
# comment only
EOF
  run bash "$BATS_TEST_DIRNAME/../../platform/validate-profile.sh"
  [ "$status" -eq 0 ]
}
