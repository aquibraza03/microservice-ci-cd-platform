const { describe, it } = require("mocha");
const { expect } = require("chai");
const {
  ALLOWED,
  STATES,
  assertTransition,
  transition,
} = require("../../src/deployments/state-machine");
const { MemoryDeploymentStore } = require("../../src/deployments/store");
const {
  MemoryDeploymentQueue,
  JOB_OPTIONS,
  WORKER_OPTIONS,
} = require("../../src/queue/deployment-queue");
const { MemoryRepository } = require("../../src/domain/repositories");
function setup() {
  const r = new MemoryRepository(),
    u = r.upsertUser({ subject: "issuer|owner" }),
    o = r.createOrganization(u.id, { name: "Org", slug: "org" }),
    p = r.createProject(u.id, o.id, { name: "Project", slug: "project" }),
    i = r.createInstallation(u.id, o.id, {
      provider: "github",
      providerInstallationId: "42",
      accountId: "1",
      accountLogin: "octo",
      accountType: "Organization",
      repositorySelection: "selected",
    }),
    repo = r.connectProviderRepository(
      u.id,
      o.id,
      p.id,
      i.id,
      {
        id: "99",
        fullName: "octo/repo",
        owner: "octo",
        name: "repo",
        defaultBranch: "main",
        visibility: "private",
      },
      "main",
    ),
    svc = r.createService(u.id, o.id, p.id, {
      repositoryId: repo.id,
      name: "api",
      servicePath: ".",
    }),
    store = new MemoryDeploymentStore(r);
  return {
    r,
    u,
    o,
    p,
    i,
    repo,
    svc,
    store,
    input: {
      projectId: p.id,
      serviceId: svc.id,
      repositoryId: repo.id,
      branch: "main",
      commitSha: "a".repeat(40),
      environment: "staging",
      configurationSnapshot: {
        providerRepositoryId: "99",
        installationProviderId: "42",
      },
    },
  };
}
describe("deployment state and queue", () => {
  it("defines every required state and rejects invalid transitions without mutation", () => {
    for (const s of [
      "queued",
      "validating",
      "testing",
      "scanning",
      "building",
      "pushing",
      "deploying",
      "verifying",
      "ready",
      "failed",
      "cancel_requested",
      "cancelled",
      "rollback_queued",
      "rolling_back",
      "rolled_back",
    ])
      expect(STATES).to.include(s);
    const d = {
      currentState: "queued",
      stateVersion: 1,
      processedCommands: new Set(),
    };
    expect(() => transition(d, "ready", { expectedVersion: 1, commandId: "x" }))
      .to.throw()
      .with.property("code", "INVALID_DEPLOYMENT_TRANSITION");
    expect(d).to.deep.include({ currentState: "queued", stateVersion: 1 });
  });
  it("accepts valid transitions, rejects optimistic conflicts and makes commands idempotent", () => {
    let d = {
      currentState: "queued",
      stateVersion: 1,
      processedCommands: new Set(),
    };
    d = transition(d, "validating", {
      expectedVersion: 1,
      commandId: "a",
    }).deployment;
    expect(d.stateVersion).to.equal(2);
    expect(() =>
      transition(d, "testing", { expectedVersion: 1, commandId: "b" }),
    )
      .to.throw()
      .with.property("code", "DEPLOYMENT_VERSION_CONFLICT");
    expect(
      transition(d, "testing", { expectedVersion: 2, commandId: "a" })
        .idempotent,
    ).to.equal(true);
  });
  it("allows cancellation during every owned active stage and prevents later stage transitions", () => {
    for (const state of [
      "queued",
      "validating",
      "testing",
      "scanning",
      "building",
      "pushing",
      "deploying",
      "verifying",
      "rollback_queued",
      "rolling_back",
    ]) {
      expect(ALLOWED[state]).to.include("cancel_requested");
      assertTransition(state, "cancel_requested");
      expect(() => assertTransition("cancel_requested", "building")).to.throw();
    }
  });
  it("deduplicates deployment creation and queue enqueue", async () => {
    const x = setup(),
      q = new MemoryDeploymentQueue();
    const a = await x.store.create(
        x.u.id,
        x.o.id,
        x.input,
        "webhook-delivery-1",
      ),
      b = await x.store.create(x.u.id, x.o.id, x.input, "webhook-delivery-1");
    await q.enqueue(a.deployment);
    await q.enqueue(b.deployment);
    expect(a.created).to.equal(true);
    expect(b.created).to.equal(false);
    expect(x.store.deployments.size).to.equal(1);
    expect(q.enqueues).to.equal(1);
  });
  it("defines bounded exponential retries, worker timeout lock and stalled-job recovery", () => {
    expect(JOB_OPTIONS).to.deep.include({ attempts: 3 });
    expect(JOB_OPTIONS.backoff).to.deep.equal({
      type: "exponential",
      delay: 1000,
    });
    expect(WORKER_OPTIONS.maxStalledCount).to.equal(2);
    expect(WORKER_OPTIONS.stalledInterval).to.equal(15000);
  });
  it("rejects cross-tenant deployment access", async () => {
    const x = setup(),
      created = await x.store.create(x.u.id, x.o.id, x.input, "key-12345"),
      other = x.r.upsertUser({ subject: "issuer|other" }),
      org = x.r.createOrganization(other.id, { name: "Other", slug: "other" });
    expect(() => x.store.access(other.id, org.id, created.deployment.id))
      .to.throw()
      .with.property("code", "DEPLOYMENT_NOT_FOUND");
  });
  it("redacts secrets before logs persist or replay", async () => {
    const x = setup(),
      created = await x.store.create(x.u.id, x.o.id, x.input, "key-secret"),
      secret = "github_pat_testcredential123456789";
    x.store.appendLog(
      created.deployment.id,
      x.o.id,
      "checkout",
      `Authorization: Bearer ${secret} PASSWORD=hunter2`,
      [secret],
    );
    const content = x.store.logs.get(created.deployment.id)[0].content;
    expect(content).not.to.include(secret);
    expect(content).not.to.include("hunter2");
    expect(content).to.include("[REDACTED]");
  });
  it("replays ordered missed events for SSE reconnect after Last-Event-ID", async () => {
    const x = setup(),
      { deployment } = await x.store.create(
        x.u.id,
        x.o.id,
        x.input,
        "key-replay",
      );
    x.store.transition(deployment.id, "validating", {
      expectedVersion: 1,
      commandId: "1",
    });
    x.store.transition(deployment.id, "testing", {
      expectedVersion: 2,
      commandId: "2",
    });
    const replay = x.store.history(x.u.id, x.o.id, deployment.id, 1);
    expect(replay.map((e) => e.sequence)).to.deep.equal([2, 3]);
  });
});
module.exports = { setup };
