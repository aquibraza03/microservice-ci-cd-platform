# Deployment pipeline architecture

The HTTP control plane persists an idempotent deployment and enqueues its UUID as the BullMQ job ID. It never checks out source or invokes build tools. A separate worker owns `validating` through `building`, uses a fresh temporary workspace, obtains a short-lived GitHub installation token and deletes the workspace on every exit path. Checkpoint 4 ends at `build_complete`; registry publishing and Kubernetes reconciliation are provider interfaces reserved for Checkpoint 5.

## State ownership and transitions

| From | Allowed next states | Owner |
| --- | --- | --- |
| queued | validating, cancel_requested, failed | Control plane queues; worker claims |
| validating | testing, cancel_requested, failed | Build worker |
| testing | scanning, cancel_requested, failed | Build worker |
| scanning | building, cancel_requested, failed | Build worker |
| building | build_complete, cancel_requested, failed | Build worker |
| build_complete | pushing, rollback_queued | Terminal for Checkpoint 4; Checkpoint 5 resumes |
| pushing | deploying, cancel_requested, failed | Future registry provider |
| deploying | verifying, cancel_requested, failed | Future Kubernetes controller |
| verifying | ready, cancel_requested, failed | Future Kubernetes controller |
| ready | rollback_queued | Future deployment controller |
| failed | queued, rollback_queued | Authorized retry or future rollback |
| cancel_requested | cancelled, failed | Current job owner |
| rollback_queued | rolling_back, cancel_requested, failed | Future deployment controller |
| rolling_back | rolled_back, cancel_requested, failed | Future deployment controller |
| cancelled, rolled_back | none | Terminal |

Every transition compares `state_version`, runs transactionally in PostgreSQL and writes an immutable monotonically sequenced event. A command ID makes retries idempotent. Worker attempts and heartbeats allow stalled BullMQ jobs to be retried; after configured attempts, BullMQ retains the failed job as the dead-letter record and the deployment has a safe terminal failure.

## Service contract

Each service has a `service.yml` no larger than 64 KiB. Supported keys are `name`, `root`, `context`, `dockerfile`, `port`, `health`, `environment`, `commands`, `resources` and `submodules`. Commands are arrays of argument arrays, for example `test: [["npm","test"]]`; shell strings are rejected. Absolute paths, `..`, control characters, invalid environment names, privileged mode, host networking/PID and Docker-socket settings are rejected. Submodules are forbidden in this checkpoint.

## Build isolation threat model

Untrusted repositories may attempt command injection, filesystem escape, credential theft, fork-based secret access, resource exhaustion or daemon takeover. Controls include exact detached commit checkout, no interactive Git, token only in the child environment via `GIT_ASKPASS`, no token in command arguments, symlink/tree verification, maximum repository/log/artifact sizes, argument-vector commands, read-only non-root worker container, dropped capabilities, no-new-privileges, PID/CPU/memory/tmpfs limits, timeout and cancellation propagation. The worker has no host Docker socket. Forked pull requests receive no production secrets. Production should add an egress policy allowing only GitHub and approved package mirrors and should run one ephemeral worker pod per trust boundary.

Rootless BuildKit emits an OCI archive and metadata in the disposable workspace. The tag/digest/platform/size metadata is retained, while the local archive is deliberately discarded during workspace cleanup because durable artifact storage is deferred. Cache is worker-scoped and controlled; no registry push occurs. The supplied local Compose worker is a development approximation. Kubernetes ephemeral jobs with runtime-class/seccomp/network policies are the production target.

## Queue, SSE, logs and recovery

BullMQ uses three attempts, exponential backoff, deterministic job IDs, a 30-second lock, 15-second stalled checks and a configurable concurrency limit. The queue exposes a per-organization quota hook. Worker `/health`, `/ready` and `/metrics` expose liveness, Redis readiness and Prometheus text metrics.

Deployment events carry a unique increasing sequence. The authorized SSE endpoint accepts `Last-Event-ID` or `after`, replays missed events and then streams new events with keepalives. The frontend uses an authenticated fetch stream because browser `EventSource` cannot set a bearer header. Logs are redacted before persistence, limited to 5 MiB by default, chunked to 64 KiB and retained seven days. Log download authorization remains bearer-protected and expires after five minutes.

On process interruption BullMQ reclaims stalled work. Idempotent state commands avoid duplicate transitions. If the attempt budget is exhausted, operators inspect the safe failure code and retained logs, correct configuration and call the retry endpoint with an idempotency key.

## Local startup

```bash
cp .env.example .env.local
cp services/control-plane-api/.env.example services/control-plane-api/.env
# Fill platform JWT/GitHub App values in the service .env; never commit it.
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml up -d --wait
cd services/control-plane-api && npm ci && npm run migrate && cd ../..
docker compose -f docker/docker-compose.pipeline.yml up --build -d
curl -fsS http://localhost:3001/api/v1/health
curl -fsS http://localhost:3002/health
curl -fsS http://localhost:3002/ready
curl -fsS http://localhost:3002/metrics
```

Stop without deleting durable volumes:

```bash
docker compose -f docker/docker-compose.pipeline.yml down
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml down
```
