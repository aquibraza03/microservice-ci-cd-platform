# Jenkins CI/CD Platform Setup

## Overview

This document describes the Jenkins CI/CD platform for the microservice ecosystem.

## Architecture

```
Jenkins Master (Kubernetes)
  ├── Multibranch Pipelines
  │   ├── Jenkinsfile (root)         # Auto-detection: CI vs OPS
  │   ├── Jenkinsfile.monorepo       # Monorepo build/test/deploy
  │   ├── Jenkinsfile.ops            # Security, infra, release ops
  │   └── Jenkinsfile.deploy         # Service deployment pipeline
  │
  ├── Shared Library (platform-shared-library)
  │   ├── vars/                      # Global pipeline steps
  │   │   ├── ciPipeline.groovy
  │   │   ├── deployPipeline.groovy
  │   │   ├── opsPipeline.groovy
  │   │   └── slackNotify.groovy
  │   ├── src/org/platform/          # Groovy classes
  │   │   ├── Governance.groovy      # Branch rules, freezes, approvals
  │   │   ├── Notifications.groovy   # Slack + Email notifications
  │   │   ├── PipelineLogger.groovy  # Structured logging
  │   │   └── Utils.groovy           # File/command utilities
  │   └── resources/                 # Configuration files
  │       ├── policies/
  │       │   ├── branch-rules.json
  │       │   ├── freeze-window.json
  │       │   ├── prod-approval.json
  │       │   ├── protected-services.json
  │       │   └── security-thresholds.json
  │       └── notifications/
  │           ├── slack.json
  │           └── email.html
  │
  └── Agents (Kubernetes Pod Templates)
      └── k8s-pod.yaml               # Runner + Docker sidecar
```

## Prerequisites

### Jenkins Plugins

| Plugin | Version | Purpose |
|--------|---------|---------|
| `kubernetes` | Latest | Dynamic agent provisioning |
| `workflow-aggregator` | Latest | Pipeline plugin suite |
| `git` | Latest | SCM checkout |
| `pipeline-groovy-lib` | Latest | Shared library support |
| `http_request` | Latest | Slack notifications |
| `html-publisher` | Latest | HTML report publishing |
| `blueocean` | Recommended | Modern UI |

### Jenkins Configuration

1. **Shared Library**: Add `platform-shared-library`
   - Name: `platform-shared-library`
   - Default version: `main`
   - Load implicitly: `false`
   - Allow default version to be overridden: `true`
   - Retrieval method: Modern SCM → Git
   - Project repository: `<this-repo>/jenkins/shared-library`

2. **Kubernetes Cloud**: Add cloud configuration
   - Name: `kubernetes`
   - Kubernetes URL: `https://kubernetes.default.svc`
   - Jenkins URL: `http://jenkins:8080`
   - Pod template: `jenkins/agents/k8s-pod.yaml`

3. **Global Environment Variables**:
   - `CI_AGENT_IMAGE`: `jenkins/inbound-agent:latest`
   - `DOCKER_IMAGE`: `docker:dind`
   - `CI_CPU_REQUEST`: `500m`
   - `CI_MEMORY_REQUEST`: `512Mi`
   - `CI_CPU_LIMIT`: `2000m`
   - `CI_MEMORY_LIMIT`: `2048Mi`

4. **Credentials**:
   - `SLACK_WEBHOOK_URL`: Slack incoming webhook
   - `GITHUB_TOKEN`: GitHub personal access token
   - `DOCKER_REGISTRY`: Container registry credentials
   - `KUBECONFIG`: Kubernetes cluster access

### Multibranch Pipeline Setup

1. Create Multibranch Pipeline job
2. Branch source: Git
3. Repository URL: `<this-repo>`
4. Build configuration: "Jenkinsfile" (root)
5. Scan periodically: yes

## Pipeline Types

### CI Pipeline (auto-detected)
Triggered by: Push/PR to main/develop
- Detects changed services
- Parallel build, test, security per service
- Docker build and push
- Smoke test

### Deploy Pipeline
Triggered by: Manual with SERVICE parameter
- Validates service existence
- Governance checks (branch rules, freeze window)
- Policy checks
- Pre-deploy validation
- Production approval gate
- Deploy with retry
- Smoke test
- Auto rollback on failure

### OPS Pipeline
Triggered by: Manual with MODE parameter
- security: Run security scanning
- infra: Terraform plan/apply
- release: Build and publish release
- dependency-update: Update dependencies

## Testing

```bash
cd jenkins/shared-library
mvn test
```

The shared library includes 5 test files covering:
- ciPipeline (6 tests)
- deployPipeline (6 tests)
- opsPipeline (7 tests)
- Governance (10 tests)
- Utils (8 tests)

## Security

- Pipeline scripts use script approval for `httpRequest`, `publishHTML`
- Governance enforces branch rules per environment
- Change freeze windows prevent deployments during blackout periods
- Protected services require additional approval
- Credentials are never printed in logs
- Jenkins agents run with least-privilege service accounts
