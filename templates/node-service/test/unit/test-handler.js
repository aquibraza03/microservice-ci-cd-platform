const http = require("http")
const { expect } = require("chai")
const { requestHandler } = require("../../src/handler")

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(requestHandler)
    server.listen(0, () => {
      const port = server.address().port
      http.get(`http://127.0.0.1:${port}${url}`, (res) => {
        let body = ""
        res.on("data", (chunk) => { body += chunk })
        res.on("end", () => {
          server.close()
          resolve({ status: res.statusCode, headers: res.headers, body })
        })
      }).on("error", (err) => {
        server.close()
        reject(err)
      })
    })
  })
}

describe("requestHandler", () => {
  it("returns 200 with status ok on /health", async () => {
    const res = await makeRequest("/health")
    expect(res.status).to.equal(200)
    expect(res.headers["content-type"]).to.equal("application/json")
    const body = JSON.parse(res.body)
    expect(body.status).to.equal("ok")
    expect(body.service).to.equal("test-service")
  })

  it("returns 200 with service info on /", async () => {
    const res = await makeRequest("/")
    expect(res.status).to.equal(200)
    expect(res.headers["content-type"]).to.equal("application/json")
    const body = JSON.parse(res.body)
    expect(body.service).to.equal("test-service")
    expect(body.status).to.equal("running")
  })

  it("returns 404 for unknown paths", async () => {
    const res = await makeRequest("/unknown")
    expect(res.status).to.equal(404)
    expect(res.headers["content-type"]).to.equal("application/json")
    const body = JSON.parse(res.body)
    expect(body.error).to.equal("Not Found")
  })

  it("returns 404 for /ready (not defined in node handler)", async () => {
    const res = await makeRequest("/ready")
    expect(res.status).to.equal(404)
  })
})
