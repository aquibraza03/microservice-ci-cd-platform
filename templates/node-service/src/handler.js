const SERVICE_NAME = process.env.SERVICE_NAME || "service"

let _server = null

function setServer(server) {
  _server = server
}

function requestHandler(req, res) {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", service: SERVICE_NAME }))
    return
  }

  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      service: SERVICE_NAME,
      status: "running"
    }))
    return
  }

  res.writeHead(404, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "Not Found" }))
}

function shutdown(signal) {
  console.log(`received ${signal}, shutting down`)
  if (_server) {
    _server.close(() => {
      process.exit(0)
    })
  }
}

module.exports = { requestHandler, shutdown, setServer }
