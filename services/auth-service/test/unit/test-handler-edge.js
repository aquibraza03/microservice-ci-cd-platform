const http = require("http");
const { handleRequest } = require("../../src/handler");

function makeRequest(handler, path, options) {
  const opts = options || {};
  const method = opts.method || "GET";
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, () => {
      const port = server.address().port;
      const req = http.request(
        { hostname: "127.0.0.1", port, path, method, headers: opts.headers || {} },
        (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            server.close();
            resolve({ statusCode: res.statusCode, headers: res.headers, body, method });
          });
        }
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

describe("Auth Service Handler - Edge Cases", function () {

  describe("Query string handling", function () {
    it("known routes match even with query strings", async function () {
      const res = await makeRequest(handleRequest, "/health?verbose=1");
      res.statusCode.should.equal(200);
      res.headers["content-type"].should.equal("application/json");
      JSON.parse(res.body).should.deep.equal({ status: "ok" });
    });

    it("unknown paths with query strings return 404", async function () {
      const res = await makeRequest(handleRequest, "/?foo=bar");
      res.statusCode.should.equal(404);
      JSON.parse(res.body).error.should.equal("Not Found");
    });
  });

  describe("Trailing slashes", function () {
    it("/health/ is not treated as /health", async function () {
      const res = await makeRequest(handleRequest, "/health/");
      res.statusCode.should.equal(404);
    });

    it("unknown nested paths return 404", async function () {
      const res = await makeRequest(handleRequest, "/unknown/path");
      res.statusCode.should.equal(404);
      JSON.parse(res.body).error.should.equal("Not Found");
    });
  });

  describe("HTTP methods", function () {
    const routes = ["/health", "/ready", "/login", "/env"];

    for (const route of routes) {
      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
        it(`${method} ${route} is rejected with 405`, async function () {
          const res = await makeRequest(handleRequest, route, { method });
          res.statusCode.should.equal(405);
          JSON.parse(res.body).error.should.equal("Method Not Allowed");
        });
      }
    }
  });

  describe("HEAD requests", function () {
    it("HEAD /health returns 200 with empty body", async function () {
      const res = await makeRequest(handleRequest, "/health", { method: "HEAD" });
      res.statusCode.should.equal(200);
      res.body.should.equal("");
    });
  });

  describe("Request headers", function () {
    it("handles requests with custom headers", async function () {
      const res = await makeRequest(handleRequest, "/env", {
        headers: { "X-Trace-Id": "abc123", "Accept": "application/json" }
      });
      res.statusCode.should.equal(200);
      JSON.parse(res.body).should.have.keys("service", "env");
    });
  });

  describe("Security headers", function () {
    const routes = ["/health", "/ready", "/login", "/env"];

    for (const route of routes) {
      it(`sets X-Content-Type-Options: nosniff on ${route}`, async function () {
        const res = await makeRequest(handleRequest, route);
        res.headers["x-content-type-options"].should.equal("nosniff");
      });

      it(`sets X-Frame-Options: DENY on ${route}`, async function () {
        const res = await makeRequest(handleRequest, route);
        res.headers["x-frame-options"].should.equal("DENY");
      });

      it(`sets Cache-Control: no-store on ${route}`, async function () {
        const res = await makeRequest(handleRequest, route);
        res.headers["cache-control"].should.equal("no-store");
      });
    }
  });

  describe("Path traversal and special characters", function () {
    it("handles URL-encoded characters in path safely", async function () {
      const res = await makeRequest(handleRequest, "/health%2Fadmin");
      res.statusCode.should.equal(404);
    });

    it("handles traversal attempts without crashing", async function () {
      const res = await makeRequest(handleRequest, "/../health");
      res.statusCode.should.be.oneOf([200, 404]);
    });
  });

  describe("Concurrent request handling", function () {
    it("serves 20 concurrent requests without errors", async function () {
      const server = http.createServer(handleRequest);
      await new Promise((resolve) => server.listen(0, resolve));
      try {
        const port = server.address().port;
        const requests = Array.from({ length: 20 }, (_, i) => {
          return new Promise((resolve, reject) => {
            const req = http.request(
              { hostname: "127.0.0.1", port, path: i % 2 === 0 ? "/health" : "/ready", method: "GET" },
              (res) => {
                res.resume();
                res.on("end", () => resolve(res.statusCode));
              }
            );
            req.on("error", reject);
            req.end();
          });
        });
        const codes = await Promise.all(requests);
        codes.forEach((code) => code.should.equal(200));
      } finally {
        server.close();
      }
    });
  });
});
