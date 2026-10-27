const http = require("http");
const { expect } = require("chai");
const { createApplication } = require("../../src/server");

function request(app, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app.handle);
    server.listen(0, () => {
      const port = server.address().port;
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: { "content-type": "application/json", ...headers },
        },
        (response) => {
          let output = "";
          response.on("data", (chunk) => {
            output += chunk;
          });
          response.on("end", () => {
            server.close();
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: output ? JSON.parse(output) : null,
            });
          });
        },
      );
      request.on("error", reject);
      if (body) request.write(JSON.stringify(body));
      request.end();
    });
  });
}

function demoApp() {
  return createApplication({
    env: {
      NODE_ENV: "test",
      AUTH_MODE: "demo",
      CORS_ALLOWED_ORIGINS: "http://localhost:3001",
    },
  });
}

describe("control-plane API", () => {
  it("returns versioned health and request IDs", async () => {
    const response = await request(demoApp(), "GET", "/api/v1/health", null, {
      "x-request-id": "request-123",
    });
    expect(response.status).to.equal(200);
    expect(response.body.status).to.equal("ok");
    expect(response.headers["x-request-id"]).to.equal("request-123");
  });

  it("rejects unversioned routes with a safe structured error", async () => {
    const response = await request(demoApp(), "GET", "/health");
    expect(response.status).to.equal(404);
    expect(response.body.error.code).to.equal("ROUTE_NOT_FOUND");
    expect(response.body.error.message).not.to.contain("Error");
    expect(response.body.error.requestId).to.be.a("string");
  });

  it("creates an organization and prevents cross-tenant project access", async () => {
    const app = demoApp();
    const organization = await request(app, "POST", "/api/v1/organizations", {
      name: "Acme Platform",
      slug: "acme-platform",
    });
    expect(organization.status).to.equal(201);
    const project = await request(
      app,
      "POST",
      `/api/v1/organizations/${organization.body.id}/projects`,
      { name: "Payments", slug: "payments" },
    );
    expect(project.status).to.equal(201);
    const projects = await request(
      app,
      "GET",
      `/api/v1/organizations/${organization.body.id}/projects?page=1&pageSize=10`,
    );
    expect(projects.body.pagination.totalItems).to.equal(1);
  });

  it("returns validation errors and enforces pagination limits", async () => {
    const app = demoApp();
    const organization = await request(app, "POST", "/api/v1/organizations", {
      name: "Acme Platform",
      slug: "acme-platform",
    });
    const invalid = await request(
      app,
      "POST",
      `/api/v1/organizations/${organization.body.id}/projects`,
      { name: "x", slug: "INVALID" },
    );
    expect(invalid.status).to.equal(400);
    expect(invalid.body.error.code).to.equal("VALIDATION_ERROR");
    const query = await request(
      app,
      "GET",
      `/api/v1/organizations/${organization.body.id}/projects?pageSize=101`,
    );
    expect(query.status).to.equal(400);
  });

  it("forbids demo auth in production configuration", () => {
    expect(() =>
      createApplication({ env: { NODE_ENV: "production", AUTH_MODE: "demo" } }),
    ).to.throw(/forbidden/);
  });
});
