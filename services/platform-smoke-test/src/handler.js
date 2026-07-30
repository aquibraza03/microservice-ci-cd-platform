const startTime = Date.now();

function handleRequest(req, res) {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.url === "/ready") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ready");
    return;
  }

  if (req.url === "/info") {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`uptime:${uptime}s`);
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("platform smoke test running");
}

module.exports = { handleRequest, startTime };
