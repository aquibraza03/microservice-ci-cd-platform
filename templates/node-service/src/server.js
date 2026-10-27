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

const { requestHandler, shutdown, setServer } = require("./handler")

/*
Create HTTP server
*/

const server = http.createServer(requestHandler)
setServer(server)

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
