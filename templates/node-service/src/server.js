const http = require("http")

/*
Configuration from environment variables
Works for:
- Local development
- Docker
- Kubernetes
- Jenkins CI
- GitHub Actions
*/

const SERVICE_NAME = process.env.SERVICE_NAME || "service"
const SERVICE_PORT = parseInt(process.env.SERVICE_PORT || process.env.PORT || "3000", 10)
const SERVICE_HOST = process.env.SERVICE_HOST || "0.0.0.0"

/*
Basic request handler
*/

function requestHandler(req, res) {

  // Health check endpoint (used by Kubernetes / load balancers)
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", service: SERVICE_NAME }))
    return
  }

  // Root endpoint
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      service: SERVICE_NAME,
      status: "running"
    }))
    return
  }

  // Default response
  res.writeHead(404, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "Not Found" }))
}

/*
Create HTTP server
*/

const server = http.createServer(requestHandler)

/*
Start server
*/

server.listen(SERVICE_PORT, SERVICE_HOST, () => {
  console.log(`[${SERVICE_NAME}] service started`)
  console.log(`[${SERVICE_NAME}] listening on ${SERVICE_HOST}:${SERVICE_PORT}`)
})

/*
Graceful shutdown (important for containers)
*/

function shutdown(signal) {
  console.log(`[${SERVICE_NAME}] received ${signal}, shutting down`)

  server.close(() => {
    console.log(`[${SERVICE_NAME}] server stopped`)
    process.exit(0)
  })
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

/*
Unexpected error handling
*/

process.on("uncaughtException", (err) => {
  console.error(`[${SERVICE_NAME}] uncaught exception`, err)
})

process.on("unhandledRejection", (err) => {
  console.error(`[${SERVICE_NAME}] unhandled rejection`, err)
})
