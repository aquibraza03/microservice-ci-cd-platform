const crypto = require("crypto");
const {
  trace,
  context,
  propagation,
  SpanStatusCode,
  ROOT_CONTEXT,
} = require("@opentelemetry/api");

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const FORBIDDEN =
  /(authorization|token|secret|password|credential|kubeconfig|private.?key|environment.?value|request.?body)/i;
// eslint-disable-next-line no-control-regex -- trace attributes must reject control characters
const CONTROL = /[\r\n\t\u0000-\u001f\u007f]+/g;

function safeAttributes(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN.test(key)) continue;
    if (["string", "number", "boolean"].includes(typeof value)) {
      const raw = String(value);
      output[key] = raw.replace(CONTROL, " ").slice(0, 256);
    }
  }
  return output;
}
function parseTraceparent(value) {
  const match = TRACEPARENT.exec(String(value || "").toLowerCase());
  return match
    ? {
        traceId: match[1],
        spanId: match[2],
        traceFlags: parseInt(match[3], 16) & 1,
      }
    : null;
}
function newContext(sampled = true) {
  return {
    traceId: crypto.randomBytes(16).toString("hex"),
    spanId: crypto.randomBytes(8).toString("hex"),
    traceFlags: sampled ? 1 : 0,
  };
}
function formatTraceparent(value) {
  return `00-${value.traceId}-${value.spanId}-${value.traceFlags ? "01" : "00"}`;
}
function samplingDecision({
  route = "",
  result = "success",
  durationSeconds = 0,
  securitySensitive = false,
  workflowFailed = false,
  random = Math.random,
} = {}) {
  if (/\/(health|ready)$/.test(route)) return random() < 0.001;
  if (
    result === "error" ||
    durationSeconds >= 2 ||
    securitySensitive ||
    workflowFailed
  )
    return true;
  return random() < 0.1;
}

class TraceManager {
  constructor({
    serviceName = "control-plane-api",
    tracer = trace.getTracer(serviceName),
  } = {}) {
    this.tracer = tracer;
    this.segments = [];
  }
  accept(headers = {}) {
    return parseTraceparent(headers.traceparent) || newContext(true);
  }
  queueMetadata(segment, workflowId) {
    return {
      traceparent: formatTraceparent(segment),
      workflowId: String(workflowId || "").slice(0, 128),
    };
  }
  fromQueue(metadata = {}) {
    return {
      parent: parseTraceparent(metadata.traceparent),
      workflowId: String(metadata.workflowId || "").slice(0, 128),
    };
  }
  async segment(
    name,
    {
      parent,
      links = [],
      attributes = {},
      workflowId = null,
      attempt = 1,
    } = {},
    fn,
  ) {
    const safe = safeAttributes({
      ...attributes,
      "workflow.id": workflowId,
      "job.attempt": attempt,
    });
    const linkData = links.filter(Boolean).map((item) => ({
      context: { ...item, isRemote: true },
      attributes: { "link.type": "workflow" },
    }));
    const span = this.tracer.startSpan(
      name,
      { attributes: safe, links: linkData },
      parent
        ? trace.setSpanContext(ROOT_CONTEXT, { ...parent, isRemote: true })
        : context.active(),
    );
    const segment = {
      name,
      workflowId,
      attempt,
      parentTraceId: parent?.traceId || null,
      links: links.map((item) => item?.traceId).filter(Boolean),
      startedAt: Date.now(),
    };
    this.segments.push(segment);
    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        fn,
      );
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: String(error.code || "operation_failed").slice(0, 120),
      });
      throw error;
    } finally {
      segment.endedAt = Date.now();
      span.end();
    }
  }
  inject(headers = {}) {
    propagation.inject(context.active(), headers);
    return headers;
  }
}

module.exports = {
  TraceManager,
  formatTraceparent,
  newContext,
  parseTraceparent,
  safeAttributes,
  samplingDecision,
};
