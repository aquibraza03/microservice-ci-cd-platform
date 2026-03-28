const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url === "/ready") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ready: true }));
    return;
  }

  if (req.url === "/login") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      message: "Auth service login endpoint"
    }));
    return;
  }

  if (req.url === "/env") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      service: process.env.SERVICE_NAME || "auth-service",
      env: process.env.NODE_ENV || "dev"
    }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Auth service running");
});

// Graceful shutdown
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
