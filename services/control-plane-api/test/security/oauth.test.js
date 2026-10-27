const { expect } = require("chai");
const { OAuthStateStore, constantTimeEqual } = require("../../src/auth/oauth");
describe("OAuth state and PKCE", () => {
  it("creates PKCE S256 material and consumes state once", () => {
    const store = new OAuthStateStore();
    const flow = store.create("/dashboard");
    expect(flow.state).to.have.length.greaterThan(32);
    expect(flow.verifier).to.have.length.greaterThan(42);
    expect(flow.challenge).not.to.equal(flow.verifier);
    expect(store.consume(flow.state).returnTo).to.equal("/dashboard");
    expect(() => store.consume(flow.state)).to.throw(/state/i);
  });
  it("rejects invalid and expired state", () => {
    let now = 100;
    const store = new OAuthStateStore({ ttlMs: 10, clock: () => now });
    const flow = store.create();
    expect(() => store.consume("bad")).to.throw(/state/i);
    now = 111;
    expect(() => store.consume(flow.state)).to.throw(/state/i);
  });
  it("uses a constant-time comparison helper", () => {
    expect(constantTimeEqual("same", "same")).to.equal(true);
    expect(constantTimeEqual("same", "nope")).to.equal(false);
  });
});
