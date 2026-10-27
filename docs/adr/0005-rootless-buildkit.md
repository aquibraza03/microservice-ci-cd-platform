# ADR 0005: Isolated rootless BuildKit workers

**Status:** Accepted for Phase 1

## Decision
Run each untrusted build in an isolated, ephemeral worker using rootless BuildKit. Never mount the host Docker socket into platform workloads.

## Context
User-controlled repositories and Dockerfiles are hostile inputs. A shared Docker daemon or host socket grants unacceptable control over the worker host.

## Alternatives
Docker-outside-of-Docker via `/var/run/docker.sock` is rejected. Privileged Docker-in-Docker has excessive privileges. Hosted third-party builders reduce control and portability.

## Security implications
Use disposable workers, non-root execution, seccomp/AppArmor, network egress policy, resource and time limits, isolated caches, short-lived registry credentials, provenance and image scanning. Rootless mode reduces but does not eliminate kernel risk.

## Operational implications
Workers require scheduling, cleanup, cache strategy, BuildKit version management and capacity metrics. Some Dockerfile features may be unsupported.

## Consequences
Tenant builds are strongly separated from the control plane and host daemon; builds may be slower and more operationally complex.

## Future extension points
Add remote worker pools, stronger VM or sandbox isolation, distributed caches and signed attestations behind the worker interface.
