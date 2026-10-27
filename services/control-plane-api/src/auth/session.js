const crypto = require("crypto");
const { importJWK, SignJWT } = require("jose");

class SessionIssuer {
  constructor(config) {
    this.config = config;
    this.jwk = JSON.parse(config.JWT_SIGNING_JWK);
  }
  async issue(identity, ttlSeconds = 3600) {
    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomUUID();
    const key = await importJWK(this.jwk, this.jwk.alg);
    const token = await new SignJWT({
      email: identity.email,
      name: identity.displayName,
      picture: identity.avatarUrl,
    })
      .setProtectedHeader({ alg: this.jwk.alg, kid: this.jwk.kid, typ: "JWT" })
      .setIssuer(this.config.JWT_ISSUER)
      .setAudience(this.config.JWT_AUDIENCE)
      .setSubject(identity.providerSubject || identity.subject)
      .setJti(jti)
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + ttlSeconds)
      .sign(key);
    return {
      token,
      jti,
      expiresAt: new Date((now + ttlSeconds) * 1000).toISOString(),
    };
  }
}
module.exports = { SessionIssuer };
