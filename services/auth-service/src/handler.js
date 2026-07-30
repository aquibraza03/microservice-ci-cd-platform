function handleRequest(req, res) {
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
    res.end(JSON.stringify({ message: "Auth service login endpoint" }));
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
}

module.exports = { handleRequest };
