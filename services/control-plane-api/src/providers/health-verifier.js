const { ControlPlaneError } = require("../errors");
class HttpHealthVerifier {
  constructor({
    fetchImpl = global.fetch,
    timeoutMs = 120000,
    intervalMs = 2000,
  } = {}) {
    Object.assign(this, { fetch: fetchImpl, timeoutMs, intervalMs });
  }
  async verify({
    endpoint,
    readinessPath = "/ready",
    healthPath = "/health",
    signal,
  }) {
    if (
      !/^https?:\/\/(?:127\.0\.0\.1|localhost|[a-z0-9.-]+)(?::\d+)?(?:\/|$)/i.test(
        endpoint || "",
      )
    )
      throw new ControlPlaneError(
        500,
        "ENDPOINT_INVALID",
        "Deployment endpoint is invalid",
      );
    await this._wait(
      new URL(readinessPath, endpoint),
      "READINESS_FAILED",
      signal,
    );
    await this._wait(new URL(healthPath, endpoint), "LIVENESS_FAILED", signal);
    return { healthy: true, endpoint, readiness: "passed", liveness: "passed" };
  }
  async _wait(url, code, signal) {
    const deadline = Date.now() + this.timeoutMs;
    let last;
    while (Date.now() < deadline) {
      if (signal?.aborted)
        throw new ControlPlaneError(
          499,
          "DEPLOYMENT_CANCELLED",
          "Deployment cancelled",
        );
      try {
        const response = await this.fetch(url, { signal, redirect: "error" });
        if (response.ok) return;
      } catch (error) {
        last = error;
      }
      await new Promise((resolve) => setTimeout(resolve, this.intervalMs));
    }
    throw new ControlPlaneError(
      504,
      code,
      code === "READINESS_FAILED"
        ? "Readiness verification failed"
        : "Liveness verification failed",
      last?.message,
    );
  }
}
class TestHealthVerifier {
  constructor({ fail = null } = {}) {
    this.fail = fail;
  }
  async verify({ endpoint }) {
    if (this.fail === "readiness")
      throw new ControlPlaneError(
        504,
        "READINESS_FAILED",
        "Readiness verification failed",
      );
    if (this.fail === "liveness")
      throw new ControlPlaneError(
        504,
        "LIVENESS_FAILED",
        "Liveness verification failed",
      );
    return { healthy: true, endpoint, readiness: "passed", liveness: "passed" };
  }
}
module.exports = { HttpHealthVerifier, TestHealthVerifier };
