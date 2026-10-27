const http = require("http");
const { expect } = require("chai");
const { createApplication } = require("../../src/server");

describe("control-plane HTTP integration", () => {
  let server;
  let port;

  before((done) => {
    const app = createApplication({
      env: {
        NODE_ENV: "test",
        AUTH_MODE: "demo",
        CORS_ALLOWED_ORIGINS: "http://frontend.test",
      },
    });
    server = http.createServer(app.handle);
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      done();
    });
  });
  after((done) => server.close(done));

  it("serves versioned health and CORS only for configured origins", (done) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/v1/health",
        headers: { origin: "http://frontend.test" },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          expect(response.statusCode).to.equal(200);
          expect(response.headers["access-control-allow-origin"]).to.equal(
            "http://frontend.test",
          );
          expect(JSON.parse(body).status).to.equal("ok");
          done();
        });
      },
    );
    request.on("error", done);
    request.end();
  });

  it("protects the Prometheus endpoint and exports collected signals", async () => {
    const request = (headers = {}) =>
      new Promise((resolve, reject) => {
        http
          .get(
            {
              hostname: "127.0.0.1",
              port,
              path: "/api/v1/internal/metrics",
              headers,
            },
            (response) => {
              let body = "";
              response.on("data", (chunk) => (body += chunk));
              response.on("end", () =>
                resolve({ status: response.statusCode, body }),
              );
            },
          )
          .on("error", reject);
      });
    expect((await request()).status).to.equal(404);
    const allowed = await request({
      authorization: "Bearer local-development-metrics-token",
    });
    expect(allowed.status).to.equal(200);
    expect(allowed.body).to.include("platform_http_requests_total");
    expect(allowed.body).not.to.include("organizationId");
  });
});
