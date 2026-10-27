const yaml = require("yaml");
const { ControlPlaneError } = require("../errors");
const { run } = require("../worker/workspace");
function routeManifests(input) {
  if (
    !/^[-a-z0-9.]{1,253}$/.test(input.hostname) ||
    input.hostname.includes("..")
  )
    throw new ControlPlaneError(
      400,
      "ROUTE_HOST_INVALID",
      "Route hostname is invalid",
    );
  const labels = {
    "platform.example/managed": "true",
    "platform.example/organization-id": input.organizationId,
    "platform.example/preview-id": input.previewId,
    "platform.example/route-id": input.routeId,
  };
  const ingress = {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name: input.resourceName,
      namespace: input.namespace,
      labels,
      annotations: {
        "nginx.ingress.kubernetes.io/ssl-redirect": input.tlsRequired
          ? "true"
          : "false",
        ...(input.tlsRequired
          ? { "cert-manager.io/cluster-issuer": input.clusterIssuer }
          : {}),
      },
    },
    spec: {
      ingressClassName: input.ingressClass,
      tls: input.tlsRequired
        ? [{ hosts: [input.hostname], secretName: `${input.resourceName}-tls` }]
        : [],
      rules: [
        {
          host: input.hostname,
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: {
                  service: {
                    name: input.backendService,
                    port: { number: input.backendPort },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };
  return [
    input.tlsRequired
      ? {
          apiVersion: "cert-manager.io/v1",
          kind: "Certificate",
          metadata: {
            name: `${input.resourceName}-tls`,
            namespace: input.namespace,
            labels,
          },
          spec: {
            secretName: `${input.resourceName}-tls`,
            issuerRef: { name: input.clusterIssuer, kind: "ClusterIssuer" },
            dnsNames: [input.hostname],
          },
        }
      : null,
    ingress,
  ].filter(Boolean);
}
class KubernetesIngressRouter {
  constructor({
    runImpl = run,
    context,
    timeoutMs = 120000,
    ingressClass = "nginx",
    clusterIssuer = "letsencrypt-prod",
  } = {}) {
    Object.assign(this, {
      run: runImpl,
      context,
      timeoutMs,
      ingressClass,
      clusterIssuer,
    });
  }
  args(values) {
    return this.context ? ["--context", this.context, ...values] : values;
  }
  async kubectl(values, options = {}) {
    try {
      return await this.run("kubectl", this.args(values), {
        cwd: process.cwd(),
        timeoutMs: this.timeoutMs,
        ...options,
      });
    } catch {
      throw new ControlPlaneError(
        502,
        "ROUTE_OPERATION_FAILED",
        "Routing operation failed",
      );
    }
  }
  async apply(input) {
    const items = routeManifests({
        ...input,
        ingressClass: this.ingressClass,
        clusterIssuer: this.clusterIssuer,
      }),
      manifest = items.map((x) => yaml.stringify(x)).join("---\n");
    await this.kubectl(
      [
        "apply",
        "--server-side",
        "--field-manager=platform-preview-controller",
        "-f",
        "-",
      ],
      { stdin: manifest },
    );
    const ingress = await this.inspect(input);
    if (!ingress.backendResolved)
      throw new ControlPlaneError(
        502,
        "ROUTE_BACKEND_UNRESOLVED",
        "Route backend does not resolve",
      );
    return ingress;
  }
  async inspect(input) {
    const [ingress, service] = await Promise.all([
      this.kubectl([
        "-n",
        input.namespace,
        "get",
        "ingress",
        input.resourceName,
        "-o",
        "json",
      ]),
      this.kubectl([
        "-n",
        input.namespace,
        "get",
        "service",
        input.backendService,
        "-o",
        "json",
      ]),
    ]);
    const i = JSON.parse(ingress.stdout || "{}"),
      s = JSON.parse(service.stdout || "{}");
    return {
      exists:
        i.metadata?.labels?.["platform.example/route-id"] === input.routeId,
      backendResolved: s.metadata?.name === input.backendService,
      address:
        i.status?.loadBalancer?.ingress?.[0]?.hostname ||
        i.status?.loadBalancer?.ingress?.[0]?.ip ||
        null,
    };
  }
  async certificate(input) {
    if (!input.tlsRequired) return { status: "ready", expiresAt: null };
    try {
      const result = await this.kubectl([
          "-n",
          input.namespace,
          "get",
          "certificate",
          `${input.resourceName}-tls`,
          "-o",
          "json",
        ]),
        cert = JSON.parse(result.stdout || "{}"),
        ready = cert.status?.conditions?.some(
          (x) => x.type === "Ready" && x.status === "True",
        );
      return {
        status: ready
          ? "ready"
          : cert.status?.conditions?.some((x) => x.status === "False")
            ? "failed"
            : "pending",
        expiresAt: cert.status?.notAfter || null,
      };
    } catch {
      return { status: "failed", expiresAt: null };
    }
  }
  async deleteOwned(input) {
    for (const [kind, name] of [
      ["ingress", input.resourceName],
      ["certificate", `${input.resourceName}-tls`],
    ]) {
      let found;
      try {
        found = JSON.parse(
          (
            await this.kubectl([
              "-n",
              input.namespace,
              "get",
              kind,
              name,
              "-o",
              "json",
            ])
          ).stdout || "{}",
        );
      } catch {
        continue;
      }
      const labels = found.metadata?.labels || {};
      if (
        labels["platform.example/route-id"] !== input.routeId ||
        labels["platform.example/organization-id"] !== input.organizationId
      )
        throw new ControlPlaneError(
          409,
          "RESOURCE_OWNERSHIP_MISMATCH",
          "Refusing to delete an unowned resource",
        );
      await this.kubectl([
        "-n",
        input.namespace,
        "delete",
        kind,
        name,
        "--ignore-not-found=true",
      ]);
    }
    return { deleted: true };
  }
}
class TestIngressRouter extends KubernetesIngressRouter {
  constructor({ fail = null, certificateStatus = "ready" } = {}) {
    super({ runImpl: async () => ({ stdout: "{}" }) });
    this.fail = fail;
    this.certificateStatus = certificateStatus;
    this.items = new Map();
  }
  async apply(input) {
    if (this.fail === "route")
      throw new ControlPlaneError(
        502,
        "ROUTE_OPERATION_FAILED",
        "Routing operation failed",
      );
    this.items.set(input.routeId, { ...input });
    return { exists: true, backendResolved: true, address: "127.0.0.1" };
  }
  async inspect(input) {
    return {
      exists: this.items.has(input.routeId),
      backendResolved: this.items.has(input.routeId),
      address: "127.0.0.1",
    };
  }
  async certificate() {
    return {
      status: this.certificateStatus,
      expiresAt:
        this.certificateStatus === "ready"
          ? new Date(Date.now() + 86400000).toISOString()
          : null,
    };
  }
  async deleteOwned(input) {
    const item = this.items.get(input.routeId);
    if (
      item &&
      (item.organizationId !== input.organizationId ||
        item.previewId !== input.previewId)
    )
      throw new ControlPlaneError(
        409,
        "RESOURCE_OWNERSHIP_MISMATCH",
        "Refusing to delete an unowned resource",
      );
    this.items.delete(input.routeId);
    return { deleted: true };
  }
}
module.exports = { routeManifests, KubernetesIngressRouter, TestIngressRouter };
