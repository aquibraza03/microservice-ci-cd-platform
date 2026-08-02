function handleRequest(req, res) {
  const securityHeaders = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };

  if (req.url === "/health") {
    res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, securityHeaders));
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url === "/ready") {
    res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, securityHeaders));
    res.end(JSON.stringify({ ready: true }));
    return;
  }

  if (req.url === "/login") {
    res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, securityHeaders));
    res.end(JSON.stringify({ message: "Auth service login endpoint" }));
    return;
  }

  if (req.url === "/env") {
    res.writeHead(200, Object.assign({ "Content-Type": "application/json" }, securityHeaders));
    res.end(JSON.stringify({
      service: process.env.SERVICE_NAME || "auth-service",
      env: process.env.NODE_ENV || "dev"
    }));
    return;
  }

  res.writeHead(200, Object.assign({ "Content-Type": "text/plain" }, securityHeaders));
  res.end("Auth service running");
}

module.exports = { handleRequest };
