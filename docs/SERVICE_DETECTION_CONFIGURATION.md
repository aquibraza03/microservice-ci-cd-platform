# Secure service detection and configuration

## Trust boundary

Detection checks out an exact 40–64 character commit through the existing GitHub App installation-token path into an ephemeral workspace. Tokens use `GIT_ASKPASS`, are absent from command arguments, and the workspace is deleted in `finally`. The engine only reads a conservative metadata/source allow-list. It does not run scripts, install dependencies, import code or invoke a container build.

The scanner rejects symlinks, traversal, excessive repository bytes, file count, nesting, inspected-file size and elapsed time. It skips `.env*`, private-key/credential filenames, build output and binary content. Environment discovery emits uppercase names only—never values.

## Deterministic precedence

1. Valid `service.yml`
2. Dockerfile metadata
3. `package.json` framework and scripts
4. Conservative null/default proposals requiring confirmation

Each field contains its own `confidence` and `evidence`. Conflicting names are returned rather than hidden. Candidate IDs are stable hashes of provider repository ID, immutable commit and service root. Duplicate names and overlapping build contexts are flagged for confirmation/narrowing.

Tier 1 is fully tested for `service.yml`, generic Dockerfiles, Node services and monorepos. Python, Go, Maven and Gradle are filename-recognition rules only and remain experimental; they do not propose production commands.

## Dashboard flow

Open `/services/configure?projectId=<project-id>` and complete Repository → Branch/commit → Detection → Service → Build → Runtime → Environment → Review. Only connected repositories belonging to the active organization appear. The commit must be a full immutable SHA.

Drafts autosave to PostgreSQL with a monotonically increasing version and optimistic concurrency. A sanitized recovery copy is also stored in browser local storage. Neither location accepts transient secret values; the browser stores only existing secret-reference identifiers. A stale version returns `VERSION_CONFLICT`, and a changed commit returns `COMMIT_DRIFT`.

Server validation enforces DNS-safe names, repository-contained paths, unprivileged container ports, CPU/memory limits, replica bounds, HTTP probe paths, timeouts, retries, environment names and secret-reference syntax. Invalid drafts may be recovered, but invalid configurations cannot become deployable.

## Migration

Run `npm run migrate` from `services/control-plane-api`. Migration `006_service_detection_configuration.sql` is additive and creates tenant-indexed detection, draft and saved-configuration tables. Applied migrations are immutable; corrections use a new forward migration.

## API

- `POST /api/v1/organizations/{org}/projects/{project}/repositories/{repo}/detections`
- `GET /api/v1/organizations/{org}/detections/{detection}`
- `GET|PUT /api/v1/organizations/{org}/projects/{project}/service-configuration/draft`
- `POST /api/v1/organizations/{org}/projects/{project}/service-configuration/validate`
- `POST /api/v1/organizations/{org}/projects/{project}/service-configurations`

All routes require platform authentication, tenant membership and centralized repository-management/observation permissions. Mutations emit audit records and safe request-correlated errors.
