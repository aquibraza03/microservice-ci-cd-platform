const path = require("path");
const fs = require("fs/promises");
const YAML = require("yaml");
const { ControlPlaneError } = require("../errors");
const safeRel = (value, name) => {
  if (
    typeof value !== "string" ||
    path.isAbsolute(value) ||
    value.includes("\0") ||
    value.split(/[\\/]/).includes("..")
  )
    throw new ControlPlaneError(
      400,
      "SERVICE_CONTRACT_INVALID",
      `${name} must remain inside the repository`,
    );
  return value || ".";
};
function validateContract(value) {
  if (!value || typeof value !== "object")
    throw new ControlPlaneError(
      400,
      "SERVICE_CONTRACT_INVALID",
      "service.yml must be an object",
    );
  const name = String(value.name || "");
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(name))
    throw new ControlPlaneError(
      400,
      "SERVICE_CONTRACT_INVALID",
      "Service name is invalid",
    );
  const port = Number(value.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new ControlPlaneError(
      400,
      "SERVICE_CONTRACT_INVALID",
      "Port is invalid",
    );
  const env = value.environment || {},
    health = {
      startup: String(
        value.health?.startup || value.health?.liveness || "/health",
      ),
      liveness: String(value.health?.liveness || "/health"),
      readiness: String(value.health?.readiness || "/ready"),
    };
  if (Object.keys(env).some((k) => !/^[A-Z_][A-Z0-9_]{0,127}$/.test(k)))
    throw new ControlPlaneError(
      400,
      "SERVICE_CONTRACT_INVALID",
      "Environment variable name is invalid",
    );
  if (
    Object.values(health).some(
      (v) => !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{0,255}$/.test(v),
    )
  )
    throw new ControlPlaneError(
      400,
      "SERVICE_CONTRACT_INVALID",
      "Health path is invalid",
    );
  if (
    value.privileged ||
    value.hostNetwork ||
    value.hostPID ||
    value.dockerSocket ||
    value.kubernetes
  )
    throw new ControlPlaneError(
      400,
      "PRIVILEGED_BUILD_REJECTED",
      "Privileged or raw Kubernetes settings are not supported",
    );
  for (const command of [
    ...(value.commands?.install || []),
    ...(value.commands?.test || []),
    ...(value.commands?.security || []),
  ])
    if (
      !Array.isArray(command) ||
      command.length === 0 ||
      command.some((x) => typeof x !== "string" || x.length > 4096)
    )
      throw new ControlPlaneError(
        400,
        "SERVICE_CONTRACT_INVALID",
        "Commands must be argument arrays",
      );
  const legacy = value.resources || {},
    requests = legacy.requests || {
      cpu: legacy.cpu || "100m",
      memory: legacy.memory || "128Mi",
    },
    limits = legacy.limits || {
      cpu: legacy.cpuLimit || "500m",
      memory: legacy.memoryLimit || "512Mi",
    };
  for (const resources of [requests, limits]) {
    if (!/^([1-9]\d{0,3})m$/.test(resources.cpu || ""))
      throw new ControlPlaneError(
        400,
        "SERVICE_CONTRACT_INVALID",
        "CPU resource is invalid",
      );
    if (!/^([1-9]\d{0,3})(Mi|Gi)$/.test(resources.memory || ""))
      throw new ControlPlaneError(
        400,
        "SERVICE_CONTRACT_INVALID",
        "Memory resource is invalid",
      );
  }
  if (legacy.disk && !/^([1-9]\d{0,4})(Mi|Gi)$/.test(legacy.disk))
    throw new ControlPlaneError(
      400,
      "SERVICE_CONTRACT_INVALID",
      "Disk resource is invalid",
    );
  if (
    legacy.processes &&
    (!Number.isInteger(legacy.processes) ||
      legacy.processes < 1 ||
      legacy.processes > 512)
  )
    throw new ControlPlaneError(
      400,
      "SERVICE_CONTRACT_INVALID",
      "Process limit is invalid",
    );
  return {
    name,
    port,
    root: safeRel(value.root || ".", "root"),
    dockerfile: safeRel(value.dockerfile || "Dockerfile", "dockerfile"),
    context: safeRel(value.context || ".", "context"),
    health,
    commands: value.commands || {},
    resources: { requests, limits },
    environment: env,
    submodules: value.submodules || "forbid",
  };
}
async function loadContract(workspace, file = "service.yml") {
  const target = path.resolve(workspace, safeRel(file, "service.yml"));
  if (!target.startsWith(`${path.resolve(workspace)}${path.sep}`))
    throw new ControlPlaneError(
      400,
      "SERVICE_CONTRACT_INVALID",
      "service.yml escapes repository",
    );
  const raw = await fs.readFile(target, "utf8");
  if (Buffer.byteLength(raw) > 65536)
    throw new ControlPlaneError(
      413,
      "SERVICE_CONTRACT_TOO_LARGE",
      "service.yml is too large",
    );
  return validateContract(YAML.parse(raw));
}
module.exports = { safeRel, validateContract, loadContract };
