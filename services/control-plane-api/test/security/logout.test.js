const http = require("http");
const { expect } = require("chai");
const { generateKeyPair, exportJWK, SignJWT } = require("jose");
const { createApplication } = require("../../src/server");
const { MemoryRepository } = require("../../src/domain/repositories");
function call(app, path, token) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app.handle);
    server.listen(0, "127.0.0.1", () => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path,
          method: path.includes("logout") ? "POST" : "GET",
          headers: { authorization: `Bearer ${token}` },
        },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () =>
            server.close(() => resolve({ status: res.statusCode, body })),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  });
}
describe("logout and session invalidation", () => {
  it("revokes a tracked session", async () => {
    const pair = await generateKeyPair("RS256");
    const pub = {
      ...(await exportJWK(pair.publicKey)),
      kid: "one",
      alg: "RS256",
    };
    const env = {
      NODE_ENV: "test",
      AUTH_MODE: "jwt",
      JWT_ISSUER: "https://id.example.test",
      JWT_AUDIENCE: "api",
      JWT_JWKS: JSON.stringify({ keys: [pub] }),
      JWT_ALGORITHMS: "RS256",
      SESSION_VALIDATION: "required",
      CONTROL_PLANE_STORAGE: "memory",
    };
    const repo = new MemoryRepository();
    const user = repo.upsertUser({
      subject: "https://id.example.test|github|1",
      email: "a@example.test",
    });
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "one" })
      .setIssuer(env.JWT_ISSUER)
      .setAudience("api")
      .setSubject("github|1")
      .setJti("session-one")
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(pair.privateKey);
    repo.createSession(user.id, "session-one", new Date((now + 300) * 1000));
    const app = createApplication({ env, repository: repo, pool: null });
    expect((await call(app, "/api/v1/me", token)).status).to.equal(200);
    expect((await call(app, "/api/v1/logout", token)).status).to.equal(204);
    expect((await call(app, "/api/v1/me", token)).status).to.equal(401);
    expect(repo.auditEvents.map((e) => e.action)).to.include("auth.logout");
  });
});
