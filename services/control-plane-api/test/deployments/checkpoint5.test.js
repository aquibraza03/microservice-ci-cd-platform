const { describe, it } = require("mocha");
const { expect } = require("chai");
const fs = require("fs/promises");
const path = require("path");
const { setup } = require("./state-and-queue.test");
const { DeploymentPipeline } = require("../../src/worker/pipeline");
const { TestBuildExecutor } = require("../../src/worker/buildkit");
const {
  TestRegistryProvider,
  imageRepository,
} = require("../../src/providers/registry");
const {
  TestSupplyChainVerifier,
  VulnerabilityPolicy,
} = require("../../src/supply-chain/verifier");
const {
  TestDeploymentTargetProvider,
  manifests,
} = require("../../src/providers/deployment-target");
const { TestHealthVerifier } = require("../../src/providers/health-verifier");
const { createWorkspace, cleanup } = require("../../src/worker/workspace");
const deploymentInput = {
  deploymentId: "00000000-0000-4000-8000-000000000001",
  organizationSlug: "acme",
  projectSlug: "store",
  serviceSlug: "api",
  imageReference: `ghcr.io/acme/acme-store-api@sha256:${"a".repeat(64)}`,
  port: 3000,
  startupPath: "/health",
  readinessPath: "/ready",
  healthPath: "/health",
  resources: {
    requests: { cpu: "100m", memory: "128Mi" },
    limits: { cpu: "500m", memory: "512Mi" },
  },
  localKind: true,
  nodePort: 30080,
};
describe("Checkpoint 5 registry, supply chain and Kubernetes", () => {
  it("creates deterministic safe GHCR names", () =>
    expect(
      imageRepository({
        owner: "Acme",
        organization: "team",
        project: "shop",
        service: "api",
      }),
    ).to.equal("ghcr.io/acme/team-shop-api"));
  it("classifies registry auth, push and missing-digest failures", async () => {
    for (const failure of ["auth", "push", "digest"]) {
      const provider = new TestRegistryProvider({ fail: failure });
      let error;
      try {
        await provider.authenticate();
        await provider.pushImage({ repository: "test/repo", tags: ["abc"] });
      } catch (value) {
        error = value;
      }
      expect(error.code).to.equal(
        failure === "auth"
          ? "REGISTRY_AUTH_FAILED"
          : failure === "digest"
            ? "REGISTRY_DIGEST_MISSING"
            : "REGISTRY_OPERATION_FAILED",
      );
    }
  });
  it("blocks critical vulnerabilities unless a complete audited exception is enabled", () => {
    const report = {
      Results: [{ Vulnerabilities: [{ Severity: "CRITICAL" }] }],
    };
    expect(() => new VulnerabilityPolicy().evaluate(report))
      .to.throw()
      .with.property("code", "CRITICAL_VULNERABILITY_BLOCKED");
    const policy = new VulnerabilityPolicy({ allowExceptions: true });
    expect(
      policy.evaluate(report, {
        exception: {
          id: "exc-1",
          approvedBy: "security",
          reason: "temporary mitigation",
          expiresAt: "2999-01-01",
          severities: ["critical"],
        },
      }).status,
    ).to.equal("passed");
  });
  it("blocks missing digests and failed signatures", async () => {
    for (const [reference, fail, code] of [
      ["ghcr.io/a/b:latest", null, "REGISTRY_DIGEST_MISSING"],
      [
        `ghcr.io/a/b@sha256:${"a".repeat(64)}`,
        "signature",
        "SIGNATURE_VERIFICATION_FAILED",
      ],
    ]) {
      let error;
      try {
        await new TestSupplyChainVerifier({ fail }).verify({ reference });
      } catch (value) {
        error = value;
      }
      expect(error.code).to.equal(code);
    }
  });
  it("generates restricted digest-only Kubernetes resources", () => {
    const items = manifests(deploymentInput),
      pod = items.find((item) => item.kind === "Deployment").spec.template.spec,
      container = pod.containers[0];
    expect(items.map((item) => item.kind)).to.include.members([
      "Namespace",
      "ServiceAccount",
      "Deployment",
      "Service",
      "NetworkPolicy",
    ]);
    expect(pod.automountServiceAccountToken).to.equal(false);
    expect(pod.securityContext.runAsNonRoot).to.equal(true);
    expect(container.securityContext).to.deep.include({
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
    });
    expect(container.securityContext.capabilities.drop).to.deep.equal(["ALL"]);
    expect(
      container.securityContext.seccompProfile ||
        pod.securityContext.seccompProfile,
    ).to.deep.equal({ type: "RuntimeDefault" });
  });
  it("rejects mutable images and invalid manifests", async () => {
    expect(() =>
      manifests({
        ...deploymentInput,
        imageReference: "ghcr.io/acme/api:latest",
      }),
    )
      .to.throw()
      .with.property("code", "IMAGE_DIGEST_REQUIRED");
    let error;
    try {
      await new TestDeploymentTargetProvider({ fail: "manifest" }).apply(
        deploymentInput,
      );
    } catch (value) {
      error = value;
    }
    expect(error.code).to.equal("KUBERNETES_MANIFEST_INVALID");
  });
  it("never marks failed rollout, readiness or liveness as ready", async () => {
    for (const failure of ["timeout", "readiness", "liveness"]) {
      const target = new TestDeploymentTargetProvider({
          fail: failure === "timeout" ? "timeout" : null,
        }),
        health = new TestHealthVerifier({
          fail: failure === "timeout" ? null : failure,
        });
      let error;
      try {
        const release = await target.apply(deploymentInput);
        await target.waitForRollout(release);
        await health.verify(release);
      } catch (value) {
        error = value;
      }
      expect(error).to.be.instanceOf(Error);
    }
  });
  it("runs the controlled golden path through ready with ordered events and cleanup", async () => {
    const x = setup();
    x.input.configurationSnapshot = {
      ...x.input.configurationSnapshot,
      organizationSlug: "org",
      projectSlug: "project",
      serviceSlug: "api",
      localKind: true,
      nodePort: 30080,
      registryRepository: "test/org-project-api",
    };
    const { deployment } = await x.store.create(
        x.u.id,
        x.o.id,
        x.input,
        "golden-path-local",
      ),
      workspace = await createWorkspace();
    let cleaned = false;
    const checkoutImpl = async ({ workspace: w }) => {
      const repo = path.join(w, "repository");
      await fs.mkdir(repo);
      await fs.writeFile(
        path.join(repo, "service.yml"),
        "name: api\nport: 3000\nhealth:\n  startup: /health\n  readiness: /ready\n  liveness: /health\ncommands: {}\n",
      );
      return repo;
    };
    const pipeline = new DeploymentPipeline({
      store: x.store,
      repository: x.r,
      gitProvider: {
        refreshInstallationToken: async () => "synthetic-short-lived-token",
      },
      buildExecutor: new TestBuildExecutor(),
      registryProvider: new TestRegistryProvider(),
      supplyChainVerifier: new TestSupplyChainVerifier(),
      deploymentProvider: new TestDeploymentTargetProvider(),
      healthVerifier: new TestHealthVerifier(),
      registryOwner: "test",
      workspaceFactory: async () => workspace,
      checkoutImpl,
      cleanupImpl: async (w) => {
        await cleanup(w);
        cleaned = true;
      },
    });
    const result = await pipeline.execute(deployment.id);
    const final = x.store.deployments.get(deployment.id),
      states = x.store.events
        .get(deployment.id)
        .filter((e) => e.eventType === "state.changed")
        .map((e) => e.state);
    expect(final.currentState).to.equal("ready");
    expect(final.imageDigest).to.match(/^sha256:/);
    expect(result.endpoint).to.equal("http://127.0.0.1:30080");
    expect(states).to.deep.equal([
      "validating",
      "testing",
      "scanning",
      "building",
      "build_complete",
      "pushing",
      "deploying",
      "verifying",
      "ready",
    ]);
    expect(cleaned).to.equal(true);
  });
  it("fails closed on supply-chain verification and records a failed state", async () => {
    const x = setup();
    x.input.configurationSnapshot = {
      ...x.input.configurationSnapshot,
      organizationSlug: "org",
      projectSlug: "project",
      serviceSlug: "api",
      localKind: true,
      nodePort: 30080,
    };
    const { deployment } = await x.store.create(
        x.u.id,
        x.o.id,
        x.input,
        "golden-path-fail",
      ),
      checkoutImpl = async ({ workspace }) => {
        const repo = path.join(workspace, "repository");
        await fs.mkdir(repo);
        await fs.writeFile(
          path.join(repo, "service.yml"),
          "name: api\nport: 3000\ncommands: {}\n",
        );
        return repo;
      },
      pipeline = new DeploymentPipeline({
        store: x.store,
        repository: x.r,
        gitProvider: { refreshInstallationToken: async () => "token" },
        buildExecutor: new TestBuildExecutor(),
        registryProvider: new TestRegistryProvider(),
        supplyChainVerifier: new TestSupplyChainVerifier({ fail: "signature" }),
        deploymentProvider: new TestDeploymentTargetProvider(),
        healthVerifier: new TestHealthVerifier(),
        registryOwner: "test",
        checkoutImpl,
      });
    let failure;
    try {
      await pipeline.execute(deployment.id);
    } catch (error) {
      failure = error;
    }
    expect(failure.code).to.equal("SIGNATURE_VERIFICATION_FAILED");
    expect(x.store.deployments.get(deployment.id).currentState).to.equal(
      "failed",
    );
  });
  it("creates a new digest-pinned rollback record and reaches rolled_back only after health", async () => {
    const x = setup();
    x.input.configurationSnapshot = {
      ...x.input.configurationSnapshot,
      organizationSlug: "org",
      projectSlug: "project",
      serviceSlug: "api",
      registryRepository: "test/org-project-api",
      port: 3000,
      resources: {
        requests: { cpu: "100m", memory: "128Mi" },
        limits: { cpu: "500m", memory: "512Mi" },
      },
      localKind: true,
      nodePort: 30080,
    };
    const first = (
        await x.store.create(x.u.id, x.o.id, x.input, "healthy-first")
      ).deployment,
      second = (
        await x.store.create(
          x.u.id,
          x.o.id,
          { ...x.input, commitSha: "b".repeat(40) },
          "healthy-second",
        )
      ).deployment;
    for (const d of [first, second]) {
      d.currentState = "ready";
      d.imageDigest = `sha256:${(d === first ? "a" : "b").repeat(64)}`;
      d.completedAt = new Date(d === first ? 1 : 2).toISOString();
      x.store.images.set(d.id, {
        deploymentId: d.id,
        digest: d.imageDigest,
        published: true,
        scanStatus: "passed",
        signatureStatus: "verified",
      });
    }
    const result = await x.store.createRollback(
        x.u.id,
        x.o.id,
        second.id,
        "restore known healthy release",
        "rollback-key-1",
      ),
      pipeline = new DeploymentPipeline({
        store: x.store,
        repository: x.r,
        gitProvider: {},
        buildExecutor: new TestBuildExecutor(),
        deploymentProvider: new TestDeploymentTargetProvider(),
        healthVerifier: new TestHealthVerifier(),
      });
    await pipeline.execute(result.deployment.id);
    expect(x.store.deployments.get(result.deployment.id).currentState).to.equal(
      "rolled_back",
    );
    expect(
      x.store.deployments.get(result.deployment.id).rollbackTargetId,
    ).to.equal(first.id);
  });
  it("classifies Kubernetes permission and image-pull failures", async () => {
    for (const [failure, code] of [
      ["permission", "KUBERNETES_OPERATION_FAILED"],
      ["pull", "KUBERNETES_IMAGE_PULL_FAILED"],
    ]) {
      const target = new TestDeploymentTargetProvider({ fail: failure });
      let error;
      try {
        const release = await target.apply(deploymentInput);
        await target.waitForRollout(release);
      } catch (value) {
        error = value;
      }
      expect(error.code).to.equal(code);
    }
  });
  it("records a rollback health failure without producing rolled_back", async () => {
    const x = setup();
    x.input.configurationSnapshot = {
      ...x.input.configurationSnapshot,
      organizationSlug: "org",
      projectSlug: "project",
      serviceSlug: "api",
      registryRepository: "test/org-project-api",
      port: 3000,
      resources: {
        requests: { cpu: "100m", memory: "128Mi" },
        limits: { cpu: "500m", memory: "512Mi" },
      },
      localKind: true,
      nodePort: 30080,
    };
    const first = (
        await x.store.create(x.u.id, x.o.id, x.input, "rollback-fail-first")
      ).deployment,
      second = (
        await x.store.create(
          x.u.id,
          x.o.id,
          { ...x.input, commitSha: "b".repeat(40) },
          "rollback-fail-second",
        )
      ).deployment;
    for (const d of [first, second]) {
      d.currentState = "ready";
      d.imageDigest = `sha256:${(d === first ? "a" : "b").repeat(64)}`;
      d.completedAt = new Date(d === first ? 1 : 2).toISOString();
      x.store.images.set(d.id, {
        deploymentId: d.id,
        digest: d.imageDigest,
        published: true,
        scanStatus: "passed",
        signatureStatus: "verified",
      });
    }
    const result = await x.store.createRollback(
        x.u.id,
        x.o.id,
        second.id,
        "verify rollback failure handling",
        "rollback-failure-key",
      ),
      pipeline = new DeploymentPipeline({
        store: x.store,
        repository: x.r,
        gitProvider: {},
        buildExecutor: new TestBuildExecutor(),
        deploymentProvider: new TestDeploymentTargetProvider(),
        healthVerifier: new TestHealthVerifier({ fail: "readiness" }),
      });
    let error;
    try {
      await pipeline.execute(result.deployment.id);
    } catch (value) {
      error = value;
    }
    expect(error.code).to.equal("READINESS_FAILED");
    expect(x.store.deployments.get(result.deployment.id).currentState).to.equal(
      "failed",
    );
  });
});
