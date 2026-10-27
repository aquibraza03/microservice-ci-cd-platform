const http = require("http");
const { expect } = require("chai");
const { generateKeyPair, exportJWK } = require("jose");
const { createApplication } = require("../../src/server");
function call(app, path, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app.handle);
    server.listen(0, "127.0.0.1", () => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path,
          method,
          headers,
        },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () =>
            server.close(() =>
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: body ? JSON.parse(body) : null,
              }),
            ),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  });
}
describe("GitHub OAuth platform login", () => {
  it("validates state, provisions a user and issues a usable tracked token", async () => {
    const pair = await generateKeyPair("RS256");
    const pub = {
      ...(await exportJWK(pair.publicKey)),
      kid: "session-1",
      alg: "RS256",
      use: "sig",
    };
    const priv = {
      ...(await exportJWK(pair.privateKey)),
      kid: "session-1",
      alg: "RS256",
      use: "sig",
    };
    const env = {
      NODE_ENV: "test",
      AUTH_MODE: "github",
      CONTROL_PLANE_STORAGE: "memory",
      JWT_ISSUER: "https://platform.example.test",
      JWT_AUDIENCE: "control-plane",
      JWT_ALGORITHMS: "RS256",
      JWT_JWKS: JSON.stringify({ keys: [pub] }),
      JWT_SIGNING_JWK: JSON.stringify(priv),
      SESSION_VALIDATION: "required",
      GITHUB_OAUTH_CLIENT_ID: "client",
      GITHUB_OAUTH_CLIENT_SECRET: "test-secret-value-only",
      GITHUB_OAUTH_CALLBACK_URL:
        "https://platform.example.test/api/v1/auth/github/callback",
    };
    const githubClient = {
      authorizationUrl: ({ state }) =>
        `https://github.example/authorize?state=${state}`,
      exchange: async () => ({
        provider: "github",
        providerSubject: "42",
        email: "octo@example.test",
        displayName: "Octo",
        avatarUrl: null,
      }),
    };
    const app = createApplication({ env, pool: null, githubClient });
    const login = await call(app, "/api/v1/auth/github/login");
    expect(login.status).to.equal(302);
    const state = new URL(login.headers.location).searchParams.get("state");
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const callback = await call(
      app,
      `/api/v1/auth/github/callback?code=fixture&state=${encodeURIComponent(state)}`,
      { headers: { cookie } },
    );
    expect(callback.status).to.equal(200);
    expect(callback.body.user.email).to.equal("octo@example.test");
    const me = await call(app, "/api/v1/me", {
      headers: { authorization: `Bearer ${callback.body.accessToken}` },
    });
    expect(me.status).to.equal(200);
    expect(me.body.externalSubject).to.equal(
      "https://platform.example.test|42",
    );
    expect(app.repository.auditEvents.map((event) => event.action)).to.include(
      "auth.login",
    );
  });
});
