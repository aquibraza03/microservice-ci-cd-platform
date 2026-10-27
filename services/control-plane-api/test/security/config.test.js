const { expect } = require("chai");
const { loadConfig } = require("../../src/config");
const jwks = JSON.stringify({
  keys: [{ kty: "RSA", kid: "one", alg: "RS256", n: "AQAB", e: "AQAB" }],
});
describe("control-plane production configuration", () => {
  it("rejects demo and test auth in production", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "production", AUTH_MODE: "demo" }),
    ).to.throw(/forbidden/);
    expect(() =>
      loadConfig({ NODE_ENV: "production", AUTH_MODE: "test" }),
    ).to.throw(/forbidden/);
  });
  it("requires complete verified-JWT configuration", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "production", AUTH_MODE: "jwt" }),
    ).to.throw(/JWT identity/);
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        AUTH_MODE: "jwt",
        JWT_ISSUER: "https://id.example",
        JWT_AUDIENCE: "api",
        JWT_JWKS: jwks,
        JWT_ALGORITHMS: "HS256",
        DATABASE_URL: "postgres://db",
        CONTROL_PLANE_STORAGE: "postgres",
        CORS_ALLOWED_ORIGINS: "https://app.example",
        SESSION_VALIDATION: "required",
      }),
    ).to.throw(/algorithm/);
  });
  it("requires PostgreSQL, CORS and session validation in production", () => {
    const base = {
      NODE_ENV: "production",
      AUTH_MODE: "jwt",
      JWT_ISSUER: "https://id.example",
      JWT_AUDIENCE: "api",
      JWT_JWKS: jwks,
    };
    expect(() => loadConfig(base)).to.throw(/DATABASE_URL/);
    expect(() =>
      loadConfig({ ...base, DATABASE_URL: "postgres://db" }),
    ).to.throw(/storage/);
    expect(() =>
      loadConfig({
        ...base,
        DATABASE_URL: "postgres://db",
        CONTROL_PLANE_STORAGE: "postgres",
      }),
    ).to.throw(/CORS/);
    expect(() =>
      loadConfig({
        ...base,
        DATABASE_URL: "postgres://db",
        CONTROL_PLANE_STORAGE: "postgres",
        CORS_ALLOWED_ORIGINS: "https://app.example",
      }),
    ).to.throw(/session validation/);
  });
});
