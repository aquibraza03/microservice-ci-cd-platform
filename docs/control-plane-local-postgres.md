# Local Control Plane PostgreSQL

The local vertical slice uses `docker/docker-compose.control-plane.yml` with a persistent `control-plane-postgres-data` volume and a PostgreSQL healthcheck. Credentials are supplied through an uncommitted `.env` file or process environment; no password is committed.

## Start

```powershell
$env:POSTGRES_USER = "control_plane_dev"
$env:POSTGRES_PASSWORD = "change-me-local-only"
$env:POSTGRES_DB = "control_plane"
docker compose -f docker/docker-compose.control-plane.yml up -d postgres
```

Run the API locally with `CONTROL_PLANE_STORAGE=postgres` and `DATABASE_URL=postgres://control_plane_dev:change-me-local-only@localhost:5432/control_plane`, or start the `control-plane` compose service after the database is healthy.

## Migrate and seed development data

```powershell
$env:DATABASE_URL = "postgres://control_plane_dev:change-me-local-only@localhost:5432/control_plane"
Push-Location services/control-plane-api
npm run migrate
npm run seed:dev
Pop-Location
```

The seed is explicitly development-only and creates a demo identity, one organization, one membership, and one project. It is never run during application startup and refuses `NODE_ENV=production`.

## Verify

```powershell
docker compose -f docker/docker-compose.control-plane.yml ps
Invoke-RestMethod http://localhost:3001/api/v1/health
Invoke-RestMethod http://localhost:3001/api/v1/ready
```

## Stop/reset

```powershell
docker compose -f docker/docker-compose.control-plane.yml down
docker compose -f docker/docker-compose.control-plane.yml down -v
```

The second command is destructive and removes the development database volume.
