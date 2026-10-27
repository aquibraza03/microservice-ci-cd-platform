# Local development dependencies

## Prerequisites

- Docker Engine with Docker Compose v2
- Node.js 22 and npm 10 or newer
- Optional for local deployments: Kind and kubectl

The Compose project supplies PostgreSQL 16 and Redis 7 on a private bridge network. A local OCI registry is available through the optional `kind` profile. Values in `.env.example` are non-production examples, not secrets.

## Start

```bash
cp .env.example .env.local
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml up -d --wait
```

To include the registry for Kind:

```bash
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml --profile kind up -d --wait
```

Install and prepare the control-plane API:

```bash
cd services/control-plane-api
npm ci
DATABASE_URL=postgres://platform_local:local_dev_pg_7f3c_change_me@localhost:55432/platform_control_plane npm run migrate
DATABASE_URL=postgres://platform_local:local_dev_pg_7f3c_change_me@localhost:55432/platform_control_plane npm run seed:dev
DATABASE_URL=postgres://platform_local:local_dev_pg_7f3c_change_me@localhost:55432/platform_control_plane npm start
```

Redis is reachable at `redis://localhost:56379`. The optional registry is reachable at `localhost:5001`. Kind installation and registry wiring are planned work; the presence of the registry profile does not configure a Kind cluster.

## Check health

```bash
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml ps
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml exec postgres pg_isready -U platform_local -d platform_control_plane
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml exec redis redis-cli ping
curl http://localhost:5001/v2/
```

The registry `curl` applies only when the `kind` profile is running.

## Stop

Stop containers while retaining named-volume data:

```bash
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml --profile kind down
```

To deliberately remove local database, queue and registry data as well:

```bash
docker compose --env-file .env.local -f docker/docker-compose.local-dependencies.yml --profile kind down --volumes
```

Never reuse the example password outside an isolated local machine. Override it in `.env.local`, which is ignored by Git.
