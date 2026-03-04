const http = require("http");

const PORT = process.env.PORT || 3000;
const startTime = Date.now();

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/plain");

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    return res.end("ok");
  }

  if (req.method === "GET" && req.url === "/ready") {
    res.writeHead(200);
    return res.end("ready");
  }

  if (req.method === "GET" && req.url === "/info") {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    res.writeHead(200);
    return res.end(`uptime:${uptime}s`);
  }

  res.writeHead(200);
  res.end("platform smoke test running");
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});

server.listen(PORT, () => {
  console.log(`Smoke test running on port ${PORT}`);
});

