# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

Report security vulnerabilities by opening an issue with the "security" label.

Do not disclose security vulnerabilities publicly until they have been addressed.

## Security Practices

- No secrets in code - use environment variables or secrets managers
- All container images are scanned for vulnerabilities in CI
- Dependency updates are automated via Dependabot
- Infrastructure changes require Terraform plan review
- Production deployments require approval gate
- Least-privilege IAM roles for all services
- Container images run as non-root users
- Network policies restrict pod-to-pod communication
