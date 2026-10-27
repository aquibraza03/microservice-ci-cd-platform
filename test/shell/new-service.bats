#!/usr/bin/env bats

setup() {
  export TEMPDIR=$(mktemp -d)
  export SERVICES_DIR="$TEMPDIR/services"
  export TEMPLATES_DIR="$TEMPDIR/templates"
  export DRY_RUN="false"

  mkdir -p "$TEMPLATES_DIR/node-service/src"
  cat > "$TEMPLATES_DIR/node-service/service.yml" <<'EOF'
name: {{SERVICE_NAME}}
language: node
docker:
  port: 3000
deploy:
  healthcheck: /health
EOF
  echo 'console.log("{{SERVICE_NAME}}")' > "$TEMPLATES_DIR/node-service/src/server.js"
  echo "FROM node:20" > "$TEMPLATES_DIR/node-service/Dockerfile"
}

teardown() {
  rm -rf "$TEMPDIR"
}

@test "fails when no service name is provided" {
  run bash "$BATS_TEST_DIRNAME/../../scripts/new-service.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "rejects invalid service names" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' TEMPLATES_DIR='$TEMPDIR/templates' bash '$BATS_TEST_DIRNAME/../../scripts/new-service.sh' BadName"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Invalid service name"* ]]
}

@test "fails when template does not exist" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' TEMPLATES_DIR='$TEMPDIR/templates' TEMPLATE=ghost-template bash '$BATS_TEST_DIRNAME/../../scripts/new-service.sh' valid-svc"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Template not found"* ]]
}

@test "fails when service already exists" {
  mkdir -p "$SERVICES_DIR/existing-service"
  run bash -c "SERVICES_DIR='$TEMPDIR/services' TEMPLATES_DIR='$TEMPDIR/templates' bash '$BATS_TEST_DIRNAME/../../scripts/new-service.sh' existing-service"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Service already exists"* ]]
}

@test "dry run does not create the service directory" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' TEMPLATES_DIR='$TEMPDIR/templates' DRY_RUN=true bash '$BATS_TEST_DIRNAME/../../scripts/new-service.sh' demo-svc"
  [ "$status" -eq 0 ]
  [[ "$output" == *"[DRY RUN]"* ]]
  [ ! -d "$SERVICES_DIR/demo-svc" ]
}

@test "creates the service from the template" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' TEMPLATES_DIR='$TEMPDIR/templates' bash '$BATS_TEST_DIRNAME/../../scripts/new-service.sh' demo-svc"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Service created successfully"* ]]
  [ -f "$SERVICES_DIR/demo-svc/service.yml" ]
  [ -f "$SERVICES_DIR/demo-svc/src/server.js" ]
  [ -f "$SERVICES_DIR/demo-svc/Dockerfile" ]
}

@test "replaces placeholders in copied files" {
  run bash -c "SERVICES_DIR='$TEMPDIR/services' TEMPLATES_DIR='$TEMPDIR/templates' bash '$BATS_TEST_DIRNAME/../../scripts/new-service.sh' demo-svc"
  [ "$status" -eq 0 ]
  grep -q 'name: demo-svc' "$SERVICES_DIR/demo-svc/service.yml"
  grep -q 'demo-svc' "$SERVICES_DIR/demo-svc/src/server.js"
  ! grep -q '{{' "$SERVICES_DIR/demo-svc/service.yml"
}
