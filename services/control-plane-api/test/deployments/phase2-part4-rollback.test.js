const { describe, it } = require("mocha");
const { expect } = require("chai");
const { setup } = require("./state-and-queue.test");
const { DeploymentPipeline } = require("../../src/worker/pipeline");
const {
  TestDeploymentTargetProvider,
} = require("../../src/providers/deployment-target");
const { TestHealthVerifier } = require("../../src/providers/health-verifier");

async function releases(options = {}) {
  const x = setup();
  x.input.configurationSnapshot = {
    organizationSlug: "org",
    projectSlug: "project",
    serviceSlug: "api",
    registryRepository: "registry/org/api",
    port: 3000,
    localKind: true,
    nodePort: 30080,
    environmentVariables: { LOG_LEVEL: "info" },
    secretReferences: [{ name: "DATABASE_URL" }],
    resources: {
      requests: { cpu: "100m", memory: "128Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
    database: { migrations: ["001"] },
  };
  const old = (
      await x.store.create(x.u.id, x.o.id, x.input, `old-${Math.random()}`)
    ).deployment,
    current = (
      await x.store.create(
        x.u.id,
        x.o.id,
        {
          ...x.input,
          commitSha: "b".repeat(40),
          configurationSnapshot: {
            ...x.input.configurationSnapshot,
            database: { migrations: ["001", "002"] },
          },
        },
        `current-${Math.random()}`,
      )
    ).deployment;
  for (const [d, char, completed] of [
    [old, "a", 1],
    [current, "b", 2],
  ]) {
    d.currentState = "ready";
    d.imageDigest = `sha256:${char.repeat(64)}`;
    d.completedAt = new Date(completed).toISOString();
    x.store.images.set(d.id, {
      deploymentId: d.id,
      digest: d.imageDigest,
      published: true,
      scanStatus: options.scan || "passed",
      signatureStatus: options.signature || "verified",
    });
  }
  return { x, old, current };
}
async function queued(context, input = {}, key = `rollback-${Math.random()}`) {
  return context.x.store.createRollback(
    context.x.u.id,
    context.x.o.id,
    context.current.id,
    {
      targetDeploymentId: context.old.id,
      reason: "Restore the verified prior release",
      ...input,
    },
    key,
  );
}
function pipeline(context, options = {}) {
  return new DeploymentPipeline({
    store: context.x.store,
    repository: context.x.r,
    gitProvider: {},
    buildExecutor: {},
    deploymentProvider: new TestDeploymentTargetProvider({
      fail: options.kubernetes,
    }),
    healthVerifier: new TestHealthVerifier({ fail: options.health }),
    routeVerifier: options.routeFailure
      ? {
          verifyExpectedService: async () => {
            const e = new Error("Route did not reach expected service");
            e.code = "ROLLBACK_ROUTE_FAILED";
            throw e;
          },
        }
      : { verifyExpectedService: async () => ({ reached: true }) },
  });
}

describe("Phase 2 Part 4 safe rollback", () => {
  it("executes a valid rollback and preserves historical records", async () => {
    const c = await releases(),
      before = structuredClone(c.old),
      result = await queued(c);
    await pipeline(c).execute(result.deployment.id);
    expect(c.x.store.deployments.get(result.deployment.id)).to.include({
      currentState: "rolled_back",
      imageDigest: c.old.imageDigest,
      rollbackTargetId: c.old.id,
    });
    expect(c.old).to.deep.include(before);
    expect(
      c.x.store.events.get(result.deployment.id).map((x) => x.state),
    ).to.include.members([
      "rollback_queued",
      "rolling_back",
      "verifying",
      "rolled_back",
    ]);
  });
  it("rejects viewers and developers under the permission policy", async () => {
    for (const role of ["viewer", "developer"]) {
      const c = await releases(),
        user = c.x.r.upsertUser({ subject: `issuer|${role}` });
      c.x.r.addMembership(c.x.u.id, c.x.o.id, user.id, role);
      let error;
      try {
        await c.x.store.createRollback(
          user.id,
          c.x.o.id,
          c.current.id,
          {
            targetDeploymentId: c.old.id,
            reason: "Restore prior known release",
          },
          role,
        );
      } catch (e) {
        error = e;
      }
      expect(error.code).to.equal("PERMISSION_DENIED");
    }
  });
  it("rejects cross-tenant rollback", async () => {
    const c = await releases(),
      other = c.x.r.createOrganization(c.x.u.id, {
        name: "Other",
        slug: `other-${Date.now()}`,
      });
    let error;
    try {
      await c.x.store.createRollback(
        c.x.u.id,
        other.id,
        c.current.id,
        { targetDeploymentId: c.old.id, reason: "Restore prior known release" },
        "cross",
      );
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("DEPLOYMENT_NOT_FOUND");
  });
  it("requires production approval for the exact source and target", async () => {
    const c = await releases();
    c.old.environment = c.current.environment = "production";
    let error;
    try {
      await queued(c);
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("ROLLBACK_APPROVAL_REQUIRED");
    const approval = c.x.store.approveRollback(
      c.x.u.id,
      c.x.o.id,
      c.current.id,
      c.old.id,
      "Approved after incident review",
    );
    expect(
      (await queued(c, { approvalId: approval.id })).deployment.rollback
        .approvalId,
    ).to.equal(approval.id);
  });
  it("rejects missing digest, invalid signature and unhealthy target", async () => {
    for (const mode of ["digest", "signature", "health"]) {
      const c = await releases();
      if (mode === "digest") c.old.imageDigest = null;
      if (mode === "signature")
        c.x.store.images.get(c.old.id).signatureStatus = "failed";
      if (mode === "health") c.old.currentState = "failed";
      let error;
      try {
        await queued(c);
      } catch (e) {
        error = e;
      }
      expect(error.code).to.equal(
        mode === "digest"
          ? "ROLLBACK_DIGEST_MISSING"
          : mode === "signature"
            ? "ROLLBACK_SUPPLY_CHAIN_INVALID"
            : "ROLLBACK_TARGET_UNHEALTHY",
      );
    }
  });
  it("blocks incompatible database rollback and permits owner emergency override", async () => {
    const c = await releases();
    c.x.store.setRollbackPolicy(c.x.u.id, c.x.o.id, "staging", {
      databaseCompatibilityMode: "block",
    });
    let error;
    try {
      await queued(c);
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("ROLLBACK_DATABASE_INCOMPATIBLE");
    const result = await queued(c, {
      emergencyOverride: true,
      overrideJustification: "Restore service during declared incident",
    });
    expect(result.deployment.rollback.emergencyOverride).to.equal(true);
  });
  it("is idempotent and blocks a concurrent operation", async () => {
    const c = await releases(),
      first = await queued(c, {}, "same-key"),
      duplicate = await queued(c, {}, "same-key");
    expect(duplicate.created).to.equal(false);
    expect(duplicate.deployment.id).to.equal(first.deployment.id);
    const secondContext = await releases();
    secondContext.x = c.x;
    secondContext.old = c.old;
    secondContext.current = c.current;
    let error;
    try {
      await queued(secondContext, {}, "different-key");
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("DEPLOYMENT_OPERATION_CONFLICT");
  });
  it("recovers expired operation locks and worker restarts", async () => {
    const c = await releases(),
      result = await queued(c);
    for (const lock of c.x.store.operationLocks.values())
      lock.expiresAt = new Date(0).toISOString();
    expect(c.x.store.recoverStaleOperationLocks()).to.equal(1);
    result.deployment.currentState = "rolling_back";
    await pipeline(c).execute(result.deployment.id);
    expect(result.deployment.currentState).to.equal("rolling_back");
    expect(
      c.x.store.deployments.get(result.deployment.id).currentState,
    ).to.equal("rolled_back");
  });
  it("fails truthfully for Kubernetes rollout, health, route and observed digest", async () => {
    for (const scenario of [
      { kubernetes: "timeout", code: "KUBERNETES_ROLLOUT_TIMEOUT" },
      { health: "readiness", code: "READINESS_FAILED" },
      { routeFailure: true, code: "ROLLBACK_ROUTE_FAILED" },
      { kubernetes: "digest", code: "ROLLBACK_DIGEST_MISMATCH" },
    ]) {
      const c = await releases(),
        result = await queued(c);
      let error;
      try {
        await pipeline(c, scenario).execute(result.deployment.id);
      } catch (e) {
        error = e;
      }
      expect(error.code).to.equal(scenario.code);
      expect(
        c.x.store.deployments.get(result.deployment.id).currentState,
      ).to.equal("failed");
      expect(
        c.x.store.events
          .get(result.deployment.id)
          .some((x) => x.eventType === "rollback.remediation_required"),
      ).to.equal(true);
    }
  });
  it("provides redacted comparison and audit history", async () => {
    const c = await releases(),
      comparison = c.x.store.rollbackComparison(
        c.x.u.id,
        c.x.o.id,
        c.current.id,
        c.old.id,
      );
    expect(comparison.compatibility.proven).to.equal(false);
    expect(JSON.stringify(comparison)).not.to.include("DATABASE_URL_VALUE");
    const result = await queued(c);
    await pipeline(c).execute(result.deployment.id);
    expect(
      c.x.store.rollbackAudit.some(
        (x) =>
          x.action === "rollback.queued" &&
          x.deploymentId === result.deployment.id,
      ),
    ).to.equal(true);
  });
});
