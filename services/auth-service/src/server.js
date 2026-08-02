const http = require("http");
const { handleRequest } = require("./handler");

const PORT = process.env.PORT || 3000;

function createServer(handler) {
  const requestHandler = handler || handleRequest;
  return http.createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    requestHandler(req, res);
  });
}

function handleShutdown(server, options) {
  const { exitOnClose = true, logger = console } = options || {};
  return function onShutdownSignal() {
    logger.log("SIGTERM received, shutting down gracefully");
    server.close(() => {
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
