# -------------------------------
# Base Image (secure + minimal)
# -------------------------------
FROM python:3.11-slim

# -------------------------------
# Metadata (build-time)
# -------------------------------
ARG SERVICE_NAME=service
ARG SERVICE_VERSION=1.0.0

LABEL org.service.name=$SERVICE_NAME \
      org.service.version=$SERVICE_VERSION

# -------------------------------
# Environment (runtime safe)
# -------------------------------
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# -------------------------------
# Create non-root user (fixed UID)
# -------------------------------
RUN useradd -m -u 10001 -s /usr/sbin/nologin appuser

# -------------------------------
# Workdir
# -------------------------------
WORKDIR /app

# -------------------------------
# Install dependencies (cache optimized)
# -------------------------------
COPY requirements.txt ./
RUN if [ -f requirements.txt ]; then pip install -r requirements.txt; fi

# -------------------------------
# Copy application
# -------------------------------
COPY src/ ./src/

# -------------------------------
# Permissions
# -------------------------------
RUN chown -R appuser:appuser /app
USER appuser

# -------------------------------
# Healthcheck (env-driven, portable)
# -------------------------------
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD \
python - <<EOF
import os, urllib.request, sys
port = os.getenv("SERVICE_PORT", "8000")
path = os.getenv("SERVICE_HEALTH_PATH", "/health")
url = f"http://localhost:{port}{path}"
try:
    urllib.request.urlopen(url, timeout=3)
    sys.exit(0)
except Exception:
    sys.exit(1)
EOF

# -------------------------------
# Graceful shutdown signal
# -------------------------------
STOPSIGNAL SIGTERM

# -------------------------------
# Entrypoint (no hardcoding)
# -------------------------------
CMD ["python", "src/app.py"]
