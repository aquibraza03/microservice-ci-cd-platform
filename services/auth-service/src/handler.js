function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"
  };
}

function getPathname(req) {
  const url = new URL(req.url, "http://localhost");
  return url.pathname;
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, Object.assign({ "Content-Type": "application/json" }, securityHeaders()));
  res.end(JSON.stringify(body));
}

function handleRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method Not Allowed", allowedMethods: ["GET", "HEAD"] });
    return;
  }

  const pathname = getPathname(req);

  if (pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (pathname === "/ready") {
    sendJson(res, 200, { ready: true });
    return;
  }

  if (pathname === "/login") {
    sendJson(res, 200, { message: "Auth service login endpoint" });
    return;
  }

  if (pathname === "/env") {
    sendJson(res, 200, {
      service: process.env.SERVICE_NAME || "auth-service",
      env: process.env.NODE_ENV || "dev"
    });
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
}

module.exports = { handleRequest };
