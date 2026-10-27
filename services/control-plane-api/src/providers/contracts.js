const SUPPORT_LEVELS = Object.freeze([
  "production",
  "beta",
  "experimental",
  "planned",
  "unsupported",
]);
const CAPABILITIES = Object.freeze({
  CLOUD_ACCOUNT: [
    "identity",
    "regions",
    "connection-rotation",
    "disable",
    "revoke",
  ],
  KUBERNETES_TARGET: [
    "deploy",
    "rollout",
    "health",
    "rollback",
    "delete",
    "credential-rotation",
    "namespace-create",
    "kyverno",
    "external-secrets",
  ],
});
class UnsupportedCapabilityError extends Error {
  constructor(capability) {
    super(`Capability ${capability} is unsupported`);
    this.code = "PROVIDER_CAPABILITY_UNSUPPORTED";
    this.retryable = false;
  }
}
function capability(id, supportLevel, enabled, evidence = "not-yet-verified") {
  if (!SUPPORT_LEVELS.includes(supportLevel))
    throw new Error("Invalid provider support level");
  return Object.freeze({
    id,
    supportLevel,
    enabled: Boolean(enabled),
    evidence,
  });
}
class CloudAccountProvider {
  capabilities() {
    return [];
  }
  requireCapability(id) {
    const item = this.capabilities().find((x) => x.id === id && x.enabled);
    if (!item) throw new UnsupportedCapabilityError(id);
    return item;
  }
}
class DeploymentTargetProvider {
  capabilities() {
    return [];
  }
  requireCapability(id) {
    const item = this.capabilities().find((x) => x.id === id && x.enabled);
    if (!item) throw new UnsupportedCapabilityError(id);
    return item;
  }
}
module.exports = {
  SUPPORT_LEVELS,
  CAPABILITIES,
  capability,
  CloudAccountProvider,
  DeploymentTargetProvider,
  UnsupportedCapabilityError,
};
