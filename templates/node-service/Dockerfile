# ============================================
# Build Stage
# ============================================
ARG BASE_IMAGE=node:20-alpine@sha256:afdf98210b07b586eb71fa22ba2e432e058e4cd1304d31ed60888755b8c865fb
# hadolint ignore=DL3006
FROM ${BASE_IMAGE} AS builder

ARG SERVICE_NAME
WORKDIR /build

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

# ============================================
# Runtime Stage
# ============================================
# hadolint ignore=DL3006
FROM ${BASE_IMAGE}

ARG SERVICE_NAME
ARG SERVICE_VERSION=dev
ARG SERVICE_PORT=3000

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/src ./src

RUN chown -R appuser:appuser /app && \
    mkdir -p /tmp && chown -R appuser:appuser /tmp && \
    find / -perm /4000 -type f -exec chmod u-s {} \; 2>/dev/null || true

USER appuser

ENV NODE_ENV=production \
    SERVICE_NAME=${SERVICE_NAME} \
    SERVICE_PORT=${SERVICE_PORT} \
    HOME=/app

EXPOSE ${SERVICE_PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${SERVICE_PORT}/health >/dev/null 2>&1 || exit 1

STOPSIGNAL SIGTERM

LABEL service.name=${SERVICE_NAME} \
      service.version=${SERVICE_VERSION} \
      org.opencontainers.image.title="${SERVICE_NAME}" \
      org.opencontainers.image.source="https://github.com/org/platform" \
      org.opencontainers.image.vendor="Platform Team"

CMD ["node", "src/server.js"]
