#!/usr/bin/env bash

set -euo pipefail

# E2E Health Check Test
# Starts the smoke test service, pings endpoints, validates response, cleans up

PORT=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Find a random available port
find_port() {
  python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()"
}

PORT=$(find_port)
export PORT

echo "Starting platform-smoke-test on port $PORT..."

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
HEALTH_RESPONSE=$(curl -s http://127.0.0.1:$PORT/health)
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/health)

if [ "$HEALTH_STATUS" != "200" ]; then
  echo "FAIL: /health returned status $HEALTH_STATUS (expected 200)"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

echo "GET /health -> HTTP $HEALTH_STATUS"

if [ "$HEALTH_RESPONSE" != "ok" ]; then
  echo "FAIL: /health body '$HEALTH_RESPONSE' (expected 'ok')"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi
echo "PASS: /health response body valid"

# Test /ready endpoint
echo "Testing GET /ready..."
READY_RESPONSE=$(curl -s http://127.0.0.1:$PORT/ready)
READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/ready)

if [ "$READY_STATUS" != "200" ]; then
  echo "FAIL: /ready returned status $READY_STATUS (expected 200)"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

echo "GET /ready -> HTTP $READY_STATUS"

if [ "$READY_RESPONSE" != "ready" ]; then
  echo "FAIL: /ready body '$READY_RESPONSE' (expected 'ready')"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi
echo "PASS: /ready response body valid"

# Test /info endpoint
echo "Testing GET /info..."
INFO_RESPONSE=$(curl -s http://127.0.0.1:$PORT/info)
INFO_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/info)

if [ "$INFO_STATUS" != "200" ]; then
  echo "FAIL: /info returned status $INFO_STATUS (expected 200)"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

echo "GET /info -> HTTP $INFO_STATUS"

if ! echo "$INFO_RESPONSE" | grep -qE '^uptime:[0-9]+s$'; then
  echo "FAIL: /info body '$INFO_RESPONSE' (expected 'uptime:<N>s')"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi
echo "PASS: /info response body valid"

# Test default route
echo "Testing GET /..."
DEFAULT_RESPONSE=$(curl -s http://127.0.0.1:$PORT/)

if [ "$DEFAULT_RESPONSE" != "platform smoke test running" ]; then
  echo "FAIL: / returned '$DEFAULT_RESPONSE' (expected 'platform smoke test running')"
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
