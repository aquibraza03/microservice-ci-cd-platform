const { describe, it } = require("mocha");
const { expect } = require("chai");
const crypto = require("crypto");
const {
  GitHubAppProvider,
  MockGitProvider,
} = require("../../src/git/github-app");
const { InstallationStateStore } = require("../../src/git/state");
const { GitHubWebhookService } = require("../../src/git/webhooks");
const { MemoryRepository } = require("../../src/domain/repositories");
function cfg(overrides = {}) {
  return {
    NODE_ENV: "test",
    GITHUB_APP_ID: "1",
    GITHUB_APP_SLUG: "secure-app",
    GITHUB_APP_WEBHOOK_SECRET: "w".repeat(32),
    GITHUB_API_BASE_URL: "https://api.github.test",
    GITHUB_API_TIMEOUT_MS: 1000,
    ...overrides,
  };
}
function signature(raw, secret = "w".repeat(32)) {
  return `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
}
async function tenant() {
  const repository = new MemoryRepository();
  const user = repository.upsertUser({
    subject: "issuer|1",
    email: "a@example.test",
  });
  const org = repository.createOrganization(user.id, { name: "A", slug: "a" });
  const project = repository.createProject(user.id, org.id, {
    name: "P",
    slug: "p",
  });
  const installation = repository.createInstallation(user.id, org.id, {
    provider: "github",
    providerInstallationId: "42",
    accountId: "8",
    accountLogin: "octo",
    accountType: "Organization",
    repositorySelection: "selected",
  });
  const connected = repository.connectProviderRepository(
    user.id,
    org.id,
    project.id,
    installation.id,
    {
      id: "99",
      fullName: "octo/repo",
      owner: "octo",
      name: "repo",
      defaultBranch: "main",
      visibility: "private",
    },
    "main",
  );
  return { repository, user, org, project, installation, connected };
}
describe("GitHub onboarding security", () => {
  it("accepts state exactly once and rejects altered, replayed, wrong-user and wrong-organization state", () => {
    const store = new InstallationStateStore();
    for (const variant of [
      ["bad", "u", "o"],
      [null, "u2", "o"],
      [null, "u", "o2"],
    ]) {
      const state = store.create("u", "o");
      expect(() => store.consume(variant[0] || state, variant[1], variant[2]))
        .to.throw()
        .with.property("code", "INSTALLATION_STATE_INVALID");
    }
    const valid = store.create("u", "o");
    expect(store.consume(valid, "u", "o")).to.include({
      userId: "u",
      organizationId: "o",
    });
    expect(() => store.consume(valid, "u", "o")).to.throw();
  });
  it("rejects the mock adapter in production", () =>
    expect(() => new MockGitProvider(cfg({ NODE_ENV: "production" }))).to.throw(
      "forbidden",
    ));
  it("verifies valid signatures and rejects invalid or altered bodies", () => {
    const provider = new GitHubAppProvider(cfg());
    const raw = Buffer.from('{"zen":"safe"}');
    expect(provider.verifyWebhook(raw, signature(raw))).to.equal(true);
    expect(provider.verifyWebhook(raw, "sha256=" + "0".repeat(64))).to.equal(
      false,
    );
    expect(
      provider.verifyWebhook(Buffer.from('{"zen":"altered"}'), signature(raw)),
    ).to.equal(false);
  });
  it("maps pagination and safe rate-limit errors without exposing tokens", async () => {
    const responses = [
      {
        ok: true,
        status: 200,
        json: async () => ({
          token: "short-secret",
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        }),
      },
      {
        ok: true,
        status: 200,
        json: async () => ({
          total_count: 2,
          repositories: [
            {
              id: 1,
              node_id: "n",
              owner: { login: "octo" },
              name: "one",
              full_name: "octo/one",
              default_branch: "main",
              private: true,
            },
            {
              id: 2,
              node_id: "n2",
              owner: { login: "octo" },
              name: "two",
              full_name: "octo/two",
              default_branch: "main",
              private: false,
            },
          ],
        }),
      },
    ];
    const provider = new GitHubAppProvider(cfg(), {
      fetchImpl: async () => responses.shift(),
    });
    provider.appJwt = async () => "app-jwt";
    const page = await provider.listRepositories("42", {
      page: 2,
      pageSize: 1,
      search: "two",
    });
    expect(page.items).to.have.length(1);
    expect(page.pagination).to.deep.include({
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
    expect(JSON.stringify(page)).not.to.contain("short-secret");
    const limited = new GitHubAppProvider(cfg(), {
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        headers: { get: () => "0" },
      }),
    });
    limited.appJwt = async () => "app";
    try {
      await limited.refreshInstallationToken("42");
      throw new Error("expected rejection");
    } catch (error) {
      expect(error.code).to.equal("GIT_PROVIDER_RATE_LIMITED");
    }
  });
  it("enforces installation and repository ownership across tenants", async () => {
    const t = await tenant();
    const second = t.repository.upsertUser({ subject: "issuer|2" });
    const org2 = t.repository.createOrganization(second.id, {
      name: "B",
      slug: "b",
    });
    expect(() =>
      t.repository.createInstallation(second.id, org2.id, {
        provider: "github",
        providerInstallationId: "42",
        accountId: "8",
        accountLogin: "octo",
        accountType: "Organization",
        repositorySelection: "selected",
      }),
    )
      .to.throw()
      .with.property("code", "INSTALLATION_OWNERSHIP_CONFLICT");
    expect(() =>
      t.repository.getProviderRepository(second.id, org2.id, t.connected.id),
    )
      .to.throw()
      .with.property("code", "REPOSITORY_NOT_FOUND");
    t.repository.setInstallationStateByProvider("42", "revoked");
    expect(() =>
      t.repository.requireInstallation(t.user.id, t.org.id, t.installation.id),
    )
      .to.throw()
      .with.property("code", "GIT_PROVIDER_ACCESS_REVOKED");
  });
  it("accepts push and PR events once, ignores unsupported events, renames and revokes", async () => {
    const t = await tenant();
    const provider = new GitHubAppProvider(cfg());
    const service = new GitHubWebhookService(provider, t.repository);
    async function send(type, id, payload) {
      const raw = Buffer.from(JSON.stringify(payload));
      return service.handle(
        {
          "x-hub-signature-256": signature(raw),
          "x-github-event": type,
          "x-github-delivery": id,
        },
        raw,
      );
    }
    const base = {
      installation: { id: 42 },
      repository: {
        id: 99,
        full_name: "octo/repo",
        owner: { login: "octo" },
        name: "repo",
      },
      sender: { login: "alice" },
    };
    expect(
      await send("push", "d-1", {
        ...base,
        ref: "refs/heads/main",
        after: "a".repeat(40),
        head_commit: { timestamp: "2026-01-01T00:00:00Z" },
      }),
    ).to.include({ status: "accepted", eventType: "push" });
    expect(await send("push", "d-1", base)).to.include({ status: "duplicate" });
    expect(
      await send("pull_request", "d-2", {
        ...base,
        number: 7,
        action: "opened",
        pull_request: {
          head: {
            ref: "feature",
            sha: "b".repeat(40),
            repo: { id: 100, fork: true },
          },
          base: { repo: { id: 99 } },
        },
      }),
    ).to.include({ status: "accepted", eventType: "pull_request" });
    expect(t.repository.gitEvents[1].forkedPullRequest).to.equal(true);
    expect(await send("issues", "d-3", base)).to.include({ status: "ignored" });
    await send("repository", "d-4", {
      ...base,
      action: "renamed",
      repository: { ...base.repository, full_name: "octo/new", name: "new" },
    });
    expect(t.repository.repositories.get(t.connected.id).name).to.equal(
      "octo/new",
    );
    await send("installation", "d-5", {
      installation: { id: 42 },
      action: "deleted",
    });
    expect(
      t.repository.installations.get(t.installation.id).connectionState,
    ).to.equal("revoked");
  });
});
