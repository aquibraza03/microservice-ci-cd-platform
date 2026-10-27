const yaml = require("yaml");
const { ControlPlaneError } = require("../errors");
const { run } = require("../worker/workspace");
const { DIGEST } = require("./registry");
const DNS = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function name(value, label) {
  const v = String(value || "").toLowerCase();
  if (!DNS.test(v))
    throw new ControlPlaneError(
      400,
      "KUBERNETES_NAME_INVALID",
      `${label} is invalid`,
    );
  return v;
}
function workloadName(project, service, preview) {
  const suffix = preview?.isolationKey
    ? `-${name(preview.isolationKey, "Preview isolation key")}`
    : "";
  return `${project}-${service}${suffix}`.slice(0, 63).replace(/-$/, "");
}
function manifests(input) {
  const org = name(input.organizationSlug, "Organization slug"),
    project = name(input.projectSlug, "Project slug"),
    service = name(input.serviceSlug, "Service slug"),
    namespace = input.targetNamespace
      ? name(input.targetNamespace, "Target namespace")
      : `platform-${org}`,
    workload = workloadName(project, service, input.preview),
    pullSecretName = `${workload}-registry`,
    digest = input.imageReference.split("@")[1];
  if (!DIGEST.test(digest || ""))
    throw new ControlPlaneError(
      422,
      "IMAGE_DIGEST_REQUIRED",
      "Kubernetes deployments require an immutable image digest",
    );
  const labels = {
    "app.kubernetes.io/name": workload,
    "platform.example/organization": org,
    "platform.example/project": project,
    "platform.example/service": service,
    "platform.example/deployment-id": input.deploymentId,
    ...(input.preview
      ? {
          "platform.example/preview": "true",
          "platform.example/isolation-key": input.preview.isolationKey,
          "platform.example/untrusted": String(
            Boolean(input.preview.untrusted),
          ),
        }
      : {}),
  };
  const port = input.port;
  const probe = (p) => ({
    httpGet: { path: p, port },
    periodSeconds: 5,
    timeoutSeconds: 2,
    failureThreshold: 12,
  });
  return [
    {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: namespace,
        labels: {
          "platform.example/managed": "true",
          "platform.example/organization": org,
        },
      },
    },
    ...(input.pullSecret
      ? [
          {
            apiVersion: "v1",
            kind: "Secret",
            metadata: { name: pullSecretName, namespace, labels },
            type: "kubernetes.io/dockerconfigjson",
            data: { ".dockerconfigjson": input.pullSecret },
          },
        ]
      : []),
    {
      apiVersion: "v1",
      kind: "ServiceAccount",
      metadata: { name: workload, namespace, labels },
      automountServiceAccountToken: false,
    },
    {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: workload, namespace, labels },
      spec: {
        replicas: input.replicas || 1,
        strategy: {
          type: "RollingUpdate",
          rollingUpdate: { maxUnavailable: 0, maxSurge: 1 },
        },
        selector: { matchLabels: { "app.kubernetes.io/name": workload } },
        template: {
          metadata: { labels },
          spec: {
            serviceAccountName: workload,
            automountServiceAccountToken: false,
            ...(input.pullSecret
              ? { imagePullSecrets: [{ name: pullSecretName }] }
              : {}),
            securityContext: {
              runAsNonRoot: true,
              seccompProfile: { type: "RuntimeDefault" },
            },
            containers: [
              {
                name: "service",
                image: input.imageReference,
                imagePullPolicy: "IfNotPresent",
                ports: [{ name: "http", containerPort: port }],
                resources: {
                  requests: input.resources.requests,
                  limits: {
                    ...input.resources.limits,
                    ...(input.preview
                      ? {
                          "ephemeral-storage": `${Math.min(input.preview.quotas?.storageMebibytes || 1024, 2048)}Mi`,
                        }
                      : {}),
                  },
                },
                securityContext: {
                  allowPrivilegeEscalation: false,
                  readOnlyRootFilesystem:
                    input.readOnlyRootFilesystem !== false,
                  capabilities: { drop: ["ALL"] },
                },
                startupProbe: probe(input.startupPath),
                readinessProbe: probe(input.readinessPath),
                livenessProbe: probe(input.healthPath),
              },
            ],
          },
        },
      },
    },
    {
      apiVersion: "v1",
      kind: "Service",
      metadata: { name: workload, namespace, labels },
      spec: {
        type: input.localKind && !input.preview ? "NodePort" : "ClusterIP",
        selector: { "app.kubernetes.io/name": workload },
        ports: [
          {
            name: "http",
            port,
            targetPort: "http",
            ...(input.localKind ? { nodePort: input.nodePort } : {}),
          },
        ],
      },
    },
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: { name: `${workload}-default`, namespace, labels },
      spec: {
        podSelector: { matchLabels: { "app.kubernetes.io/name": workload } },
        policyTypes: ["Ingress", "Egress"],
        ingress: [{ ports: [{ protocol: "TCP", port }] }],
        egress: [
          {
            to: [
              {
                namespaceSelector: {
                  matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
                },
              },
            ],
            ports: [
              { protocol: "UDP", port: 53 },
              { protocol: "TCP", port: 53 },
            ],
          },
        ],
      },
    },
  ];
}
function render(items) {
  return items.map((item) => yaml.stringify(item)).join("---\n");
}
class DeploymentTargetProvider {
  async validate() {
    throw new Error("Not implemented");
  }
  async apply() {
    throw new Error("Not implemented");
  }
  async waitForRollout() {
    throw new Error("Not implemented");
  }
  async delete() {
    throw new Error("Not implemented");
  }
}
class KubernetesDeploymentProvider extends DeploymentTargetProvider {
  constructor({
    runImpl = run,
    context,
    timeoutMs = 300000,
    endpointHost = "127.0.0.1",
  } = {}) {
    super();
    Object.assign(this, { run: runImpl, context, timeoutMs, endpointHost });
  }
  _args(args) {
    return this.context ? ["--context", this.context, ...args] : args;
  }
  async _kubectl(args, { manifest, onOutput, signal } = {}) {
    try {
      return await this.run("kubectl", this._args(args), {
        cwd: process.cwd(),
        stdin: manifest,
        timeoutMs: this.timeoutMs,
        onOutput,
        signal,
      });
    } catch (error) {
      if (error.code === "WORKER_TIMEOUT")
        throw new ControlPlaneError(
          504,
          "KUBERNETES_ROLLOUT_TIMEOUT",
          "Kubernetes rollout timed out",
        );
      throw new ControlPlaneError(
        502,
        "KUBERNETES_OPERATION_FAILED",
        "Kubernetes operation failed",
      );
    }
  }
  async validate(input) {
    const content = render(manifests(input));
    await this.run(
      "kubeconform",
      ["-strict", "-summary", "-ignore-missing-schemas"],
      { cwd: process.cwd(), stdin: content, timeoutMs: this.timeoutMs },
    );
    await this._kubectl(["apply", "--dry-run=server", "-f", "-"], {
      manifest: content,
    });
    return { valid: true, manifest: content };
  }
  async apply(input) {
    const checked = await this.validate(input);
    await this._kubectl(
      [
        "apply",
        "--server-side",
        "--field-manager=platform-control-plane",
        "-f",
        "-",
      ],
      {
        manifest: checked.manifest,
        onOutput: input.onOutput,
        signal: input.signal,
      },
    );
    const namespace = input.targetNamespace
        ? name(input.targetNamespace, "Target namespace")
        : `platform-${name(input.organizationSlug, "Organization slug")}`,
      workload =
        `${name(input.projectSlug, "Project slug")}-${name(input.serviceSlug, "Service slug")}`
          .slice(0, 63)
          .replace(/-$/, "");
    return {
      namespace,
      workload,
      endpoint: input.localKind
        ? `http://${this.endpointHost}:${input.nodePort}`
        : null,
    };
  }
  async waitForRollout({ namespace, workload, signal, onOutput }) {
    await this._kubectl(
      [
        "-n",
        namespace,
        "rollout",
        "status",
        `deployment/${workload}`,
        `--timeout=${Math.floor(this.timeoutMs / 1000)}s`,
      ],
      { signal, onOutput },
    );
    const result = await this._kubectl([
      "-n",
      namespace,
      "get",
      "deployment",
      workload,
      "-o",
      "json",
    ]);
    const item = JSON.parse(result.stdout || "{}");
    if (item.status?.availableReplicas < 1)
      throw new ControlPlaneError(
        502,
        "KUBERNETES_NOT_READY",
        "Kubernetes workload is not ready",
      );
    return { ready: true, conditions: item.status?.conditions || [] };
  }
  async inspectObservedState({ namespace, workload, expectedDigest }) {
    const result = await this._kubectl([
        "-n",
        namespace,
        "get",
        "deployment",
        workload,
        "-o",
        "json",
      ]),
      item = JSON.parse(result.stdout || "{}"),
      desired = item.spec?.template?.spec?.containers?.[0]?.image,
      digest = desired?.includes("@")
        ? desired.slice(desired.indexOf("@") + 1)
        : null,
      conditions = item.status?.conditions || [],
      available = conditions.some(
        (x) => x.type === "Available" && x.status === "True",
      ),
      progressing = conditions.some(
        (x) => x.type === "Progressing" && x.status === "True",
      );
    return {
      digest,
      controllerConfirmed:
        available && progressing && digest === expectedDigest,
    };
  }
  async delete({ namespace, workload }) {
    await this._kubectl([
      "-n",
      namespace,
      "delete",
      `deployment/${workload}`,
      `service/${workload}`,
      `serviceaccount/${workload}`,
      `networkpolicy/${workload}-default`,
      `secret/${workload}-registry`,
      "--ignore-not-found=true",
    ]);
  }
  async deleteOwned({
    namespace,
    workload,
    organizationSlug,
    deploymentId,
    isolationKey,
  }) {
    let item;
    try {
      item = JSON.parse(
        (
          await this._kubectl([
            "-n",
            namespace,
            "get",
            "deployment",
            workload,
            "-o",
            "json",
          ])
        ).stdout || "{}",
      );
    } catch {
      return { deleted: false, missing: true };
    }
    const labels = item.metadata?.labels || {};
    if (
      labels["platform.example/organization"] !== organizationSlug ||
      labels["platform.example/deployment-id"] !== deploymentId ||
      labels["platform.example/isolation-key"] !== isolationKey
    )
      throw new ControlPlaneError(
        409,
        "RESOURCE_OWNERSHIP_MISMATCH",
        "Refusing to delete an unowned workload",
      );
    await this.delete({ namespace, workload });
    return { deleted: true };
  }
}
class TestDeploymentTargetProvider extends DeploymentTargetProvider {
  constructor({ fail = null, endpoint = "http://127.0.0.1:30080" } = {}) {
    super();
    Object.assign(this, { fail, endpoint, thisApplied: [] });
    this.applied = [];
  }
  async validate(input) {
    if (this.fail === "manifest")
      throw new ControlPlaneError(
        422,
        "KUBERNETES_MANIFEST_INVALID",
        "Kubernetes manifest is invalid",
      );
    manifests(input);
    return { valid: true };
  }
  async apply(input) {
    await this.validate(input);
    if (this.fail === "permission")
      throw new ControlPlaneError(
        502,
        "KUBERNETES_OPERATION_FAILED",
        "Kubernetes operation failed",
      );
    this.applied.push(input);
    return {
      namespace: `platform-${input.organizationSlug}`,
      workload: `${input.projectSlug}-${input.serviceSlug}`,
      endpoint: this.endpoint,
    };
  }
  async waitForRollout() {
    if (this.fail === "timeout")
      throw new ControlPlaneError(
        504,
        "KUBERNETES_ROLLOUT_TIMEOUT",
        "Kubernetes rollout timed out",
      );
    if (this.fail === "pull")
      throw new ControlPlaneError(
        502,
        "KUBERNETES_IMAGE_PULL_FAILED",
        "Kubernetes could not pull the image",
      );
    return { ready: true };
  }
  async inspectObservedState({ expectedDigest }) {
    if (this.fail === "digest")
      return { digest: `sha256:${"0".repeat(64)}`, controllerConfirmed: true };
    if (this.fail === "controller")
      return { digest: expectedDigest, controllerConfirmed: false };
    return { digest: expectedDigest, controllerConfirmed: true };
  }
  async deleteOwned(input) {
    this.deleted = this.deleted || [];
    this.deleted.push(input);
    return { deleted: true };
  }
}
module.exports = {
  DeploymentTargetProvider,
  KubernetesDeploymentProvider,
  TestDeploymentTargetProvider,
  manifests,
  render,
  workloadName,
};
