const http = require("http");
const { handleRequest } = require("./handler");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  handleRequest(req, res);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => process.exit(0));
});

server.listen(PORT, () => {
  console.log(JSON.stringify({
    level: "info",
    message: "Auth service started",
    port: PORT
  }));
});

module.exports = { server };
