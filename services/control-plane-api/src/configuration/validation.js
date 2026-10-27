const path = require("path");
const YAML = require("yaml");
const { safeRelative } = require("../detection/engine");

const NAME = /^[a-z][a-z0-9-]{1,62}$/;
const ENV = /^[A-Z_][A-Z0-9_]{0,127}$/;
const SECRET_REF = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,254}$/;
function quantityCpu(value) {
  const m = String(value || "").match(/^(\d+)(m)?$/);
  return m ? (m[2] ? Number(m[1]) : Number(m[1]) * 1000) : NaN;
}
function quantityMemory(value) {
  const m = String(value || "").match(/^(\d+)(Mi|Gi)$/);
  return m ? Number(m[1]) * (m[2] === "Gi" ? 1024 : 1) : NaN;
}
function validateConfiguration(input) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (!NAME.test(input.serviceName || ""))
    add("serviceName", "Use a lowercase DNS-safe service name");
  for (const key of ["serviceRoot", "dockerfilePath", "buildContext"])
    try {
      safeRelative(input[key], key);
    } catch (error) {
      add(key, error.message);
    }
  try {
    const root = safeRelative(input.serviceRoot, "serviceRoot"),
      context = safeRelative(input.buildContext, "buildContext"),
      docker = safeRelative(input.dockerfilePath, "dockerfilePath");
    if (root !== "." && context !== root && !context.startsWith(`${root}/`))
      add("buildContext", "Build context must remain inside the service root");
    if (
      context !== "." &&
      docker !== context &&
      !docker.startsWith(`${context}/`)
    )
      add("dockerfilePath", "Dockerfile must remain inside the build context");
  } catch {
    /* individual path errors are reported above */
  }
  if (
    !Number.isInteger(input.containerPort) ||
    input.containerPort < 1024 ||
    input.containerPort > 65535
  )
    add("containerPort", "Port must be between 1024 and 65535");
  for (const key of ["startupPath", "readinessPath", "healthPath"])
    if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{0,254}$/.test(input[key] || ""))
      add(key, "Path must be an absolute HTTP path");
  const cpuRequest = quantityCpu(input.cpuRequest),
    cpuLimit = quantityCpu(input.cpuLimit),
    memoryRequest = quantityMemory(input.memoryRequest),
    memoryLimit = quantityMemory(input.memoryLimit);
  if (!(cpuRequest >= 25 && cpuRequest <= 8000))
    add("cpuRequest", "CPU request must be 25m to 8 cores");
  if (!(cpuLimit >= cpuRequest && cpuLimit <= 16000))
    add(
      "cpuLimit",
      "CPU limit must be at least request and no more than 16 cores",
    );
  if (!(memoryRequest >= 32 && memoryRequest <= 16384))
    add("memoryRequest", "Memory request must be 32Mi to 16Gi");
  if (!(memoryLimit >= memoryRequest && memoryLimit <= 32768))
    add(
      "memoryLimit",
      "Memory limit must be at least request and no more than 32Gi",
    );
  if (
    !Number.isInteger(input.minReplicas) ||
    input.minReplicas < 0 ||
    input.minReplicas > 50
  )
    add("minReplicas", "Minimum replicas must be 0 to 50");
  if (
    !Number.isInteger(input.maxReplicas) ||
    input.maxReplicas < input.minReplicas ||
    input.maxReplicas > 100
  )
    add("maxReplicas", "Maximum replicas must be between minimum and 100");
  if (
    !Number.isInteger(input.timeoutSeconds) ||
    input.timeoutSeconds < 5 ||
    input.timeoutSeconds > 3600
  )
    add("timeoutSeconds", "Timeout must be 5 to 3600 seconds");
  if (
    !Number.isInteger(input.retryCount) ||
    input.retryCount < 0 ||
    input.retryCount > 10
  )
    add("retryCount", "Retry count must be 0 to 10");
  if (
    !["development", "staging", "production"].includes(input.targetEnvironment)
  )
    add("targetEnvironment", "Target environment is invalid");
  if (
    typeof input.kubernetesTarget !== "string" ||
    input.kubernetesTarget.length < 1 ||
    input.kubernetesTarget.length > 128
  )
    add("kubernetesTarget", "Kubernetes target is required");
  const variables = input.variables || {};
  for (const [key, value] of Object.entries(variables)) {
    if (!ENV.test(key))
      add(`variables.${key}`, "Environment variable name is invalid");
    if (typeof value !== "string" || value.length > 4096)
      add(`variables.${key}`, "Environment value is invalid");
  }
  if ("secrets" in input || "secretValues" in input)
    add("secretReferences", "Secret values are not accepted");
  for (const ref of input.secretReferences || [])
    if (typeof ref !== "string" || !SECRET_REF.test(ref))
      add("secretReferences", "Secret reference is invalid");
  return {
    valid: errors.length === 0,
    errors,
    warnings:
      input.minReplicas === 0
        ? [
            {
              field: "minReplicas",
              message: "Scale-to-zero may add cold-start latency",
            },
          ]
        : [],
  };
}
function exportServiceYaml(input) {
  const doc = {
    version: 1,
    service: {
      name: input.serviceName,
      root: input.serviceRoot,
      build: {
        dockerfile:
          path.posix.relative(input.serviceRoot, input.dockerfilePath) ||
          "Dockerfile",
        context: input.buildContext,
        command: input.buildCommand || null,
        test: input.testCommand || null,
      },
      run: { command: input.startCommand || null, port: input.containerPort },
      health: {
        startup: input.startupPath,
        readiness: input.readinessPath,
        path: input.healthPath,
      },
      resources: {
        cpu: { request: input.cpuRequest, limit: input.cpuLimit },
        memory: { request: input.memoryRequest, limit: input.memoryLimit },
      },
      scaling: { min: input.minReplicas, max: input.maxReplicas },
      environment: {
        target: input.targetEnvironment,
        kubernetesTarget: input.kubernetesTarget,
        variables: input.variables || {},
        secretReferences: input.secretReferences || [],
      },
      policy: input.deploymentPolicy || "standard",
    },
  };
  return YAML.stringify(doc);
}
module.exports = { validateConfiguration, exportServiceYaml };
