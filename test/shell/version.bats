#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "detects semver from package.json when node is available" {
  echo '{"name":"demo","version":"1.2.3"}' > "$TEMPDIR/package.json"

  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../ci/version.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"latest"* ]]
  [[ "$output" == *"1.2.3"* ]]
  [[ "$output" == *"v1.2.3-unknown"* ]]
}

@test "falls back to 0.0.0 when no manifest exists" {
  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../ci/version.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"0.0.0"* ]]
  [[ "$output" == *"v0.0.0-unknown"* ]]
}

@test "reads version from pyproject.toml" {
  cat > "$TEMPDIR/pyproject.toml" <<'EOF'
[project]
name = "demo"
version = "2.3.4"
EOF

  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../ci/version.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"2.3.4"* ]]
}

@test "reads version from Cargo.toml" {
  cat > "$TEMPDIR/Cargo.toml" <<'EOF'
[package]
name = "demo"
version = "3.1.0"
EOF

  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../ci/version.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"3.1.0"* ]]
}

@test "uses 0.1.0 for go.mod projects" {
  echo "module demo" > "$TEMPDIR/go.mod"

  run bash -c "cd '$TEMPDIR' && bash '$BATS_TEST_DIRNAME/../../ci/version.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"0.1.0"* ]]
}

@test "includes git tag when present" {
  git init -q "$TEMPDIR/repo"
  git -C "$TEMPDIR/repo" config user.email "test@example.com"
  git -C "$TEMPDIR/repo" config user.name "test"
  echo "hello" > "$TEMPDIR/repo/file.txt"
  git -C "$TEMPDIR/repo" add .
  git -C "$TEMPDIR/repo" commit -qm "initial"
  git -C "$TEMPDIR/repo" tag -a v9.9.9 -m "release"

  run bash -c "cd '$TEMPDIR/repo' && bash '$BATS_TEST_DIRNAME/../../ci/version.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"v9.9.9"* ]]
}

@test "verbose mode prints generated tags summary" {
  echo '{"name":"demo","version":"1.0.0"}' > "$TEMPDIR/package.json"

  run bash -c "cd '$TEMPDIR' && VERBOSE=true bash '$BATS_TEST_DIRNAME/../../ci/version.sh'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Generated tags"* ]]
}
