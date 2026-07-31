#!/usr/bin/env bash

set -euo pipefail

# E2E Health Check Test
# Starts the auth service, pings /health, validates response, cleans up

PORT=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Find a random available port
find_port() {
  python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()"
}

PORT=$(find_port)
export PORT

echo "Starting auth service on port $PORT..."

# Start the service in background
node "$PROJECT_DIR/src/server.js" &
SERVER_PID=$!

# Give it time to start
sleep 1

# Check if process is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "FAIL: Server failed to start"
  exit 1
fi

echo "Server started with PID $SERVER_PID"

# Test /health endpoint
echo "Testing GET /health..."
HEALTH_RESPONSE=$(curl -s http://127.0.0.1:"$PORT"/health)
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:"$PORT"/health)

if [ "$HEALTH_STATUS" != "200" ]; then
  echo "FAIL: /health returned status $HEALTH_STATUS (expected 200)"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

echo "GET /health -> HTTP $HEALTH_STATUS"

# Validate response body
if ! echo "$HEALTH_RESPONSE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    assert data.get('status') == 'ok', f'Expected status ok, got {data}'
    print('PASS: /health response body valid')
except Exception as e:
    print(f'FAIL: {e}')
    sys.exit(1)
"; then
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

# Test /ready endpoint
echo "Testing GET /ready..."
READY_RESPONSE=$(curl -s http://127.0.0.1:"$PORT"/ready)
READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:"$PORT"/ready)

if [ "$READY_STATUS" != "200" ]; then
  echo "FAIL: /ready returned status $READY_STATUS (expected 200)"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

echo "GET /ready -> HTTP $READY_STATUS"

if ! echo "$READY_RESPONSE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    assert data.get('ready') == True, f'Expected ready true, got {data}'
    print('PASS: /ready response body valid')
except Exception as e:
    print(f'FAIL: {e}')
    sys.exit(1)
"; then
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

# Test /login endpoint
echo "Testing GET /login..."
LOGIN_RESPONSE=$(curl -s http://127.0.0.1:"$PORT"/login)

if ! echo "$LOGIN_RESPONSE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    assert 'message' in data, f'Expected message field, got {data}'
    assert 'login' in data['message'], f'Expected login in message, got {data}'
    print('PASS: /login response body valid')
except Exception as e:
    print(f'FAIL: {e}')
    sys.exit(1)
"; then
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

# Test default route
echo "Testing GET /..."
DEFAULT_RESPONSE=$(curl -s http://127.0.0.1:"$PORT"/)

if [ "$DEFAULT_RESPONSE" != "Auth service running" ]; then
  echo "FAIL: / returned '$DEFAULT_RESPONSE' (expected 'Auth service running')"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi
echo "PASS: / default route valid"

# Cleanup
echo "Cleaning up..."
kill $SERVER_PID 2>/dev/null

# Wait for process to exit
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "=========================================="
echo "All E2E health checks passed!"
echo "=========================================="
exit 0
