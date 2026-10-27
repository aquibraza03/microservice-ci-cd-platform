const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");

const FORBIDDEN =
  /(^|_)(secret(value|plaintext)?|token|credential|password|privatekey|authorization)$/i;

function canonicalize(value) {
  if (value === null || ["string", "boolean"].includes(typeof value))
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new ControlPlaneError(
        400,
        "APPROVAL_SNAPSHOT_INVALID",
        "Snapshot contains a non-finite number",
      );
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object")
    throw new ControlPlaneError(
      400,
      "APPROVAL_SNAPSHOT_INVALID",
      "Snapshot contains an unsupported value",
    );
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => {
        if (FORBIDDEN.test(key))
          throw new ControlPlaneError(
            400,
            "APPROVAL_SNAPSHOT_SENSITIVE",
            "Snapshot contains a prohibited sensitive field",
          );
        return [key, canonicalize(value[key])];
      }),
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}
function snapshotDigest(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function deploymentSnapshot(input) {
  const config = input.configurationSnapshot || {};
  return canonicalize({
    actionType: input.actionType || "deployment.production",
    organizationId: input.organizationId,
    projectId: input.projectId,
    environment: input.environment,
    serviceId: input.serviceId,
    artifactImageDigest: input.imageDigest || null,
    sourceCommitSha: input.commitSha,
    configurationSnapshotHash: snapshotDigest(config),
    secretReferences: (config.secretReferences || []).map((x) => ({
      id: x.id,
      referenceVersion: x.referenceVersion,
    })),
    deploymentTarget: config.deploymentTargetId
      ? {
          id: config.deploymentTargetId,
          version: config.targetCredentialVersion || null,
        }
      : null,
    policyResultHash: input.policyResultHash || null,
    requestedOperation: input.requestedOperation || "deploy",
    requestingActorId: input.requestingActorId,
  });
}

module.exports = {
  canonicalize,
  canonicalJson,
  snapshotDigest,
  deploymentSnapshot,
};
