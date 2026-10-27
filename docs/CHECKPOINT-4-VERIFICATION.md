# Checkpoint 4 verification

The Checkpoint 3 baseline passed before changes: control-plane install, lint, 13 unit tests, 1 HTTP test, 24 security tests, migration contract and production audit; frontend install, lint (41 existing warnings), typecheck, 92 tests, build and production audit.

Checkpoint 4 adds migration 004, deployment/state/stage/event/attempt/log/artifact/image/cancellation persistence, a transactional state engine, deterministic BullMQ producer, separate worker, secure checkout, service validation, rootless BuildKit OCI capture, registry/deployment provider boundaries, authorized SSE, frontend live state and metrics.

## Post-change results

| Command | Result |
| --- | --- |
| Control plane `npm ci` | Pass |
| Control plane `npm run lint` | Pass |
| Control plane `npm run test:all` | Pass: 13 unit, 1 HTTP, 18 deployment/worker and 24 authentication/GitHub security tests |
| Control plane `npm run test:migration:contract` | Pass |
| Control plane `npm run test:migration:database` | Not run successfully: failed to connect to `127.0.0.1:5432` because PostgreSQL is unavailable in this runner |
| Control plane `npm audit --omit=dev` | Pass: 0 vulnerabilities after selecting BullMQ 5.81.5 and YAML 2.9.1 |
| Frontend `npm ci` | Pass |
| Frontend `npm run lint` | Pass: 0 errors and 41 pre-existing warnings |
| Frontend `npm run typecheck` | Pass |
| Frontend `npm test` | Pass: 92 tests |
| Frontend `npm run build` | Pass |
| Frontend `npm audit --omit=dev` | Pass: 0 vulnerabilities |

The three-active-job test completed all jobs while a scheduled event-loop callback ran, demonstrating that build work does not block the HTTP process model. It is a controlled in-process concurrency observation, not a production throughput benchmark.

The workspace has no `docker`, `psql`, `redis-server`, `buildctl` or `buildctl-daemonless.sh` executable. Consequently, live PostgreSQL migration/repository tests, Redis/BullMQ stalled-job behavior, the rootless BuildKit container and live GitHub checkout were not executed locally. They are configured in CI/Compose but still require execution in an infrastructure-capable environment. No image was published and no Kubernetes deployment was created.
