const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const SCHEMA_VERSION = "1.0";
const MAX_METADATA_BYTES = 16384;
const FORBIDDEN =
  /(authorization|access.?token|refresh.?token|secret.?value|plaintext|password|credential|private.?key|kubeconfig|service.?account.?token)/i;
// eslint-disable-next-line no-control-regex -- deliberately strips log-forging controls
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
function cleanString(v, max = 2048) {
  return String(v ?? "")
    .replace(CONTROL, "")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, max);
}
function redact(value, depth = 0) {
  if (depth > 8) return "[DEPTH_LIMIT]";
  if (value === null || typeof value === "boolean" || typeof value === "number")
    return value;
  if (typeof value === "string") return cleanString(value);
  if (Array.isArray(value))
    return value.slice(0, 100).map((x) => redact(x, depth + 1));
  if (typeof value !== "object") return cleanString(value);
  const out = {};
  for (const [key, val] of Object.entries(value).slice(0, 100)) {
    const safeKey = cleanString(key, 128);
    out[safeKey] = FORBIDDEN.test(safeKey)
      ? "[REDACTED]"
      : redact(val, depth + 1);
  }
  return out;
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(",")}}`;
}
function validateInput(input) {
  for (const key of [
    "organizationId",
    "action",
    "resourceType",
    "result",
    "sourceCategory",
  ]) {
    if (!input[key])
      throw new ControlPlaneError(
        400,
        "AUDIT_EVENT_INVALID",
        `Audit ${key} is required`,
      );
  }
  const metadata = redact(input.metadata || {});
  if (Buffer.byteLength(JSON.stringify(metadata)) > MAX_METADATA_BYTES)
    throw new ControlPlaneError(
      413,
      "AUDIT_METADATA_TOO_LARGE",
      "Audit metadata is too large",
    );
  return {
    schemaVersion: SCHEMA_VERSION,
    organizationId: cleanString(input.organizationId, 128),
    actorType: cleanString(input.actorType || "user", 32),
    actorId: input.actorId ? cleanString(input.actorId, 128) : null,
    sessionReference: input.sessionReference
      ? crypto
          .createHash("sha256")
          .update(String(input.sessionReference))
          .digest("hex")
      : null,
    action: cleanString(input.action, 160),
    resourceType: cleanString(input.resourceType, 80),
    resourceId: input.resourceId ? cleanString(input.resourceId, 256) : null,
    result: cleanString(input.result, 32),
    reasonCode: input.reasonCode ? cleanString(input.reasonCode, 120) : null,
    requestId: input.requestId ? cleanString(input.requestId, 128) : null,
    correlationId: input.correlationId
      ? cleanString(input.correlationId, 128)
      : null,
    traceId: input.traceId ? cleanString(input.traceId, 128) : null,
    sourceCategory: cleanString(input.sourceCategory, 64),
    ipMetadata: input.ipMetadata
      ? {
          family: cleanString(input.ipMetadata.family, 16),
          prefix: cleanString(input.ipMetadata.prefix, 80),
        }
      : null,
    userAgent: input.userAgent
      ? crypto
          .createHash("sha256")
          .update(cleanString(input.userAgent, 512))
          .digest("hex")
      : null,
    objectVersion: Number.isSafeInteger(input.objectVersion)
      ? input.objectVersion
      : null,
    idempotencyKey: cleanString(
      input.idempotencyKey || crypto.randomUUID(),
      256,
    ),
    metadata,
  };
}
module.exports = {
  SCHEMA_VERSION,
  MAX_METADATA_BYTES,
  cleanString,
  redact,
  canonical,
  validateInput,
};
