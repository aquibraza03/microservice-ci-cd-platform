FROM node:20-alpine AS builder

WORKDIR /build

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/src ./src

USER appuser

ENV NODE_ENV=production \
    SERVICE_PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health >/dev/null 2>&1 || exit 1

STOPSIGNAL SIGTERM

LABEL service.name=platform-smoke-test \
      service.version=${SERVICE_VERSION:-dev} \
      org.opencontainers.image.title="Platform Smoke Test" \
      org.opencontainers.image.description="Smoke test service for CI/CD validation" \
      org.opencontainers.image.source="https://github.com/org/platform" \
      org.opencontainers.image.vendor="Platform Team"

CMD ["node", "server.js"]
