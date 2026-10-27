# Deployment and provider alerts

**Alerts:** DeploymentFailureIncrease, RegistryFailure, KubernetesProviderFailure,
GitWebhookFailure, CertificateExpiryRisk. **Owner:** Deployments / Integrations / Networking.

- Symptoms: stage failures, failed pushes/applies/webhooks, or certificate expiry risk.
- User impact: commits do not deploy, rollouts fail, or routes risk TLS failure.
- Required access: provider status, scoped target metadata, deployment events and traces.
- Diagnose: identify bounded provider/operation/error category; verify credentials are
  active; compare digest, target capability and controller-observed status.
- Safe mitigation: pause affected provider operations, retry only classified transient
  failures, renew via the controller, or route to a verified target. Never bypass policy.
- Escalate: credential compromise, cross-tenant effect, mutable digest, admission bypass.
- Verify recovery: immutable digest deploys, rollout/health/route pass, provider metrics normalize.
- Preserve: workflow, deployment and trace IDs; digest; controller events; safe errors.
