const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest();
}
function constantTimeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class OAuthStateStore {
  constructor({ ttlMs = 10 * 60 * 1000, clock = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.states = new Map();
  }
  create(returnTo = "/") {
    const state = base64url(crypto.randomBytes(32));
    const verifier = base64url(crypto.randomBytes(64));
    this.states.set(base64url(sha256(state)), {
      verifier,
      returnTo,
      expiresAt: this.clock() + this.ttlMs,
    });
    return {
      state,
      verifier,
      challenge: base64url(sha256(verifier)),
      returnTo,
    };
  }
  consume(state) {
    if (typeof state !== "string" || state.length < 32)
      throw new ControlPlaneError(
        400,
        "OAUTH_STATE_INVALID",
        "OAuth state is invalid",
      );
    const suppliedHash = base64url(sha256(state));
    let matchedKey;
    for (const key of this.states.keys())
      if (constantTimeEqual(key, suppliedHash)) matchedKey = key;
    const entry = matchedKey ? this.states.get(matchedKey) : null;
    if (matchedKey) this.states.delete(matchedKey);
    if (!entry || entry.expiresAt < this.clock())
      throw new ControlPlaneError(
        400,
        "OAUTH_STATE_INVALID",
        "OAuth state is invalid",
      );
    return entry;
  }
}

class GitHubOAuthClient {
  constructor(config, fetchImpl = global.fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }
  authorizationUrl({ state, challenge }) {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: this.config.GITHUB_OAUTH_CLIENT_ID,
      redirect_uri: this.config.GITHUB_OAUTH_CALLBACK_URL,
      scope: "read:user user:email",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return url.toString();
  }
  async exchange(code, verifier) {
    const tokenResponse = await this.fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_id: this.config.GITHUB_OAUTH_CLIENT_ID,
          client_secret: this.config.GITHUB_OAUTH_CLIENT_SECRET,
          code,
          redirect_uri: this.config.GITHUB_OAUTH_CALLBACK_URL,
          code_verifier: verifier,
        }),
      },
    );
    if (!tokenResponse.ok)
      throw new ControlPlaneError(401, "OAUTH_LOGIN_FAILED", "Login failed");
    const token = await tokenResponse.json();
    if (!token.access_token)
      throw new ControlPlaneError(401, "OAUTH_LOGIN_FAILED", "Login failed");
    const headers = {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token.access_token}`,
      "user-agent": "microservice-platform",
    };
    const [userResponse, emailResponse] = await Promise.all([
      this.fetch("https://api.github.com/user", { headers }),
      this.fetch("https://api.github.com/user/emails", { headers }),
    ]);
    if (!userResponse.ok)
      throw new ControlPlaneError(401, "OAUTH_LOGIN_FAILED", "Login failed");
    const user = await userResponse.json();
    const emails = emailResponse.ok ? await emailResponse.json() : [];
    const primary =
      emails.find((item) => item.primary && item.verified) ||
      emails.find((item) => item.verified);
    return {
      subject: `github|${user.id}`,
      provider: "github",
      providerSubject: String(user.id),
      email: primary?.email || user.email || null,
      displayName: user.name || user.login,
      avatarUrl: user.avatar_url || null,
    };
  }
}

module.exports = { OAuthStateStore, GitHubOAuthClient, constantTimeEqual };
