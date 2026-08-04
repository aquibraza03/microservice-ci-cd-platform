const http = require("http");
const { handleRequest } = require("../../src/handler");

function createPromiseRequest(handler, method, url) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, () => {
      const port = server.address().port;
      const options = {
        hostname: "127.0.0.1",
        port,
        path: url,
        method
      };
      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          server.close();
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      });
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

describe("Auth Service Handler", function () {

  describe("GET /health", function () {
    it("should return 200 with {status: 'ok'}", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/health");
      const body = JSON.parse(res.body);
      res.statusCode.should.equal(200);
      body.should.deep.equal({ status: "ok" });
    });
  });

  describe("GET /ready", function () {
    it("should return 200 with {ready: true}", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/ready");
      const body = JSON.parse(res.body);
      res.statusCode.should.equal(200);
      body.should.deep.equal({ ready: true });
    });
  });

  describe("GET /login", function () {
    it("should return 200 with login message", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/login");
      const body = JSON.parse(res.body);
      res.statusCode.should.equal(200);
      body.should.deep.equal({ message: "Auth service login endpoint" });
    });
  });

  describe("GET /env", function () {
    it("should return service name and env from env vars", async function () {
      process.env.SERVICE_NAME = "test-auth";
      process.env.NODE_ENV = "testing";
      const res = await createPromiseRequest(handleRequest, "GET", "/env");
      const body = JSON.parse(res.body);
      res.statusCode.should.equal(200);
      body.should.deep.equal({ service: "test-auth", env: "testing" });
      delete process.env.SERVICE_NAME;
      delete process.env.NODE_ENV;
    });

    it("should use defaults when env vars not set", async function () {
      delete process.env.SERVICE_NAME;
      delete process.env.NODE_ENV;
      const res = await createPromiseRequest(handleRequest, "GET", "/env");
      const body = JSON.parse(res.body);
      res.statusCode.should.equal(200);
      body.should.deep.equal({ service: "auth-service", env: "dev" });
    });
  });

  describe("Method restriction", function () {
    it("should reject non-GET methods with 405", async function () {
      const res = await createPromiseRequest(handleRequest, "POST", "/health");
      const body = JSON.parse(res.body);
      res.statusCode.should.equal(405);
      body.error.should.equal("Method Not Allowed");
    });

    it("should include security headers on responses", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/health");
      res.headers["x-content-type-options"].should.equal("nosniff");
      res.headers["x-frame-options"].should.equal("DENY");
      res.headers["cache-control"].should.equal("no-store");
    });
  });

  describe("Unknown URL", function () {
    it("should return 404 for unknown routes", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/unknown");
      const body = JSON.parse(res.body);
      res.statusCode.should.equal(404);
      body.error.should.equal("Not Found");
    });
  });

  describe("Content-Type headers", function () {
    it("should return application/json for JSON routes", async function () {
      const routes = ["/health", "/ready", "/login", "/env"];
      for (const route of routes) {
        const res = await createPromiseRequest(handleRequest, "GET", route);
        res.headers["content-type"].should.equal("application/json");
      }
    });
  });
});
