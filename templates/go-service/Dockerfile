# ============================================
# Build Stage
# ============================================
FROM golang:1.22-alpine AS builder

ARG SERVICE_NAME
ARG SERVICE_VERSION=dev

RUN apk add --no-cache ca-certificates=20230506 git=2.43.0

WORKDIR /app

ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64

COPY go.mod go.sum ./
RUN go mod download

COPY src/ ./src/

RUN go build -ldflags="-s -w -X main.version=${SERVICE_VERSION} -X main.name=${SERVICE_NAME}" -o app ./src/main.go

# ============================================
# Runtime Stage (distroless for minimal attack surface)
# ============================================
FROM alpine:3.19

ARG SERVICE_NAME
ARG SERVICE_VERSION=dev
ARG SERVICE_PORT=8080

RUN apk add --no-cache ca-certificates=20230506 curl=8.5.0 && \
    adduser -D -u 10001 appuser

WORKDIR /app

COPY --from=builder /app/app .
COPY --from=builder /etc/ssl/certs /etc/ssl/certs

RUN chown -R appuser:appuser /app
USER appuser

ENV SERVICE_NAME=${SERVICE_NAME} \
    SERVICE_VERSION=${SERVICE_VERSION} \
    SERVICE_PORT=${SERVICE_PORT} \
    SERVICE_HEALTH_PATH=/health

EXPOSE ${SERVICE_PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:${SERVICE_PORT}${SERVICE_HEALTH_PATH} >/dev/null 2>&1 || exit 1

STOPSIGNAL SIGTERM

LABEL service.name=${SERVICE_NAME} \
      service.version=${SERVICE_VERSION} \
      org.opencontainers.image.title="${SERVICE_NAME}" \
      org.opencontainers.image.description="Go microservice" \
      org.opencontainers.image.source="https://github.com/org/platform" \
      org.opencontainers.image.vendor="Platform Team" \
      org.opencontainers.image.licenses="MIT"

CMD ["./app"]
