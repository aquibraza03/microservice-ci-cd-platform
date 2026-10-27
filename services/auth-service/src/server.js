const http = require("http");
const { handleRequest } = require("./handler");

const PORT = Number(process.env.PORT) || 3000;
const SHUTDOWN_TIMEOUT_MS = 10000;

function createServer(handler) {
  const requestHandler = handler || handleRequest;
  return http.createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    requestHandler(req, res);
  });
}

function handleShutdown(server, options) {
  const { exitOnClose = true, logger = console, timeoutMs = SHUTDOWN_TIMEOUT_MS } = options || {};
  return function onShutdownSignal(signal) {
    logger.log(`${signal} received, shutting down gracefully`);

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, timeoutMs);
    forceExit.unref();

    server.close(() => {
      clearTimeout(forceExit);
      if (exitOnClose) {
        process.exit(0);
      }
    });
  };
}

function startServer(config) {
  const opts = config || {};
  const port = opts.port !== undefined ? opts.port : PORT;
  const server = opts.server || createServer(opts.handler);

  process.once("SIGTERM", handleShutdown(server, opts));
  process.once("SIGINT", handleShutdown(server, opts));

  server.on("error", (err) => {
    console.error(JSON.stringify({
      level: "error",
      message: "Server error",
      error: err.message,
      stack: err.stack
    }));
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(JSON.stringify({
      level: "info",
      message: "Auth service started",
      port
    }));
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createServer, handleShutdown, startServer };
