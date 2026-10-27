const crypto = require("crypto");
const yaml = require("yaml");
const { ControlPlaneError } = require("../errors");

const CATALOG = Object.freeze(
  [
    ["disallow-privileged", "validation"],
    ["disallow-host-namespaces", "validation"],
    ["restrict-hostpath", "validation"],
    ["block-docker-socket", "validation"],
    ["require-non-root", "validation"],
    ["disallow-privilege-escalation", "validation"],
    ["require-capability-drops", "validation"],
    ["require-seccomp", "validation"],
    ["require-resources", "validation"],
    ["restrict-registries", "validation"],
    ["require-image-digest", "validation"],
    ["verify-image-signature", "validation"],
    ["require-platform-labels", "validation"],
    ["require-production-probes", "validation"],
    ["restrict-service-account-token", "validation"],
    ["enforce-allowed-namespaces", "validation"],
    ["isolate-preview", "validation"],
    ["restrict-egress", "validation"],
    ["read-only-root-filesystem", "validation"],
  ].map(([id, kind]) => Object.freeze({ id, kind, version: 1 })),
);
const MODES = new Set([
  "enforce",
  "audit",
  "disabled",
  "unsupported",
  "unknown",
  "error",
]);

function targetPolicyStatus({
  target,
  policyId,
  configuredMode = "audit",
  evaluatedAt = new Date().toISOString(),
  violations = [],
}) {
  if (!CATALOG.some((p) => p.id === policyId))
    throw new ControlPlaneError(
      400,
      "POLICY_UNKNOWN",
      "Security policy is unknown",
    );
  const kyverno = target?.capabilityResults?.kyverno;
  let state = configuredMode,
    source = "platform_preflight";
  if (configuredMode === "disabled") state = "disabled";
  else if (kyverno === false) state = "unsupported";
  else if (!kyverno) state = "unknown";
  else if (
    configuredMode === "enforce" &&
    target.capabilityResults?.kyvernoEnforcing === true
  )
    source = "kubernetes_admission";
  else if (configuredMode === "enforce") state = "unknown";
  return {
    policyId,
    policyVersion: 1,
    state,
    targetCapability:
      kyverno === true
        ? "available"
        : kyverno === false
          ? "unavailable"
          : "unknown",
    evaluatedAt,
    violations: violations.map((v) => ({
      code: v.code,
      resource: v.resource || null,
      message: v.message,
    })),
    enforcementSource: source,
  };
}

function workloadViolations(
  manifest,
  { allowedRegistries = [], allowedNamespaces = [] } = {},
) {
  const pod =
      manifest.kind === "Deployment"
        ? manifest.spec?.template?.spec
        : manifest.spec,
    meta =
      manifest.kind === "Deployment"
        ? manifest.spec?.template?.metadata
        : manifest.metadata,
    out = [];
  if (!pod) return out;
  const containers = [...(pod.initContainers || []), ...(pod.containers || [])];
  if (pod.hostPID || pod.hostIPC || pod.hostNetwork)
    out.push({
      code: "HOST_NAMESPACE",
      message: "Host namespaces are prohibited",
    });
  if ((pod.volumes || []).some((v) => v.hostPath))
    out.push({ code: "HOST_PATH", message: "hostPath volumes are prohibited" });
  if (
    (pod.volumes || []).some((v) => v.hostPath?.path?.includes("docker.sock"))
  )
    out.push({
      code: "DOCKER_SOCKET",
      message: "Docker socket mounts are prohibited",
    });
  if (pod.automountServiceAccountToken !== false)
    out.push({
      code: "SERVICE_ACCOUNT_TOKEN",
      message: "Service-account token automount must be disabled",
    });
  if (pod.securityContext?.runAsNonRoot !== true)
    out.push({
      code: "RUN_AS_NON_ROOT",
      message: "Pod must require non-root execution",
    });
  if (
    pod.securityContext?.seccompProfile?.type !== "RuntimeDefault" &&
    pod.securityContext?.seccompProfile?.type !== "Localhost"
  )
    out.push({ code: "SECCOMP", message: "A seccomp profile is required" });
  for (const c of containers) {
    const s = c.securityContext || {};
    if (s.privileged === true)
      out.push({
        code: "PRIVILEGED",
        message: "Privileged containers are prohibited",
      });
    if (s.allowPrivilegeEscalation !== false)
      out.push({
        code: "PRIVILEGE_ESCALATION",
        message: "Privilege escalation must be disabled",
      });
    if (!(s.capabilities?.drop || []).includes("ALL"))
      out.push({
        code: "CAPABILITIES",
        message: "All Linux capabilities must be dropped",
      });
    if (!c.resources?.requests || !c.resources?.limits)
      out.push({
        code: "RESOURCES",
        message: "Resource requests and limits are required",
      });
    if (!String(c.image || "").includes("@sha256:"))
      out.push({
        code: "MUTABLE_IMAGE",
        message: "Images must use immutable digests",
      });
    if (
      allowedRegistries.length &&
      !allowedRegistries.some((r) => String(c.image).startsWith(`${r}/`))
    )
      out.push({ code: "REGISTRY", message: "Image registry is not allowed" });
  }
  const labels = meta?.labels || {};
  for (const k of [
    "platform.example/organization",
    "platform.example/project",
    "platform.example/service",
    "platform.example/deployment-id",
  ])
    if (!labels[k])
      out.push({
        code: "OWNERSHIP_LABEL",
        message: `Required label ${k} is missing`,
      });
  const ns = manifest.metadata?.namespace;
  if (allowedNamespaces.length && ns && !allowedNamespaces.includes(ns))
    out.push({
      code: "NAMESPACE",
      message: "Namespace is outside target scope",
    });
  return out;
}

function renderKyvernoPolicies({
  mode = "Audit",
  allowedRegistries = ["ghcr.io"],
  productionNamespaces = [],
} = {}) {
  const failureAction = mode.toLowerCase() === "enforce" ? "Enforce" : "Audit";
  const rules = [
    {
      name: "secure-pod-context",
      match: { any: [{ resources: { kinds: ["Deployment"] } }] },
      validate: {
        failureAction,
        message: "Workloads must use the platform restricted security context",
        pattern: {
          spec: {
            template: {
              spec: {
                hostPID: "false",
                hostIPC: "false",
                hostNetwork: "false",
                automountServiceAccountToken: false,
                securityContext: {
                  runAsNonRoot: true,
                  seccompProfile: { type: "RuntimeDefault" },
                },
                containers: [
                  {
                    securityContext: {
                      privileged: "false",
                      allowPrivilegeEscalation: false,
                      capabilities: { drop: ["ALL"] },
                    },
                    resources: {
                      requests: { "?*": "?*" },
                      limits: { "?*": "?*" },
                    },
                    image: "*@sha256:*",
                  },
                ],
              },
            },
          },
        },
      },
    },
    {
      name: "block-hostpath",
      match: { any: [{ resources: { kinds: ["Pod", "Deployment"] } }] },
      validate: {
        failureAction,
        message: "hostPath and Docker socket mounts are prohibited",
        deny: {
          conditions: {
            any: [
              {
                key: "{{ request.object.spec.volumes[?hostPath] | length(@) }}",
                operator: "GreaterThan",
                value: 0,
              },
            ],
          },
        },
      },
    },
    {
      name: "require-ownership-labels",
      match: {
        any: [{ resources: { kinds: ["Deployment", "Service", "Ingress"] } }],
      },
      validate: {
        failureAction,
        message: "Platform ownership labels are required",
        pattern: {
          metadata: {
            labels: {
              "platform.example/organization": "?*",
              "platform.example/project": "?*",
              "platform.example/service": "?*",
            },
          },
        },
      },
    },
  ];
  if (allowedRegistries.length)
    rules.push({
      name: "restrict-registries",
      match: { any: [{ resources: { kinds: ["Pod", "Deployment"] } }] },
      validate: {
        failureAction,
        message: "Only approved registries may be used",
        foreach: [
          {
            list: "request.object.spec.template.spec.containers || request.object.spec.containers",
            deny: {
              conditions: {
                all: [
                  {
                    key: "{{ element.image }}",
                    operator: "NotIn",
                    value: allowedRegistries.map((x) => `${x}/*`),
                  },
                ],
              },
            },
          },
        ],
      },
    });
  if (productionNamespaces.length)
    rules.push({
      name: "production-probes",
      match: {
        any: [
          {
            resources: {
              kinds: ["Deployment"],
              namespaces: productionNamespaces,
            },
          },
        ],
      },
      validate: {
        failureAction,
        message: "Production containers require readiness and liveness probes",
        pattern: {
          spec: {
            template: {
              spec: { containers: [{ readinessProbe: {}, livenessProbe: {} }] },
            },
          },
        },
      },
    });
  return yaml.stringify({
    apiVersion: "kyverno.io/v1",
    kind: "ClusterPolicy",
    metadata: {
      name: "platform-workload-security",
      labels: { "app.kubernetes.io/managed-by": "platform-control-plane" },
    },
    spec: { background: true, validationFailureAction: failureAction, rules },
  });
}

function policyHash(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}
module.exports = {
  CATALOG,
  MODES,
  targetPolicyStatus,
  workloadViolations,
  renderKyvernoPolicies,
  policyHash,
};
