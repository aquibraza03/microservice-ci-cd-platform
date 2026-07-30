const http = require("http");
const { handleRequest } = require("../../src/handler");

describe("Auth Service Contract Tests", function () {
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
      const options = { hostname: "127.0.0.1", port, path, method };
      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      });
      req.on("error", reject);
      req.end();
    });
  }

  describe("GET /health response schema", function () {
    it("should return object with status field of type string", async function () {
      const res = await request("GET", "/health");
      const body = JSON.parse(res.body);
      body.should.be.an("object");
      body.should.have.property("status").that.is.a("string");
      body.should.deep.equal({ status: "ok" });
    });
  });

  describe("GET /ready response schema", function () {
    it("should return object with ready field of type boolean", async function () {
      const res = await request("GET", "/ready");
      const body = JSON.parse(res.body);
      body.should.be.an("object");
      body.should.have.property("ready").that.is.a("boolean");
      body.should.deep.equal({ ready: true });
    });
  });

  describe("GET /login response schema", function () {
    it("should return object with message field of type string", async function () {
      const res = await request("GET", "/login");
      const body = JSON.parse(res.body);
      body.should.be.an("object");
      body.should.have.property("message").that.is.a("string");
      body.message.should.equal("Auth service login endpoint");
    });
  });

  describe("GET /env response schema", function () {
    it("should return object with service and env string fields", async function () {
      const res = await request("GET", "/env");
      const body = JSON.parse(res.body);
      body.should.be.an("object");
      body.should.have.all.keys("service", "env");
      body.service.should.be.a("string");
      body.env.should.be.a("string");
    });
  });

  describe("Default route response schema", function () {
    it("should return plain text string", async function () {
      const res = await request("GET", "/");
      res.headers["content-type"].should.equal("text/plain");
      res.body.should.be.a("string");
      res.body.should.equal("Auth service running");
    });
  });

  describe("Content-Type contract", function () {
    it("all JSON routes should have application/json content-type", async function () {
      const jsonRoutes = ["/health", "/ready", "/login", "/env"];
      for (const route of jsonRoutes) {
        const res = await request("GET", route);
        res.headers["content-type"].should.equal("application/json");
      }
    });

    it("default route should have text/plain content-type", async function () {
      const res = await request("GET", "/random");
      res.headers["content-type"].should.equal("text/plain");
    });
  });

  describe("Status code contract", function () {
    it("all routes should return 200", async function () {
      const routes = ["/health", "/ready", "/login", "/env", "/", "/random", "/nonexistent"];
      for (const route of routes) {
        const res = await request("GET", route);
        res.statusCode.should.equal(200);
      }
    });
  });
});
