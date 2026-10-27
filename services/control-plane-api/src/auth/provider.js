const crypto = require("crypto");
const { createLocalJWKSet, jwtVerify } = require("jose");
const { ControlPlaneError } = require("../errors");

function authError() {
  return new ControlPlaneError(
    401,
    "INVALID_ACCESS_TOKEN",
    "Access token is invalid",
  );
}

function parseBearer(header) {
  if (!header)
    throw new ControlPlaneError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication is required",
    );
  const match = /^Bearer ([^\s]+)$/.exec(header);
  if (!match)
    throw new ControlPlaneError(
      401,
      "MALFORMED_AUTHORIZATION",
      "Authorization header is malformed",
    );
  return match[1];
}

function parseJwks(value) {
  try {
    const jwks = typeof value === "string" ? JSON.parse(value) : value;
    if (!jwks || !Array.isArray(jwks.keys) || jwks.keys.length === 0)
      throw new Error("empty");
    const seen = new Set();
    for (const key of jwks.keys) {
      if (!key.kid || seen.has(key.kid))
        throw new Error("every key needs a unique kid");
      seen.add(key.kid);
    }
    return jwks;
  } catch {
    throw new Error("JWT_JWKS must be a valid JWKS with unique key IDs");
  }
}

class DemoIdentityProvider {
  constructor(config) {
    this.config = config;
  }
  async authenticate() {
    if (this.config.NODE_ENV === "production")
      throw new Error("Demo identity provider cannot run in production");
    return {
      subject: "demo-user",
      provider: "demo",
      email: "demo@example.test",
      displayName: "Demo User",
      sessionId: null,
    };
  }
}

class TestIdentityProvider {
  constructor(identity, config) {
    if (config.NODE_ENV !== "test")
      throw new Error("Test identity provider is test-only");
    this.identity = identity;
  }
  async authenticate() {
    return this.identity;
  }
}

class JwtIdentityProvider {
  constructor(config, options = {}) {
    this.config = config;
    this.jwks = createLocalJWKSet(parseJwks(options.jwks || config.JWT_JWKS));
    this.sessionValidator = options.sessionValidator;
  }

  async authenticate(request) {
    const token = parseBearer(request.headers.authorization || "");
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.jwks, {
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        algorithms: this.config.JWT_ALGORITHMS,
        clockTolerance: this.config.JWT_CLOCK_TOLERANCE_SECONDS,
      });
      if (!protectedHeader.kid || !payload.sub) throw authError();
      if (this.config.SESSION_VALIDATION === "required") {
        if (
          !payload.jti ||
          !this.sessionValidator ||
          !(await this.sessionValidator(
            payload.jti,
            `${payload.iss}|${payload.sub}`,
          ))
        )
          throw authError();
      }
      return {
        subject: `${payload.iss}|${payload.sub}`,
        provider: "jwt",
        providerSubject: payload.sub,
        email: typeof payload.email === "string" ? payload.email : null,
        displayName: typeof payload.name === "string" ? payload.name : null,
        avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
        sessionId: typeof payload.jti === "string" ? payload.jti : null,
      };
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      throw authError();
    }
  }
}

function createIdentityProvider(config, options = {}) {
  if (config.AUTH_MODE === "demo") return new DemoIdentityProvider(config);
  if (config.AUTH_MODE === "test")
    return new TestIdentityProvider(options.testIdentity, config);
  return new JwtIdentityProvider(config, options);
}

function identityId(subject) {
  return crypto.createHash("sha256").update(subject).digest("hex");
}

module.exports = {
  DemoIdentityProvider,
  TestIdentityProvider,
  JwtIdentityProvider,
  createIdentityProvider,
  identityId,
  parseBearer,
  parseJwks,
};
