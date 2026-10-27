# DOCKER AUDIT

## Container Build Analysis

---

## Dockerfiles Analysed

| Service | Dockerfile | Build Stage | Base Image | Size Estimate |
|---------|-----------|-------------|------------|---------------|
| auth-service | `services/auth-service/Dockerfile` | Multi-stage | node:20-alpine | ~150MB |
| platform-smoke-test | `services/platform-smoke-test/Dockerfile` | Multi-stage | node:20-alpine | ~150MB |
| node-template | `templates/node-service/Dockerfile` | Multi-stage | node:20-alpine | ~150MB |
| python-template | `templates/python-service/Dockerfile` | Multi-stage | python:3.12-alpine | ~200MB |
| go-template | `templates/go-service/Dockerfile` | Multi-stage | golang:1.22-alpine | ~50MB |

**Missing Dockerfile**: 
- `orders-service` - empty directory, no Dockerfile
- `payments-service` - empty directory, no Dockerfile

---

## Build Pattern Analysis

### auth-service Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

**Issues:**
1. **No Digest Pin**: `node:20-alpine` may change over time. Should use `node:20-alpine@sha256:...`
2. **No apk Upgrade**: `RUN apk upgrade --no-cache` missing for security patches
3. **No Cache Cleanup**: `npm ci` modifies the builder stage, but the runner stage copies node_modules which may include dev dependencies. Missing `npm prune --production` before `npm run build`
4. **HEALTHCHECK Uses wget**: `wget` may not be installed in `node:20-alpine` (it typically isn't - Alpine uses `wget` though, so this should be fine)
5. **No .dockerignore**: A `.dockerignore` exists (`services/auth-service/.dockerignore`) with `node_modules` and `.env` entries - needs verification

### platform-smoke-test Dockerfile

Same pattern as auth-service Dockerfile but:
- **CRITICAL**: No `package.json` exists for this service, so `npm ci` at line 11 will fail
- The `dist` directory is copied but there's no build script in the code

### python-template Dockerfile

```dockerfile
FROM python:3.12-alpine AS builder
WORKDIR /app
COPY requirements.txt ./
RUN pip install --user -r requirements.txt

FROM python:3.12-alpine AS runner
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY --from=builder /app .
USER appuser
ENV PATH=/root/.local/bin:$PATH
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1
CMD ["python", "src/app.py"]
```

**Issues:**
1. **No Digest Pin**: Same as Node Dockerfiles
2. **apk Upgrade Missing**: Same
3. **PATH Manipulation**: `ENV PATH=/root/.local/bin:$PATH` assumes the user directory, but `--user` installs to user site-packages directory which might differ on different Python versions
4. **Single-Threaded HTTP Server**: The CMD uses `python src/app.py` which starts a single-threaded HTTPServer. This will be a performance bottleneck.

### go-template Dockerfile

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd

FROM alpine:3.19
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/server .
USER appuser
EXPOSE 8080
HEALTHCHECK CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1
CMD ["./server"]
```

**Issues:**
1. **No Digest Pin**: `golang:1.22-alpine` and `alpine:3.19` should use digest pins
2. **Static Binary Benefits**: CGO_ENABLED=0 produces a static binary. The final image is lightweight (~15MB for binary + ~5MB for alpine base). This is the best-practice approach.
3. **No `.dockerignore`**: Should exclude `cmd/` test files if the build directory includes tests

---

## `.dockerignore` Analysis

| File | Status | Contents |
|------|--------|----------|
| `services/auth-service/.dockerignore` | ✅ EXISTS | `node_modules`, `.env`, `Dockerfile` |
| `services/platform-smoke-test/.dockerignore` | ❌ MISSING | N/A |
| `templates/.dockerignore` | ❌ MISSING | N/A |
| Root `.dockerignore` | ❌ MISSING | N/A |

---

## Docker Compose

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  auth-service:
    build:
      context: ./services/auth-service
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    volumes:
      - ./services/auth-service/src:/app/src
```

**Issues:**
1. **Single Service Only**: Only defines `auth-service`. Other services (orders, payments, platform-smoke-test) are missing.
2. **No Dependencies**: No database, cache, message queue dependencies defined.
3. **No Network**: Uses default network, no custom bridge network for service isolation.
4. **No Volume for node_modules**: Missing anonymous volume for `node_modules` to prevent overwriting by host mount.

---

## Container Registry Integration

### Current Configuration
- ✅ GitHub Container Registry (ghcr.io) push in workflows
- ✅ Image tagging with branch + commit SHA
- ❌ No registry pull secret in Kubernetes manifests
- ❌ No image signing
- ❌ No registry for dev (all pushes go to ghcr.io)

### Image Tagging Convention
From `docker-buildx/action.yml` and workflows:
```
<registry>/<service>:<branch>-<sha>
```
Example: `ghcr.io/org/auth-service:develop-abc1234`

**Issues:**
1. No `:latest` tag strategy defined (used in some scripts, not in others)
2. No semantic version tagging in dev/staging
3. No multi-architecture builds (not using buildx for arm64/amd64)

---

## Score: 5/10

| Category | Score | Issues |
|----------|-------|--------|
| Multi-stage Builds | 9 | Good pattern used everywhere |
| Base Image Pinning | 1 | No digest pinning |
| Security Hardening | 4 | No apk upgrade, missing .dockerignore |
| Production Readiness | 3 | platform-smoke-test can't build, no lockfile |
| Registry Integration | 5 | Pushes work but no pull secrets |
| Docker Compose | 3 | Single service, no dependencies |
| Tag Strategy | 5 | Consistent but incomplete |
