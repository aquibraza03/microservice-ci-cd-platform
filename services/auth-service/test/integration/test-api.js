const http = require("http");
const { handleRequest } = require("../../src/handler");

describe("Auth Service Integration Tests", function () {
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

  it("GET /health returns 200 with status ok", async function () {
    const res = await request("GET", "/health");
    const body = JSON.parse(res.body);
    res.statusCode.should.equal(200);
    body.should.have.property("status", "ok");
  });

  it("GET /ready returns 200 with ready true", async function () {
    const res = await request("GET", "/ready");
    const body = JSON.parse(res.body);
    res.statusCode.should.equal(200);
    body.should.have.property("ready", true);
  });

  it("GET /login returns 200 with login message", async function () {
    const res = await request("GET", "/login");
    const body = JSON.parse(res.body);
    res.statusCode.should.equal(200);
    body.should.have.property("message");
    body.message.should.include("login");
  });

  it("GET /env returns 200 with service and env", async function () {
    const res = await request("GET", "/env");
    const body = JSON.parse(res.body);
    res.statusCode.should.equal(200);
    body.should.have.all.keys("service", "env");
  });

  it("GET /unknown returns 200 with text", async function () {
    const res = await request("GET", "/unknown");
    res.statusCode.should.equal(200);
    res.headers["content-type"].should.equal("text/plain");
    res.body.should.equal("Auth service running");
  });

  it("POST /health works (no method restriction)", async function () {
    const res = await request("POST", "/health");
    const body = JSON.parse(res.body);
    res.statusCode.should.equal(200);
    body.should.have.property("status", "ok");
  });
});
