# Contributing

## Getting Started

1. Run `make setup` to install required tools
2. Run `make doctor` to verify your environment
3. Run `make validate` to check all services

## Development Workflow

1. Create a feature branch from `develop`
2. Make changes following the platform conventions
3. Run `make lint` and `make test` to verify
4. Submit a pull request with a clear description

## Service Changes

- Every service must have a `service.yml` and `Dockerfile`
- New services should be created via `scripts/new-service.sh`
- Service ports are configured via environment variables, never hardcoded

## Pipeline Changes

- Test all workflow changes locally before committing
- Ensure backward compatibility with existing services
- Update documentation when adding new workflow triggers

## Code Standards

- Shell scripts: POSIX-compatible with `set -euo pipefail`
- Node.js: CommonJS modules, no framework dependencies
- Terraform: Format with `terraform fmt` before committing
- Dockerfiles: Multi-stage builds, non-root user, HEALTHCHECK

## Pull Request Process

1. Ensure all CI checks pass
2. Update the CHANGELOG.md with your changes
3. Request review from the platform team
4. Squash merge into develop/main
