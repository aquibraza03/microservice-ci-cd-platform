const { PlatformMetrics } = require("./metrics");
const { TraceManager } = require("./tracing");
const { OperationalLogger } = require("./logger");
function createObservability(config = {}, options = {}) {
  return {
    metrics: options.metrics || new PlatformMetrics(),
    traces:
      options.traces || new TraceManager({ serviceName: config.SERVICE_NAME }),
    logger:
      options.logger ||
      new OperationalLogger({
        service: config.SERVICE_NAME,
        environment: config.NODE_ENV,
        sink: options.logSink,
      }),
  };
}
module.exports = { createObservability };
