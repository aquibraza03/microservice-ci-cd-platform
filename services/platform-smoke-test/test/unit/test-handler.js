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

describe("Platform Smoke Test Handler", function () {

  describe("GET /health", function () {
    it("should return 200 with 'ok'", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/health");
      res.statusCode.should.equal(200);
      res.headers["content-type"].should.equal("text/plain");
      res.body.should.equal("ok");
    });
  });

  describe("GET /ready", function () {
    it("should return 200 with 'ready'", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/ready");
      res.statusCode.should.equal(200);
      res.headers["content-type"].should.equal("text/plain");
      res.body.should.equal("ready");
    });
  });

  describe("GET /info", function () {
    it("should return 200 with uptime string starting with 'uptime:'", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/info");
      res.statusCode.should.equal(200);
      res.headers["content-type"].should.equal("text/plain");
      res.body.should.match(/^uptime:\d+s$/);
    });

    it("should return valid number format in uptime", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/info");
      const seconds = parseInt(res.body.replace("uptime:", "").replace("s", ""), 10);
      seconds.should.be.a("number");
      seconds.should.be.at.least(0);
    });
  });

  describe("Default route", function () {
    it("should return 200 with 'platform smoke test running'", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/");
      res.statusCode.should.equal(200);
      res.headers["content-type"].should.equal("text/plain");
      res.body.should.equal("platform smoke test running");
    });
  });

  describe("POST to /health", function () {
    it("should return 200 (no method restriction)", async function () {
      const res = await createPromiseRequest(handleRequest, "POST", "/health");
      res.statusCode.should.equal(200);
      res.headers["content-type"].should.equal("text/plain");
      res.body.should.equal("ok");
    });
  });

  describe("Unknown URL", function () {
    it("should return 200 with default response", async function () {
      const res = await createPromiseRequest(handleRequest, "GET", "/unknown");
      res.statusCode.should.equal(200);
      res.headers["content-type"].should.equal("text/plain");
      res.body.should.equal("platform smoke test running");
    });
  });

  describe("Content-Type headers", function () {
    it("should return text/plain for all routes", async function () {
      const routes = ["/health", "/ready", "/info", "/", "/unknown"];
      for (const route of routes) {
        const res = await createPromiseRequest(handleRequest, "GET", route);
        res.headers["content-type"].should.equal("text/plain");
      }
    });
  });
});
