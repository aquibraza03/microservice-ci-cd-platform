const { expect } = require("chai");
const { generateKeyPair, exportJWK, SignJWT } = require("jose");
const { JwtIdentityProvider } = require("../../src/auth/provider");

describe("JWT authentication", () => {
  let privateKey;
  let publicJwk;
  let otherKey;
  let config;
  before(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    publicJwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: "current",
      alg: "RS256",
      use: "sig",
    };
    otherKey = (await generateKeyPair("RS256")).privateKey;
    config = {
      JWT_JWKS: JSON.stringify({ keys: [publicJwk] }),
      JWT_ISSUER: "https://identity.example.test",
      JWT_AUDIENCE: "control-plane",
      JWT_ALGORITHMS: ["RS256"],
      JWT_CLOCK_TOLERANCE_SECONDS: 0,
      SESSION_VALIDATION: "optional",
    };
  });
  async function token(
    overrides = {},
    key = privateKey,
    header = { alg: "RS256", kid: "current" },
  ) {
    const now = Math.floor(Date.now() / 1000);
    let builder = new SignJWT({
      email: "alice@example.test",
      name: "Alice",
      ...overrides.payload,
    })
      .setProtectedHeader(header)
      .setIssuer(overrides.issuer || config.JWT_ISSUER)
      .setAudience(overrides.audience || config.JWT_AUDIENCE)
      .setSubject("github|123")
      .setIssuedAt(now)
      .setNotBefore(overrides.nbf ?? now)
      .setExpirationTime(overrides.exp ?? now + 300);
    return builder.sign(key);
  }
  async function failure(header) {
    try {
      await new JwtIdentityProvider(config).authenticate({
        headers: { authorization: header },
      });
      throw new Error("expected failure");
    } catch (error) {
      expect(error.status).to.equal(401);
      expect(error.message).not.to.match(
        /signature|issuer|audience|expired|kid/i,
      );
    }
  }
  it("rejects missing authorization", async () => {
    await failure(undefined);
  });
  it("rejects malformed bearer tokens", async () => {
    await failure("Basic abc");
    await failure("Bearer one two");
  });
  it("rejects an invalid signature", async () => {
    await failure(`Bearer ${await token({}, otherKey)}`);
  });
  it("rejects a wrong issuer", async () => {
    await failure(`Bearer ${await token({ issuer: "https://wrong.example" })}`);
  });
  it("rejects a wrong audience", async () => {
    await failure(`Bearer ${await token({ audience: "wrong" })}`);
  });
  it("rejects an expired token", async () => {
    await failure(
      `Bearer ${await token({ exp: Math.floor(Date.now() / 1000) - 10 })}`,
    );
  });
  it("rejects a token that is not active", async () => {
    await failure(
      `Bearer ${await token({ nbf: Math.floor(Date.now() / 1000) + 120 })}`,
    );
  });
  it("rejects an unknown key ID", async () => {
    await failure(
      `Bearer ${await token({}, privateKey, { alg: "RS256", kid: "retired" })}`,
    );
  });
  it("accepts a valid token and maps verified claims", async () => {
    const identity = await new JwtIdentityProvider(config).authenticate({
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(identity.subject).to.equal(
      "https://identity.example.test|github|123",
    );
    expect(identity.email).to.equal("alice@example.test");
    expect(identity.displayName).to.equal("Alice");
  });
  it("supports key rotation by kid", async () => {
    const rotated = await generateKeyPair("RS256");
    const rotatedJwk = {
      ...(await exportJWK(rotated.publicKey)),
      kid: "next",
      alg: "RS256",
      use: "sig",
    };
    const provider = new JwtIdentityProvider({
      ...config,
      JWT_JWKS: JSON.stringify({ keys: [publicJwk, rotatedJwk] }),
    });
    const identity = await provider.authenticate({
      headers: {
        authorization: `Bearer ${await token({}, rotated.privateKey, { alg: "RS256", kid: "next" })}`,
      },
    });
    expect(identity.providerSubject).to.equal("github|123");
  });
});
