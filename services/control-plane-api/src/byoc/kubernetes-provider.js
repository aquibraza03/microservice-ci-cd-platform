const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const {
  DeploymentTargetProvider,
  capability,
} = require("../providers/contracts");
const { validateApiServerOrigin } = require("./security");
const REQUIRED = Object.freeze([
  [
    "apps",
    "deployments",
    ["get", "list", "watch", "create", "patch", "update", "delete"],
  ],
  ["", "services", ["get", "list", "create", "patch", "update", "delete"]],
  [
    "networking.k8s.io",
    "networkpolicies",
    ["get", "list", "create", "patch", "update", "delete"],
  ],
  [
    "",
    "serviceaccounts",
    ["get", "list", "create", "patch", "update", "delete"],
  ],
]);
class CustomerKubernetesTargetProvider extends DeploymentTargetProvider {
  constructor({
    clientFactory,
    lookup,
    production = true,
    allowPrivateNetworks = false,
    timeoutMs = 10000,
    supportLevel = "beta",
  }) {
    super();
    Object.assign(this, {
      clientFactory,
      lookup,
      production,
      allowPrivateNetworks,
      timeoutMs,
      supportLevel,
    });
  }
  capabilities() {
    return [
      "deploy",
      "rollout",
      "health",
      "rollback",
      "delete",
      "credential-rotation",
    ].map((id) => capability(id, this.supportLevel, true, "unit-tested"));
  }
  async validateTarget(input, credential) {
    const resolved = await validateApiServerOrigin(input.apiServerOrigin, {
      production: this.production,
      allowPrivateNetworks: this.allowPrivateNetworks,
      lookup: this.lookup,
    });
    const client = this.clientFactory({
      origin: resolved.origin,
      credential,
      rejectRedirects: true,
      pinnedAddresses: resolved.addresses,
      timeoutMs: this.timeoutMs,
    });
    let discovery;
    try {
      discovery = await client.discover();
    } catch {
      throw new ControlPlaneError(
        422,
        "KUBERNETES_CONNECTION_FAILED",
        "Kubernetes target validation failed",
      );
    }
    const fingerprint = crypto
      .createHash("sha256")
      .update(`${discovery.clusterUid}:${discovery.caFingerprint}`)
      .digest("hex");
    if (input.clusterFingerprint && input.clusterFingerprint !== fingerprint)
      throw new ControlPlaneError(
        409,
        "KUBERNETES_CLUSTER_IDENTITY_MISMATCH",
        "Kubernetes cluster identity changed",
      );
    const namespaces = [...new Set(input.allowedNamespaces || [])];
    if (
      !namespaces.length ||
      namespaces.some((x) => !/^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/.test(x))
    )
      throw new ControlPlaneError(
        400,
        "KUBERNETES_NAMESPACE_INVALID",
        "Allowed namespaces are invalid",
      );
    for (const namespace of namespaces)
      if (!(await client.namespaceExists(namespace)))
        throw new ControlPlaneError(
          422,
          "KUBERNETES_NAMESPACE_MISSING",
          "An allowed namespace does not exist",
        );
    const checks = await client.selfSubjectAccessReview(REQUIRED, namespaces),
      insufficient = checks.filter((x) => !x.allowed);
    if (insufficient.length)
      throw new ControlPlaneError(
        403,
        "KUBERNETES_PERMISSION_INSUFFICIENT",
        "Kubernetes target lacks required namespace permissions",
      );
    if (!/^v1\.(2[7-9]|[3-9][0-9])(?:\.|$)/.test(discovery.version))
      throw new ControlPlaneError(
        422,
        "KUBERNETES_VERSION_UNSUPPORTED",
        "Kubernetes API version is unsupported",
      );
    return {
      clusterFingerprint: fingerprint,
      kubernetesVersion: discovery.version,
      permissionValidation: "passed",
      connectionHealth: "healthy",
      capabilities: {
        deploy: true,
        rollback: true,
        delete: true,
        namespaceCreate: Boolean(discovery.namespaceCreate),
        kyverno: Boolean(discovery.apiGroups?.includes("kyverno.io")),
        externalSecrets: Boolean(
          discovery.apiGroups?.includes("external-secrets.io"),
        ),
      },
      resolvedAddressesHash: crypto
        .createHash("sha256")
        .update(resolved.addresses.sort().join(","))
        .digest("hex"),
    };
  }
}
module.exports = { CustomerKubernetesTargetProvider, REQUIRED };
