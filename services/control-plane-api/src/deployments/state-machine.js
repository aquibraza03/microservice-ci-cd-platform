const { ControlPlaneError } = require("../errors");
const STATES = [
  "waiting_for_approval",
  "queued",
  "validating",
  "testing",
  "scanning",
  "building",
  "build_complete",
  "pushing",
  "deploying",
  "verifying",
  "ready",
  "failed",
  "cancel_requested",
  "cancelled",
  "rollback_queued",
  "rolling_back",
  "rolled_back",
];
const TERMINAL = new Set([
  "build_complete",
  "ready",
  "failed",
  "cancelled",
  "rolled_back",
]);
const ALLOWED = {
  waiting_for_approval: ["queued", "cancelled", "failed"],
  queued: ["validating", "rollback_queued", "cancel_requested", "failed"],
  validating: ["testing", "cancel_requested", "failed"],
  testing: ["scanning", "cancel_requested", "failed"],
  scanning: ["building", "cancel_requested", "failed"],
  building: ["build_complete", "cancel_requested", "failed"],
  build_complete: ["pushing", "rollback_queued"],
  pushing: ["deploying", "cancel_requested", "failed"],
  deploying: ["verifying", "cancel_requested", "failed"],
  ready: ["rollback_queued"],
  failed: ["queued", "rollback_queued"],
  cancel_requested: ["cancelled", "failed"],
  cancelled: [],
  rollback_queued: ["rolling_back", "cancel_requested", "failed"],
  rolling_back: ["verifying", "cancel_requested", "failed"],
  verifying: ["ready", "rolled_back", "cancel_requested", "failed"],
  rolled_back: [],
};
function assertTransition(from, to) {
  if (!STATES.includes(to) || !(ALLOWED[from] || []).includes(to))
    throw new ControlPlaneError(
      409,
      "INVALID_DEPLOYMENT_TRANSITION",
      `Cannot transition deployment from ${from} to ${to}`,
    );
}
function transition(
  entity,
  to,
  {
    expectedVersion,
    commandId,
    safeMessage = null,
    failureCode = null,
    clock = () => new Date().toISOString(),
  } = {},
) {
  if (commandId && entity.processedCommands?.has(commandId))
    return { deployment: entity, event: null, idempotent: true };
  if (expectedVersion !== entity.stateVersion)
    throw new ControlPlaneError(
      409,
      "DEPLOYMENT_VERSION_CONFLICT",
      "Deployment state changed concurrently",
    );
  const from = entity.currentState;
  assertTransition(from, to);
  const at = clock();
  const next = {
    ...entity,
    currentState: to,
    stateVersion: entity.stateVersion + 1,
    updatedAt: at,
    startedAt: entity.startedAt || (to === "validating" ? at : null),
    completedAt: TERMINAL.has(to) ? at : null,
    failureCode: to === "failed" ? failureCode : null,
    failureMessage: to === "failed" ? safeMessage : null,
    processedCommands: new Set(entity.processedCommands || []),
  };
  if (commandId) next.processedCommands.add(commandId);
  return {
    deployment: next,
    event: {
      eventType: "state.changed",
      state: to,
      safeMessage,
      metadata: { from, commandId },
    },
  };
}
module.exports = { STATES, TERMINAL, ALLOWED, assertTransition, transition };
