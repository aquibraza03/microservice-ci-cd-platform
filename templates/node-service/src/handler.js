const SERVICE_NAME = process.env.SERVICE_NAME || "service"

let _server = null

const SHUTDOWN_TIMEOUT_MS = 10000

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
  }
}

function setServer(server) {
  _server = server
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, Object.assign({ "Content-Type": "application/json" }, securityHeaders()))
  res.end(JSON.stringify(body))
}

function requestHandler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method Not Allowed", allowedMethods: ["GET"] })
    return
  }

  if (req.url === "/health") {
    sendJson(res, 200, { status: "ok", service: SERVICE_NAME })
    return
  }

  if (req.url === "/") {
    sendJson(res, 200, {
      service: SERVICE_NAME,
      status: "running"
    })
    return
  }

  sendJson(res, 404, { error: "Not Found" })
}

function shutdown(signal) {
  console.log(`received ${signal}, shutting down`)
  if (_server) {
    const forceExit = setTimeout(() => {
      console.error("graceful shutdown timed out, forcing exit")
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)
    forceExit.unref()

    _server.close(() => {
      clearTimeout(forceExit)
      process.exit(0)
    })
  }
}

module.exports = { requestHandler, shutdown, setServer }
