const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url === "/login") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      message: "Auth service login endpoint"
    }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Auth service running");

});

// Graceful shutdown for containers
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => process.exit(0));
});

server.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
