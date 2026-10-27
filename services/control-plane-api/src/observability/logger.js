const crypto = require("crypto");
// eslint-disable-next-line no-control-regex -- log-forging controls are intentionally removed
const CONTROL = /[\r\n\t\u0000-\u001f\u007f]+/g;
const SECRET_KEY =
  /(authorization|token|secret|password|credential|private.?key|kubeconfig|cookie|database.?url|redis.?url)/i;
const SECRET_VALUE =
  /(bearer\s+[a-z0-9._-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----|(?:postgres|redis):\/\/[^\s]+)/gi;
function clean(value, max = 512) {
  return String(value ?? "")
    .replace(CONTROL, " ")
    .replace(SECRET_VALUE, "[REDACTED]")
    .slice(0, max);
}
function redact(input, depth = 0) {
  if (depth > 6) return "[DEPTH_LIMIT]";
  if (input === null || typeof input === "boolean" || typeof input === "number")
    return input;
  if (typeof input === "string") return clean(input);
  if (Array.isArray(input))
    return input.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof input !== "object") return clean(input);
  return Object.fromEntries(
    Object.entries(input)
      .slice(0, 50)
      .map(([key, value]) => [
        clean(key, 80),
        SECRET_KEY.test(key) ? "[REDACTED]" : redact(value, depth + 1),
      ]),
  );
}
class OperationalLogger {
  constructor({
    service = "control-plane-api",
    environment = "development",
    sink = console.log,
  } = {}) {
    this.service = service;
    this.environment = environment;
    this.sink = sink;
  }
  log(severity, operation, fields = {}) {
    const safe = redact(fields);
    const event = {
      timestamp: new Date().toISOString(),
      severity,
      service: this.service,
      environment: this.environment,
      operation: clean(operation, 120),
      requestId: safe.requestId || null,
      traceId: safe.traceId || null,
      workflowId: safe.workflowId || null,
      jobId: safe.jobId || null,
      deploymentId: safe.deploymentId || null,
      stage: safe.stage || null,
      result: safe.result || null,
      errorCategory: safe.errorCategory || null,
      fields: safe,
    };
    this.sink(JSON.stringify(event));
    return event;
  }
}
function metricsTokenMatches(expected, supplied) {
  if (!expected || !supplied) return false;
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(String(supplied)).digest();
  return crypto.timingSafeEqual(a, b);
}
module.exports = { OperationalLogger, clean, redact, metricsTokenMatches };
