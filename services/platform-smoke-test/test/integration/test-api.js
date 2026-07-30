const http = require("http");
const { handleRequest } = require("../../src/handler");

describe("Platform Smoke Test Integration", function () {
  let server;
  let port;

  before(function (done) {
    server = http.createServer(handleRequest);
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  after(function (done) {
    server.close(done);
  });

  function request(method, path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "127.0.0.1",
        port,
        path,
        method
      };
      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  it("GET /health returns 200 with 'ok'", async function () {
    const res = await request("GET", "/health");
    res.statusCode.should.equal(200);
    res.body.should.equal("ok");
  });

  it("GET /ready returns 200 with 'ready'", async function () {
    const res = await request("GET", "/ready");
    res.statusCode.should.equal(200);
    res.body.should.equal("ready");
  });

  it("GET /info returns 200 with uptime string", async function () {
    const res = await request("GET", "/info");
    res.statusCode.should.equal(200);
    res.body.should.match(/^uptime:\d+s$/);
  });

  it("GET /unknown returns 200 with default text", async function () {
    const res = await request("GET", "/unknown");
    res.statusCode.should.equal(200);
    res.headers["content-type"].should.equal("text/plain");
    res.body.should.equal("platform smoke test running");
  });

  it("POST /health works (no method restriction)", async function () {
    const res = await request("POST", "/health");
    res.statusCode.should.equal(200);
    res.body.should.equal("ok");
  });

  it("all endpoints return text/plain content-type", async function () {
    const endpoints = ["/health", "/ready", "/info", "/", "/unknown"];
    for (const ep of endpoints) {
      const res = await request("GET", ep);
      res.headers["content-type"].should.equal("text/plain");
    }
  });
});
