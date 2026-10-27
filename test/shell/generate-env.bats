#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export SCHEMA_FILE="$TEMPDIR/schema.env"
  export OUTPUT_DIR="$TEMPDIR/out"
  export OUTPUT_FILE="$OUTPUT_DIR/env.example"
  export OVERWRITE="false"
  export VERBOSE="false"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "fails when schema file is missing" {
  export SCHEMA_FILE="$TEMPDIR/nonexistent.env"
  run bash "$BATS_TEST_DIRNAME/../../scripts/generate-env.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Schema file not found"* ]]
}

@test "fails when output file exists and OVERWRITE is false" {
  cat > "$SCHEMA_FILE" <<'EOF'
DB_HOST=string:true:::
EOF
  mkdir -p "$OUTPUT_DIR"
  echo "stale" > "$OUTPUT_FILE"
  run bash "$BATS_TEST_DIRNAME/../../scripts/generate-env.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"File exists"* ]]
}

@test "overwrites when OVERWRITE is true" {
  cat > "$SCHEMA_FILE" <<'EOF'
DB_HOST=string:true:::
EOF
  mkdir -p "$OUTPUT_DIR"
  echo "stale" > "$OUTPUT_FILE"
  run bash -c "OVERWRITE=true bash '$BATS_TEST_DIRNAME/../../scripts/generate-env.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Generated"* ]]
}

@test "writes variable names with defaults into the output file" {
  cat > "$SCHEMA_FILE" <<'EOF'
## Database
DB_HOST=string:true:::localhost
PORT=number:false:::8080
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/generate-env.sh"
  [ "$status" -eq 0 ]
  [ -f "$OUTPUT_FILE" ]
  grep -q '^DB_HOST=localhost$' "$OUTPUT_FILE"
  grep -q '^PORT=8080$' "$OUTPUT_FILE"
}

@test "writes empty value when no default is provided" {
  cat > "$SCHEMA_FILE" <<'EOF'
API_KEY=string:true:::
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/generate-env.sh"
  [ "$status" -eq 0 ]
  grep -q '^API_KEY=$' "$OUTPUT_FILE"
}

@test "emits required flag and type annotations" {
  cat > "$SCHEMA_FILE" <<'EOF'
DB_HOST=string:true:::
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/generate-env.sh"
  [ "$status" -eq 0 ]
  grep -q '# type: string' "$OUTPUT_FILE"
  grep -q '# required' "$OUTPUT_FILE"
}

@test "emits section headers from ## lines" {
  cat > "$SCHEMA_FILE" <<'EOF'
## Cache
REDIS_URL=string:false:::localhost:6379
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/generate-env.sh"
  [ "$status" -eq 0 ]
  grep -q '# Cache' "$OUTPUT_FILE"
}

@test "ignores comment lines and lines without an equals sign" {
  cat > "$SCHEMA_FILE" <<'EOF'
# this is a comment
not-a-rule
VALID=string:false:::ok
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/generate-env.sh"
  [ "$status" -eq 0 ]
  grep -q '^VALID=ok$' "$OUTPUT_FILE"
  grep -q 'not-a-rule' "$OUTPUT_FILE" && return 1 || true
}

@test "emits min and max annotations" {
  cat > "$SCHEMA_FILE" <<'EOF'
REPLICAS=number:false:1:10:
EOF
  run bash "$BATS_TEST_DIRNAME/../../scripts/generate-env.sh"
  [ "$status" -eq 0 ]
  grep -q '# min: 1' "$OUTPUT_FILE"
  grep -q '# max: 10' "$OUTPUT_FILE"
}
