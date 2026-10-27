const crypto = require("crypto");
const { importPKCS8, SignJWT } = require("jose");
const { GitProvider } = require("./provider");
const { ControlPlaneError } = require("../errors");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class GitHubAppProvider extends GitProvider {
  constructor(
    config,
    {
      fetchImpl = global.fetch,
      clock = () => Date.now(),
      sleepImpl = sleep,
    } = {},
  ) {
    super();
    this.config = config;
    this.fetch = fetchImpl;
    this.clock = clock;
    this.sleep = sleepImpl;
    this.tokens = new Map();
  }
  createInstallationAuthorization(state) {
    return `https://github.com/apps/${this.config.GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`;
  }
  async appJwt() {
    const key = await importPKCS8(this.config.GITHUB_APP_PRIVATE_KEY, "RS256");
    const now = Math.floor(this.clock() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(String(this.config.GITHUB_APP_ID))
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 540)
      .sign(key);
  }
  async refreshInstallationToken(installationId) {
    const response = await this.request(
      `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      { method: "POST", app: true },
    );
    const token = {
      value: response.token,
      expiresAt: new Date(response.expires_at).getTime(),
    };
    this.tokens.set(String(installationId), token);
    return token.value;
  }
  async token(installationId) {
    const cached = this.tokens.get(String(installationId));
    if (cached && cached.expiresAt - this.clock() > 60000) return cached.value;
    return this.refreshInstallationToken(installationId);
  }
  async request(
    path,
    { installationId, method = "GET", body, app = false, retries = 2 } = {},
  ) {
    for (let attempt = 0; ; attempt += 1) {
      const bearer = app
        ? await this.appJwt()
        : await this.token(installationId);
      let response;
      try {
        response = await this.fetch(
          `${this.config.GITHUB_API_BASE_URL}${path}`,
          {
            method,
            headers: {
              accept: "application/vnd.github+json",
              authorization: `Bearer ${bearer}`,
              "content-type": "application/json",
              "user-agent": "microservice-ci-cd-platform",
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(this.config.GITHUB_API_TIMEOUT_MS),
          },
        );
      } catch {
        if (attempt < retries) {
          await this.sleep(50 * 2 ** attempt);
          continue;
        }
        throw new ControlPlaneError(
          502,
          "GIT_PROVIDER_UNAVAILABLE",
          "Git provider is unavailable",
        );
      }
      if (response.ok) return response.status === 204 ? null : response.json();
      if (
        response.status === 429 ||
        (response.status === 403 &&
          response.headers.get("x-ratelimit-remaining") === "0")
      )
        throw new ControlPlaneError(
          429,
          "GIT_PROVIDER_RATE_LIMITED",
          "Git provider rate limit exceeded",
        );
      if ([401, 403, 404].includes(response.status))
        throw new ControlPlaneError(
          403,
          "GIT_PROVIDER_ACCESS_REVOKED",
          "Git provider access is unavailable",
        );
      if (response.status >= 500 && attempt < retries) {
        await this.sleep(50 * 2 ** attempt);
        continue;
      }
      throw new ControlPlaneError(
        502,
        "GIT_PROVIDER_ERROR",
        "Git provider request failed",
      );
    }
  }
  getInstallation(id) {
    return this.request(`/app/installations/${encodeURIComponent(id)}`, {
      app: true,
    });
  }
  async listRepositories(id, { page = 1, pageSize = 30, search = "" } = {}) {
    const data = await this.request(
      `/installation/repositories?per_page=${Math.min(pageSize, 100)}&page=${page}`,
      { installationId: id },
    );
    const q = search.toLowerCase();
    const items = (data.repositories || [])
      .filter((r) => !q || r.full_name.toLowerCase().includes(q))
      .map(mapRepository);
    return {
      items,
      pagination: {
        page,
        pageSize,
        totalItems: data.total_count,
        totalPages: Math.ceil(data.total_count / pageSize),
      },
    };
  }
  async listBranches(id, repository, { page = 1, pageSize = 30 } = {}) {
    const data = await this.request(
      `/repositories/${encodeURIComponent(repository)}/branches?per_page=${Math.min(pageSize, 100)}&page=${page}`,
      { installationId: id },
    );
    return data.map((branch) => ({
      name: branch.name,
      commitSha: branch.commit.sha,
      protected: Boolean(branch.protected),
    }));
  }
  async getRepository(id, repository) {
    return mapRepository(
      await this.request(`/repositories/${encodeURIComponent(repository)}`, {
        installationId: id,
      }),
    );
  }
  getCommit(id, repository, sha) {
    return this.request(
      `/repositories/${encodeURIComponent(repository)}/commits/${encodeURIComponent(sha)}`,
      { installationId: id },
    );
  }
  getArchiveAuthorization(id, repository, ref) {
    return this.request(
      `/repositories/${encodeURIComponent(repository)}/tarball/${encodeURIComponent(ref)}`,
      { installationId: id },
    );
  }
  setCommitStatus(id, repository, sha, status) {
    return this.request(
      `/repositories/${encodeURIComponent(repository)}/statuses/${encodeURIComponent(sha)}`,
      { installationId: id, method: "POST", body: status },
    );
  }
  async disconnectInstallation(id) {
    this.tokens.delete(String(id));
    return this.request(`/app/installations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      app: true,
    });
  }
  verifyWebhook(raw, signature) {
    if (!/^sha256=[a-f0-9]{64}$/.test(signature || "")) return false;
    const expected = `sha256=${crypto.createHmac("sha256", this.config.GITHUB_APP_WEBHOOK_SECRET).update(raw).digest("hex")}`;
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  }
}
function safe(value, max = 255) {
  const hasControl =
    typeof value === "string" &&
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    );
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > max ||
    hasControl
  )
    throw new ControlPlaneError(
      502,
      "GIT_PROVIDER_METADATA_INVALID",
      "Git provider returned invalid metadata",
    );
  return value;
}
function mapRepository(r) {
  if (!Number.isSafeInteger(Number(r.id)))
    throw new ControlPlaneError(
      502,
      "GIT_PROVIDER_METADATA_INVALID",
      "Git provider returned invalid metadata",
    );
  return {
    id: String(r.id),
    nodeId: safe(r.node_id, 255),
    owner: safe(r.owner.login),
    name: safe(r.name),
    fullName: safe(r.full_name),
    defaultBranch: safe(r.default_branch),
    visibility: safe(r.visibility || (r.private ? "private" : "public"), 32),
    archived: Boolean(r.archived),
    disabled: Boolean(r.disabled),
    updatedAt: r.updated_at,
  };
}
class MockGitProvider extends GitProvider {
  constructor(config) {
    super();
    if (config.NODE_ENV === "production")
      throw new Error("Mock Git provider is forbidden in production");
  }
}
function createGitProvider(config, options = {}) {
  return config.GIT_PROVIDER_MODE === "mock"
    ? new MockGitProvider(config)
    : new GitHubAppProvider(config, options);
}
module.exports = {
  GitHubAppProvider,
  MockGitProvider,
  createGitProvider,
  mapRepository,
};
