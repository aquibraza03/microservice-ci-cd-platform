const { describe, it } = require("mocha");
const { expect } = require("chai");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

const {
  createWorkspace,
  verifyTree,
  cleanup,
  run,
} = require("../../src/worker/workspace");

const {
  safeRel,
  validateContract,
} = require("../../src/worker/service-contract");

const {
  RootlessBuildKitExecutor,
  TestBuildExecutor,
} = require("../../src/worker/buildkit");

const { DeploymentPipeline } = require("../../src/worker/pipeline");
const { setup } = require("./state-and-queue.test");

describe("isolated deployment worker", () => {
  it("rejects repository path traversal and privileged configuration", () => {
    for (const value of ["../etc", "/etc", "a/../../b"]) {
      expect(() => safeRel(value, "path")).to.throw();
    }

    expect(() =>
      validateContract({
        name: "api",
        port: 3000,
        privileged: true,
      }),
    )
      .to.throw()
      .with.property("code", "PRIVILEGED_BUILD_REJECTED");

    expect(() =>
      validateContract({
        name: "api",
        port: 3000,
        commands: {
          test: ["npm test"],
        },
      }),
    ).to.throw();
  });

  it("detects a symlink escape", async () => {
    const root = await createWorkspace();
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "platform-external-"),
    );

    const externalFile = path.join(externalRoot, "outside.txt");
    const symlinkPath = path.join(root, "escape");

    try {
      await fs.writeFile(
        externalFile,
        "synthetic file outside the deployment workspace",
        "utf8",
      );

      await fs.symlink(externalFile, symlinkPath, "file");

      let rejection;

      try {
        await verifyTree(root, 1024);
      } catch (error) {
        rejection = error;
      }

      expect(rejection).to.be.instanceOf(Error);
      expect(rejection.code).to.equal("SYMLINK_ESCAPE");
    } finally {
      await cleanup(root);
      await fs.rm(externalRoot, {
        recursive: true,
        force: true,
      });
    }
  });

  it("verifies workspace cleanup", async () => {
    for (const outcome of ["success", "failure", "cancellation"]) {
      const root = await createWorkspace();
      await fs.writeFile(path.join(root, outcome), "x");
      await cleanup(root);

      try {
        await fs.access(root);
        throw new Error("still exists");
      } catch (error) {
        expect(error.code).to.equal("ENOENT");
      }
    }
  });

  it("rejects host Docker socket dependency", async () => {
    const prior = process.env.DOCKER_HOST;
    process.env.DOCKER_HOST = "unix:///var/run/docker.sock";

    try {
      await new RootlessBuildKitExecutor().build({
        repository: "/tmp",
        contract: {
          root: ".",
          context: ".",
          dockerfile: "Dockerfile",
        },
        imageTag: "test",
      });

      throw new Error("expected rejection");
    } catch (error) {
      expect(error.code).to.equal("HOST_DOCKER_SOCKET_FORBIDDEN");
    } finally {
      if (prior === undefined) {
        delete process.env.DOCKER_HOST;
      } else {
        process.env.DOCKER_HOST = prior;
      }
    }
  });

  it("contains no Docker socket mount in worker definitions", async () => {
    const root = path.resolve(__dirname, "../../../..");

    for (const file of [
      "docker/docker-compose.pipeline.yml",
      "services/control-plane-api/Dockerfile.worker",
    ]) {
      const content = await fs.readFile(path.join(root, file), "utf8");
      expect(content).not.to.include("/var/run/docker.sock");
    }
  });

  it("enforces command timeout", async () => {
    const root = await createWorkspace();

    try {
      await run(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
        cwd: root,
        timeoutMs: 20,
      });

      throw new Error("expected timeout");
    } catch (error) {
      expect(error.code).to.equal("WORKER_TIMEOUT");
    } finally {
      await cleanup(root);
    }
  });

  it("recovers a failed worker attempt by retrying idempotently", async () => {
    const x = setup();

    const { deployment } = await x.store.create(
      x.u.id,
      x.o.id,
      x.input,
      "retry-worker",
    );

    const workspace = await createWorkspace();
    let calls = 0;

    const checkoutImpl = async ({ workspace: currentWorkspace }) => {
      const repo = path.join(currentWorkspace, "repository");

      await fs.mkdir(repo);

      await fs.writeFile(
        path.join(repo, "service.yml"),
        [
          "name: api",
          "port: 3000",
          "commands:",
          "  test: []",
          "  security: []",
          "",
        ].join("\n"),
      );

      return repo;
    };

    const pipeline = new DeploymentPipeline({
      store: x.store,
      repository: x.r,
      gitProvider: {
        refreshInstallationToken: async () =>
          "test-credential-never-log",
      },
      buildExecutor: new TestBuildExecutor(),
      workspaceFactory: async () => workspace,
      checkoutImpl,
      cleanupImpl: async (currentWorkspace) => {
        calls += 1;
        await cleanup(currentWorkspace);
      },
    });

    await pipeline.execute(deployment.id);

    expect(
      x.store.deployments.get(deployment.id).currentState,
    ).to.equal("build_complete");

    expect(calls).to.equal(1);
  });

  it("retries a failed worker attempt and records a second attempt", async () => {
    const x = setup();

    const { deployment } = await x.store.create(
      x.u.id,
      x.o.id,
      x.input,
      "retry-after-failure",
    );

    const checkoutImpl = async ({ workspace }) => {
      const repo = path.join(workspace, "repository");

      await fs.mkdir(repo);

      await fs.writeFile(
        path.join(repo, "service.yml"),
        [
          "name: api",
          "port: 3000",
          "commands: {}",
          "",
        ].join("\n"),
      );

      return repo;
    };

    const base = {
      store: x.store,
      repository: x.r,
      gitProvider: {
        refreshInstallationToken: async () =>
          "short-lived-test-token",
      },
      workspaceFactory: createWorkspace,
      checkoutImpl,
      cleanupImpl: cleanup,
    };

    let failure;

    try {
      await new DeploymentPipeline({
        ...base,
        buildExecutor: new TestBuildExecutor({
          fail: true,
        }),
      }).execute(deployment.id);
    } catch (error) {
      failure = error;
    }

    expect(failure).to.be.instanceOf(Error);

    expect(
      x.store.deployments.get(deployment.id).currentState,
    ).to.equal("failed");

    await new DeploymentPipeline({
      ...base,
      buildExecutor: new TestBuildExecutor(),
    }).execute(deployment.id);

    expect(
      x.store.deployments.get(deployment.id).currentState,
    ).to.equal("build_complete");

    expect(
      x.store.deployments.get(deployment.id).attemptCount,
    ).to.equal(2);
  });

  it("cancels an active build and never starts a later stage", async () => {
    const builder = new TestBuildExecutor({
      delay: 500,
    });

    const controller = new AbortController();

    const promise = builder.build({
      imageTag: "x",
      signal: controller.signal,
    });

    controller.abort();

    try {
      await promise;
      throw new Error("expected cancellation");
    } catch (error) {
      expect(error.code).to.equal("BUILD_CANCELLED");
    }
  });

  it("keeps the event loop responsive while three jobs are active", async () => {
    const builder = new TestBuildExecutor({
      delay: 30,
    });

    let responsive = false;

    const jobs = [1, 2, 3].map(() =>
      builder.build({
        imageTag: "test",
      }),
    );

    setImmediate(() => {
      responsive = true;
    });

    await Promise.all(jobs);

    expect(responsive).to.equal(true);
  });
});