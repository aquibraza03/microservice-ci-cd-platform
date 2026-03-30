import os
import json
import signal
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

# -------------------------------
# Config (NO HARDCODING)
# -------------------------------
SERVICE_NAME = os.getenv("SERVICE_NAME", "service")
SERVICE_VERSION = os.getenv("SERVICE_VERSION", "1.0.0")

SERVICE_PORT = int(os.getenv("SERVICE_PORT", os.getenv("PORT", "8000")))
SERVICE_HOST = os.getenv("SERVICE_HOST", "0.0.0.0")

HEALTH_PATH = os.getenv("SERVICE_HEALTH_PATH", "/health")
READY_PATH = os.getenv("SERVICE_READY_PATH", "/ready")

START_TIME = time.time()

# -------------------------------
# Logging (Structured + ms timestamp)
# -------------------------------
def log(level, message, extra=None):
    payload = {
        "level": level,
        "service": SERVICE_NAME,
        "message": message,
        "timestamp": int(time.time() * 1000)  # ✅ milliseconds
    }
    if extra:
        payload.update(extra)

    print(json.dumps(payload), flush=True)

# -------------------------------
# Request Handler
# -------------------------------
class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Disable default noisy logging
        return

    def _send(self, code, payload):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_GET(self):
        start = time.time()

        try:
            # Health check
            if self.path == HEALTH_PATH:
                self._send(200, {
                    "status": "ok",
                    "service": SERVICE_NAME
                })
                return

            # Readiness check
            if self.path == READY_PATH:
                self._send(200, {
                    "status": "ready",
                    "uptime": int(time.time() - START_TIME)
                })
                return

            # Root endpoint
            if self.path == "/":
                self._send(200, {
                    "service": SERVICE_NAME,
                    "version": SERVICE_VERSION,
                    "status": "running"
                })
                return

            # Not found
            self._send(404, {
                "error": "Not Found",
                "path": self.path
            })

        finally:
            duration = round((time.time() - start) * 1000, 2)

            log("info", "request", {
                "path": self.path,
                "method": "GET",
                "duration_ms": duration
            })

# -------------------------------
# Server Setup
# -------------------------------
server = HTTPServer((SERVICE_HOST, SERVICE_PORT), Handler)

log("info", f"starting on {SERVICE_HOST}:{SERVICE_PORT}")

# -------------------------------
# Graceful Shutdown
# -------------------------------
def shutdown(sig, frame):
    log("info", "shutting down")
    server.shutdown()
    sys.exit(0)

signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)

# -------------------------------
# Run Server
# -------------------------------
try:
    server.serve_forever()
except Exception as e:
    log("error", "server error", {"error": str(e)})
