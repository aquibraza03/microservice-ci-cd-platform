const { redact, redactValue } = require("./redaction");
const SCHEMA_VERSION = "deployment-event.v1";
const LEVELS = new Set(["debug", "info", "warn", "error"]);
function eventContract(deployment, input, sequence) {
  const createdAt = input.createdAt || new Date().toISOString();
  return {
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    sequence: Number(sequence),
    deploymentId: deployment.id,
    organizationId: deployment.organizationId,
    stage: input.stage || null,
    stateVersion:
      input.stateVersion == null ? null : Number(input.stateVersion),
    timestamp: createdAt,
    createdAt,
    level: LEVELS.has(input.level) ? input.level : "info",
    source: input.source || "control-plane",
    attempt: Number(input.attempt || 0),
    eventType: input.eventType,
    state: input.state || null,
    safeMessage: redact(input.safeMessage || "", input.secrets),
    metadata: redactValue(input.metadata || {}, input.secrets),
  };
}
module.exports = { SCHEMA_VERSION, eventContract };
