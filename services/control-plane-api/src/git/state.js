const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
function equal(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
class InstallationStateStore {
  constructor({ ttlMs = 600000, clock = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.states = new Map();
  }
  create(userId, organizationId) {
    const state = crypto.randomBytes(32).toString("base64url");
    this.states.set(state, {
      userId,
      organizationId,
      expiresAt: this.clock() + this.ttlMs,
    });
    return state;
  }
  consume(candidate, userId, organizationId) {
    const key = [...this.states.keys()].find((item) =>
      equal(item, candidate || ""),
    );
    const value = key && this.states.get(key);
    if (key) this.states.delete(key);
    if (
      !value ||
      value.expiresAt < this.clock() ||
      value.userId !== userId ||
      value.organizationId !== organizationId
    )
      throw new ControlPlaneError(
        400,
        "INSTALLATION_STATE_INVALID",
        "Installation state is invalid",
      );
    return value;
  }
}
module.exports = { InstallationStateStore };
