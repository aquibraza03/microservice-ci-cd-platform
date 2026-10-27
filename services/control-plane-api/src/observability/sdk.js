const { NodeSDK } = require("@opentelemetry/sdk-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const { BatchSpanProcessor } = require("@opentelemetry/sdk-trace-base");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const {
  ATTR_SERVICE_NAME,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} = require("@opentelemetry/semantic-conventions");

function initializeTelemetry(config, { exporterFactory } = {}) {
  if (!config.OTEL_TRACES_ENDPOINT)
    return { enabled: false, shutdown: async () => {} };
  try {
    const exporter = exporterFactory
      ? exporterFactory(config)
      : new OTLPTraceExporter({
          url: config.OTEL_TRACES_ENDPOINT,
          timeoutMillis: config.OTEL_EXPORT_TIMEOUT_MS,
        });
    const processor = new BatchSpanProcessor(exporter, {
      maxQueueSize: config.OTEL_MAX_QUEUE_SIZE,
      maxExportBatchSize: Math.min(
        config.OTEL_MAX_EXPORT_BATCH_SIZE,
        config.OTEL_MAX_QUEUE_SIZE,
      ),
      scheduledDelayMillis: config.OTEL_EXPORT_INTERVAL_MS,
      exportTimeoutMillis: config.OTEL_EXPORT_TIMEOUT_MS,
    });
    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.SERVICE_NAME,
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.NODE_ENV,
      }),
      spanProcessors: [processor],
    });
    sdk.start();
    return { enabled: true, shutdown: () => sdk.shutdown() };
  } catch {
    return { enabled: false, shutdown: async () => {} };
  }
}
module.exports = { initializeTelemetry };
