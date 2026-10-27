# Foundation-only API and idle worker: no build/deployment toolchain or host socket.
FROM node:20-alpine@sha256:afdf98210b07b586eb71fa22ba2e432e058e4cd1304d31ed60888755b8c865fb
WORKDIR /app
COPY services/control-plane-api/package*.json ./
RUN npm ci --omit=dev
COPY services/control-plane-api/src ./src
COPY services/control-plane-api/migrations ./migrations
COPY services/control-plane-api/openapi.yaml ./openapi.yaml
COPY scripts/staging/smoke.cjs ./staging-smoke.cjs
USER node
ENV PORT=3000
CMD ["node", "src/server.js"]
