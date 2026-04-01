# -------------------------------
# Build stage
# -------------------------------
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Static binary
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64

# Cache dependencies
COPY go.mod ./
RUN go mod download

# Copy source
COPY src/ ./src/

# Build binary (small + optimized)
RUN go build -ldflags="-s -w" -o app ./src/main.go


# -------------------------------
# Runtime stage (minimal + secure)
# -------------------------------
FROM alpine:3.19

# Create non-root user
RUN adduser -D -u 10001 appuser

WORKDIR /app

# Copy binary
COPY --from=builder /app/app .

# Permissions
RUN chown -R appuser:appuser /app
USER appuser

# -------------------------------
# Healthcheck (env-driven, no shell issues)
# -------------------------------
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD \
sh -c 'PORT=${SERVICE_PORT:-8080}; PATH_=${SERVICE_HEALTH_PATH:-/health}; \
wget -qO- http://localhost:${PORT}${PATH_} >/dev/null 2>&1 || exit 1'

# -------------------------------
# Graceful shutdown
# -------------------------------
STOPSIGNAL SIGTERM

# -------------------------------
# Entrypoint
# -------------------------------
CMD ["./app"]
