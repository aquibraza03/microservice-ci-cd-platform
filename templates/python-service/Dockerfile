# ============================================
# Build Stage
# ============================================
FROM python:3.11-slim@sha256:00af38ae2ed311628970782e8a2d7f014d8909dbc63cb97bc0a158187f4db045 AS builder

ARG SERVICE_NAME
ARG SERVICE_VERSION=1.0.0

RUN pip install --no-cache-dir --upgrade "pip>=24.0,<25.0"

WORKDIR /build

COPY requirements.txt ./
RUN pip install --no-cache-dir --target=/opt/venv --upgrade -r requirements.txt

COPY src/ ./src/

# ============================================
# Runtime Stage
# ============================================
FROM python:3.11-slim@sha256:00af38ae2ed311628970782e8a2d7f014d8909dbc63cb97bc0a158187f4db045

ARG SERVICE_NAME
ARG SERVICE_VERSION=1.0.0
ARG SERVICE_PORT=8000

RUN useradd -m -u 10001 -s /usr/sbin/nologin appuser

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    SERVICE_NAME=${SERVICE_NAME} \
    SERVICE_PORT=${SERVICE_PORT} \
    SERVICE_HEALTH_PATH=/health \
    HOME=/home/appuser

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /build/src ./src

RUN chown -R appuser:appuser /app /opt/venv /home/appuser && \
    mkdir -p /tmp && chown -R appuser:appuser /tmp && \
    find / -perm /4000 -type f -exec chmod u-s {} \; 2>/dev/null || true

USER appuser

ENV PATH=/opt/venv/bin:${PATH} \
    PYTHONPATH=/opt/venv

EXPOSE ${SERVICE_PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os,urllib.request,sys; sys.exit(0) if urllib.request.urlopen(f'http://localhost:{os.environ[\"SERVICE_PORT\"]}{os.environ[\"SERVICE_HEALTH_PATH\"]}',timeout=3) else sys.exit(1)"

STOPSIGNAL SIGTERM

LABEL service.name=${SERVICE_NAME} \
      service.version=${SERVICE_VERSION} \
      org.opencontainers.image.title="${SERVICE_NAME}" \
      org.opencontainers.image.description="Python microservice" \
      org.opencontainers.image.source="https://github.com/org/platform" \
      org.opencontainers.image.vendor="Platform Team" \
      org.opencontainers.image.licenses="MIT"

CMD ["python", "src/app.py"]
